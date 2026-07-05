//! UI-editor advanced mode: run a user's LuaU layout script in a locked-down
//! sandbox and return the presentation ops it produced.
//!
//! Security model (ground rule 2 — native FFI runs with full process access, so
//! the sandbox must be airtight by CONSTRUCTION, not by convention):
//!   * The Lua environment is created WITHOUT the standard libraries that reach
//!     outside the VM. mlua's `StdLib` bitflags let us include only the pure
//!     ones (string/table/math/bit/utf8) and omit `io`, `os`, `package`
//!     (`require`), and the debug library. There is no `require`, no file I/O,
//!     no process/env access, no FFI — the script literally has no symbol that
//!     can touch the host.
//!   * The ONLY host-provided surface is a `ui` table whose methods just push
//!     structured ops into a shared buffer. They can't read anything back about
//!     the machine, the app, or the user.
//!   * An instruction-count hook aborts a runaway/infinite-loop script so a bad
//!     layout can't wedge the app.
//!
//! The returned ops are the same vocabulary the TS `LayoutEngine` applies
//! (token override / region order / visibility / width), so advanced mode and
//! simple mode drive the exact same presentation layer.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use mlua::{Lua, LuaOptions, StdLib, Table, Value, Variadic, VmState};
use serde::Serialize;

/// One presentation op, mirroring the TS `LayoutEngine` vocabulary. Serialized
/// to the JSON the webview applies.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "op", rename_all = "camelCase")]
enum UiOp {
    /// Set a CSS custom property (design token), e.g. `--accent-primary`.
    SetToken { name: String, value: String },
    /// Set a region's flex order (lower = earlier).
    SetRegionOrder { anchor: String, order: i64 },
    /// Show/hide a region.
    SetRegionVisible { anchor: String, visible: bool },
    /// Fix a region's width in px.
    SetRegionWidth { anchor: String, width: i64 },
}

/// Cap on Luau interrupt ticks before we abort. Luau fires the interrupt
/// callback periodically (roughly per allocation / back-edge), so this bounds a
/// runaway/infinite-loop script without needing a precise instruction count.
/// Generous for any real layout script, tight enough to stop a hang.
const INTERRUPT_BUDGET: u64 = 2_000_000;

/// Run a LuaU layout script and return the ops it emitted as a JSON array
/// (the shape TS `applyLuaOps` consumes). A script error (syntax, runtime,
/// budget-exceeded) comes back as `Err(message)` for the editor to surface.
#[tauri::command]
pub fn ui_editor_run_lua(script: String) -> Result<serde_json::Value, String> {
    // Only the pure, host-isolated standard libs. NOT io/os/package/debug.
    let libs = StdLib::STRING | StdLib::TABLE | StdLib::MATH | StdLib::BIT | StdLib::UTF8;
    let lua = Lua::new_with(libs, LuaOptions::default())
        .map_err(|e| format!("failed to init Lua sandbox: {e}"))?;

    let ops: Arc<Mutex<Vec<UiOp>>> = Arc::new(Mutex::new(Vec::new()));

    // Abort a runaway script. Luau has no line/count debug hooks (those mlua
    // APIs are compiled out under the `luau` feature); it exposes `set_interrupt`
    // instead, a callback fired periodically by the VM. Counting ticks bounds
    // execution — return `Yield`-less `Should*`… actually `VmState::Continue`
    // normally, or an error to abort once the budget is spent.
    let ticks = Arc::new(AtomicU64::new(0));
    {
        let ticks = ticks.clone();
        lua.set_interrupt(move |_lua| {
            if ticks.fetch_add(1, Ordering::Relaxed) >= INTERRUPT_BUDGET {
                return Err(mlua::Error::RuntimeError(
                    "script ran too long (possible infinite loop)".into(),
                ));
            }
            Ok(VmState::Continue)
        });
    }

    // Build the `ui` table — the entire host surface the script can see.
    let ui = build_ui_table(&lua, ops.clone())
        .map_err(|e| format!("failed to build ui api: {e}"))?;
    lua.globals()
        .set("ui", ui)
        .map_err(|e| format!("failed to expose ui api: {e}"))?;

    // Remove any residual escape hatches. With the stdlib set above these are
    // already absent, but belt-and-suspenders: nil out anything that could load
    // code or reach the host if a future mlua default changes.
    for name in ["require", "dofile", "loadfile", "load", "loadstring", "collectgarbage", "os", "io", "package", "debug"] {
        let _ = lua.globals().set(name, Value::Nil);
    }

    lua.load(&script)
        .set_name("ui-layout")
        .exec()
        .map_err(|e| format!("{e}"))?;

    let collected = ops.lock().unwrap().clone();
    serde_json::to_value(&collected).map_err(|e| format!("serialize ops: {e}"))
}

fn build_ui_table(lua: &Lua, ops: Arc<Mutex<Vec<UiOp>>>) -> mlua::Result<Table> {
    let ui = lua.create_table()?;

    // ui.setToken("--accent-primary", "#8b5cf6")
    {
        let ops = ops.clone();
        ui.set(
            "setToken",
            lua.create_function(move |_, (name, value): (String, String)| {
                if !name.starts_with("--") {
                    return Err(mlua::Error::RuntimeError(
                        "token name must start with '--' (a CSS custom property)".into(),
                    ));
                }
                ops.lock().unwrap().push(UiOp::SetToken { name, value });
                Ok(())
            })?,
        )?;
    }

    // ui.moveRegion("app.guilds-layout.guild-list", 2)
    {
        let ops = ops.clone();
        ui.set(
            "moveRegion",
            lua.create_function(move |_, (anchor, order): (String, i64)| {
                ops.lock().unwrap().push(UiOp::SetRegionOrder { anchor, order });
                Ok(())
            })?,
        )?;
    }

    // ui.setRegionVisible("app...guild-list", false)
    {
        let ops = ops.clone();
        ui.set(
            "setRegionVisible",
            lua.create_function(move |_, (anchor, visible): (String, bool)| {
                ops.lock().unwrap().push(UiOp::SetRegionVisible { anchor, visible });
                Ok(())
            })?,
        )?;
    }

    // ui.setRegionWidth("app...guild-list", 320)
    {
        let ops = ops.clone();
        ui.set(
            "setRegionWidth",
            lua.create_function(move |_, (anchor, width): (String, i64)| {
                ops.lock().unwrap().push(UiOp::SetRegionWidth { anchor, width });
                Ok(())
            })?,
        )?;
    }

    // ui.log(...) — a safe print that goes nowhere host-side (kept so scripts
    // that debug-print don't error on a missing global). Accepts anything,
    // stringifies, discards. Not wired to stdout — this is a UI sandbox.
    ui.set(
        "log",
        lua.create_function(|_, _args: Variadic<Value>| Ok(()))?,
    )?;

    Ok(ui)
}
