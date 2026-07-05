// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Advanced-mode bridge: hand a user's LuaU script to the Rust sandbox, receive
// the presentation ops it produced, and fold them into a Layout the
// LayoutEngine can apply. The Lua VM itself lives in Rust (no fs/net/process
// reach); this file is just the transport + op→Layout translation.

import {getElectronAPI} from '@app/features/ui/utils/NativeUtils';
import {type Layout, type RegionTweak} from './LayoutEngine';

/** Ops emitted by the Rust sandbox (mirrors ui_editor.rs's UiOp serde shape). */
type LuaOp =
	| {op: 'setToken'; name: string; value: string}
	| {op: 'setRegionOrder'; anchor: string; order: number}
	| {op: 'setRegionVisible'; anchor: string; visible: boolean}
	| {op: 'setRegionWidth'; anchor: string; width: number};

export interface LuaRunResult {
	ok: boolean;
	layout?: Layout;
	error?: string;
}

/** Fold a flat op list into a Layout (tokens map + per-anchor region tweaks). */
function opsToLayout(name: string, ops: LuaOp[]): Layout {
	const tokens: Record<string, string> = {};
	const regionMap = new Map<string, RegionTweak>();

	const region = (anchor: string): RegionTweak => {
		let r = regionMap.get(anchor);
		if (!r) {
			r = {anchor};
			regionMap.set(anchor, r);
		}
		return r;
	};

	for (const op of ops) {
		switch (op.op) {
			case 'setToken':
				tokens[op.name] = op.value;
				break;
			case 'setRegionOrder':
				region(op.anchor).order = op.order;
				break;
			case 'setRegionVisible':
				region(op.anchor).hidden = !op.visible;
				break;
			case 'setRegionWidth':
				region(op.anchor).widthPx = op.width;
				break;
		}
	}

	return {version: 1, name, tokens, regions: [...regionMap.values()]};
}

/** Run a LuaU layout script; returns the resulting Layout or an error string.
 * `name` is the layout name to stamp on the produced Layout. */
export async function runLuaLayout(script: string, name: string): Promise<LuaRunResult> {
	const shell = getElectronAPI() as
		| {uiEditorRunLua?: (s: string) => Promise<{ok: boolean; ops?: unknown[]; error?: string}>}
		| null;
	if (!shell?.uiEditorRunLua) {
		return {ok: false, error: 'Advanced mode requires the desktop app.'};
	}
	const result = await shell.uiEditorRunLua(script);
	if (!result.ok) {
		return {ok: false, error: result.error ?? 'Script failed.'};
	}
	return {ok: true, layout: opsToLayout(name, (result.ops as LuaOp[]) ?? [])};
}

/** Default script shown in the advanced editor — documents the whole `ui` API
 * surface by example, and is itself a valid no-op-ish starting layout. */
export const DEFAULT_LUA_SCRIPT = `-- Ruxer layout script (LuaU, sandboxed).
-- The 'ui' table is the only thing available. No files, no network.

-- Recolor the accent used across buttons, links and highlights:
ui.setToken("--accent-primary", "#8b5cf6")

-- Reorder the major regions (lower number = further left):
-- ui.moveRegion("app.guilds-layout.guild-list.guild-list-scroller-wrapper", 1)
-- ui.moveRegion("app.guilds-layout.content-container", 2)

-- Resize a sidebar to a fixed width:
-- ui.setRegionWidth("app.guilds-layout.guild-list.guild-list-scroller-wrapper", 84)

-- Hide a region entirely:
-- ui.setRegionVisible("app.guilds-layout.guild-list.guild-list-scroller-wrapper", false)

-- Plain Lua works too (loops, math, string, table):
for i = 1, 3 do
  ui.log("iteration " .. i)
end
`;
