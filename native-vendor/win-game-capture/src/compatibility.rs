// SPDX-License-Identifier: AGPL-3.0-or-later

#![allow(dead_code)]

#[cfg(target_os = "windows")]
use std::path::Path;
use std::path::PathBuf;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum InjectionPolicy {
    Allow,
    ForceCpuReadback,
    Deny(String),
}

const HARD_DENY_PROCESS_NAMES: &[(&str, &str)] = &[
    ("easyanticheat.exe", "EasyAntiCheat"),
    ("easyanticheat_eos.exe", "EasyAntiCheat"),
    ("easyanticheat_launcher.exe", "EasyAntiCheat"),
    ("eac.exe", "EasyAntiCheat"),
    ("eac_launcher.exe", "EasyAntiCheat"),
    ("beservice.exe", "BattlEye"),
    ("beservice_x64.exe", "BattlEye"),
    ("bedaisy.exe", "BattlEye"),
    ("be_service.exe", "BattlEye"),
    ("vgc.exe", "Riot Vanguard"),
    ("vgk.exe", "Riot Vanguard"),
    ("vgtray.exe", "Riot Vanguard"),
    ("vanguard.exe", "Riot Vanguard"),
    ("destiny2.exe", "Destiny 2 anti-cheat policy"),
    ("equ8.exe", "EQU8 anti-cheat"),
    ("equ8_service.exe", "EQU8 anti-cheat"),
    ("gameguard.des", "nProtect GameGuard"),
    ("gamemon.des", "nProtect GameGuard"),
    ("gamemon64.des", "nProtect GameGuard"),
    ("npggnt.des", "nProtect GameGuard"),
    ("xigncode.exe", "XIGNCODE"),
    ("xigncode3.exe", "XIGNCODE3"),
    ("mhyprot.exe", "mhyprot anti-cheat"),
    ("mhyprot2.exe", "mhyprot anti-cheat"),
    ("anticheatexpert.exe", "Anti-Cheat Expert"),
    ("ace-base.exe", "Anti-Cheat Expert"),
    ("faceit.exe", "FACEIT Anti-cheat"),
    ("faceitclient.exe", "FACEIT Anti-cheat"),
    ("faceitservice.exe", "FACEIT Anti-cheat"),
    ("esea.exe", "ESEA Anti-cheat"),
    ("eseaclient.exe", "ESEA Anti-cheat"),
    ("eseaservice.exe", "ESEA Anti-cheat"),
    ("punkbuster.exe", "PunkBuster"),
    ("pnkbstra.exe", "PunkBuster"),
    ("pnkbstrb.exe", "PunkBuster"),
    ("system", "Windows kernel process"),
    ("csrss.exe", "Windows system process"),
    ("smss.exe", "Windows system process"),
    ("wininit.exe", "Windows system process"),
    ("winlogon.exe", "Windows system process"),
    ("services.exe", "Windows system process"),
    ("svchost.exe", "Windows service host"),
    ("dwm.exe", "Windows compositor"),
    ("fontdrvhost.exe", "Windows font driver host"),
    ("logonui.exe", "Windows secure desktop"),
    ("consent.exe", "Windows secure desktop"),
    ("secureuxhost.exe", "Windows secure desktop"),
    ("lsass.exe", "Windows security process"),
    ("lsaiso.exe", "Windows security process"),
    ("msmpeng.exe", "Microsoft Defender"),
    ("securityhealthservice.exe", "Windows Security"),
    ("securityhealthsystray.exe", "Windows Security"),
    ("audiodg.exe", "Windows protected audio graph"),
    ("wudfhost.exe", "Windows driver host"),
    ("taskhostw.exe", "Windows task host"),
    ("dllhost.exe", "Windows COM surrogate"),
    ("runtimebroker.exe", "Windows runtime broker"),
    ("applicationframehost.exe", "Windows application frame host"),
    ("lockapp.exe", "Windows lock screen"),
    ("sihost.exe", "Windows shell infrastructure"),
    ("startmenuexperiencehost.exe", "Windows shell"),
    ("searchhost.exe", "Windows shell"),
    ("searchapp.exe", "Windows shell"),
    ("textinputhost.exe", "Windows shell"),
    ("explorer.exe", "Windows shell"),
    ("taskmgr.exe", "Windows administrative tool"),
    ("regedit.exe", "Windows administrative tool"),
    ("mmc.exe", "Windows administrative tool"),
    ("obs32.exe", "capture application"),
    ("obs64.exe", "capture application"),
    ("fluxer.exe", "Fluxer application"),
    ("fluxer-desktop.exe", "Fluxer application"),
    ("fluxer_desktop.exe", "Fluxer application"),
];

const COMPATIBILITY_DENY_PROCESS_NAMES: &[(&str, &str)] = &[
    ("gta-sa.exe", "legacy D3D8/RenderWare compatibility"),
    ("samp.exe", "legacy D3D8/RenderWare compatibility"),
    ("leagueclientux.exe", "League of Legends launcher"),
    ("steamwebhelper.exe", "Chromium-based launcher"),
    ("epicgameslauncher.exe", "Chromium-based launcher"),
    ("riotclientux.exe", "Riot client"),
    ("riotclientservices.exe", "Riot client"),
    ("battle.net.exe", "Chromium-based launcher"),
    ("gamingservices.exe", "Xbox Gaming Services"),
    ("gamingservicesnet.exe", "Xbox Gaming Services"),
];

const COMPATIBILITY_DENY_WINDOW_CLASSES: &[(&str, &str)] = &[
    ("chrome_widgetwin_0", "Chromium-based game window"),
    ("chrome_widgetwin_1", "Chromium-based game window"),
    (
        "gamingservicesui_hosting_window_class",
        "Xbox Gaming Services",
    ),
];

const FORCE_CPU_PROCESS_NAMES: &[&str] = &["terraria.exe"];

const OVERRIDE_FILE_NAME: &str = "compatibility.json";

pub fn injection_policy(target_pid: u32) -> InjectionPolicy {
    let exe_name = match target_process_exe_name(target_pid) {
        Some(name) => name,
        None => {
            return InjectionPolicy::Allow;
        }
    };
    evaluate_policy(&exe_name, None, load_override())
}

#[cfg(target_os = "windows")]
pub fn injection_policy_for_window(
    target_pid: u32,
    hwnd: windows_sys::Win32::Foundation::HWND,
) -> InjectionPolicy {
    let exe_name = match target_process_exe_name(target_pid) {
        Some(name) => name,
        None => {
            return InjectionPolicy::Allow;
        }
    };
    evaluate_policy(
        &exe_name,
        target_window_class_name(hwnd).as_deref(),
        load_override(),
    )
}

fn evaluate_policy(
    exe_name: &str,
    window_class: Option<&str>,
    override_lists: Option<OverrideLists>,
) -> InjectionPolicy {
    let exe_name_lower = file_name_lower(exe_name);
    let exe_name_lower = exe_name_lower.as_str();
    let window_class_lower = window_class.map(|name| name.trim().to_ascii_lowercase());
    let window_class_lower = window_class_lower.as_deref();

    if let Some(lists) = override_lists.as_ref() {
        if let Some(reason) = embedded_hard_deny_reason(exe_name_lower) {
            return reason;
        }
        if lists.deny.iter().any(|name| name == exe_name_lower) {
            return InjectionPolicy::Deny(format!(
                "{exe_name_lower} is on the local compatibility deny list; Fluxer will not inject \
                 its game-capture hook"
            ));
        }
        let allowed_by_override = lists.allow.iter().any(|name| name == exe_name_lower);
        if !allowed_by_override
            && let Some(reason) = embedded_compatibility_deny_reason(exe_name_lower)
        {
            return reason;
        }
        if !allowed_by_override
            && let Some(reason) = embedded_window_class_deny_reason(window_class_lower)
        {
            return reason;
        }
        if lists.force_cpu.iter().any(|name| name == exe_name_lower) {
            return InjectionPolicy::ForceCpuReadback;
        }
        if allowed_by_override {
            return InjectionPolicy::Allow;
        }
    } else {
        if let Some(reason) = embedded_hard_deny_reason(exe_name_lower) {
            return reason;
        }
        if let Some(reason) = embedded_compatibility_deny_reason(exe_name_lower) {
            return reason;
        }
        if let Some(reason) = embedded_window_class_deny_reason(window_class_lower) {
            return reason;
        }
    }

    if FORCE_CPU_PROCESS_NAMES.contains(&exe_name_lower) {
        return InjectionPolicy::ForceCpuReadback;
    }
    InjectionPolicy::Allow
}

fn embedded_hard_deny_reason(exe_name_lower: &str) -> Option<InjectionPolicy> {
    HARD_DENY_PROCESS_NAMES
        .iter()
        .find(|(name, _)| *name == exe_name_lower)
        .map(|(_, label)| {
            InjectionPolicy::Deny(format!(
                "{exe_name_lower} is protected by {label}; Fluxer will not inject its game-capture \
                 hook into anti-cheat or security-sensitive processes"
            ))
        })
}

fn embedded_compatibility_deny_reason(exe_name_lower: &str) -> Option<InjectionPolicy> {
    COMPATIBILITY_DENY_PROCESS_NAMES
        .iter()
        .find(|(name, _)| *name == exe_name_lower)
        .map(|(_, label)| {
            InjectionPolicy::Deny(format!(
                "{exe_name_lower} has known game-capture compatibility issues ({label}); Fluxer \
                 will not inject its game-capture hook by default"
            ))
        })
}

fn embedded_window_class_deny_reason(window_class_lower: Option<&str>) -> Option<InjectionPolicy> {
    let window_class_lower = window_class_lower?;
    COMPATIBILITY_DENY_WINDOW_CLASSES
        .iter()
        .find(|(name, _)| *name == window_class_lower)
        .map(|(_, label)| {
            InjectionPolicy::Deny(format!(
                "window class {window_class_lower} has known OBS game-capture compatibility issues \
                 ({label}); Fluxer will not inject its game-capture hook by default"
            ))
        })
}

#[derive(Debug, Default, Clone, PartialEq, Eq)]
struct OverrideLists {
    deny: Vec<String>,
    allow: Vec<String>,
    force_cpu: Vec<String>,
}

impl OverrideLists {
    fn is_empty(&self) -> bool {
        self.deny.is_empty() && self.allow.is_empty() && self.force_cpu.is_empty()
    }
}

fn load_override() -> Option<OverrideLists> {
    let path = override_file_path()?;
    let contents = std::fs::read_to_string(&path).ok()?;
    let lists = parse_override_json(&contents);
    if lists.is_empty() { None } else { Some(lists) }
}

fn override_file_path() -> Option<PathBuf> {
    if let Some(dir) = addon_directory() {
        let candidate = dir.join(OVERRIDE_FILE_NAME);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    let exe_dir = std::env::current_exe().ok()?.parent()?.to_path_buf();
    let candidate = exe_dir.join(OVERRIDE_FILE_NAME);
    if candidate.is_file() {
        Some(candidate)
    } else {
        None
    }
}

#[cfg(target_os = "windows")]
fn addon_directory() -> Option<PathBuf> {
    use std::os::windows::ffi::OsStringExt;
    use windows_sys::Win32::Foundation::HMODULE;
    use windows_sys::Win32::System::LibraryLoader::{
        GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS, GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
        GetModuleFileNameW, GetModuleHandleExW,
    };

    let mut module: HMODULE = std::ptr::null_mut();
    let ok = unsafe {
        GetModuleHandleExW(
            GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
            addon_directory as *const u16,
            &mut module,
        )
    };
    if ok == 0 || module.is_null() {
        return None;
    }
    let mut buffer = vec![0u16; 1024];
    let len = unsafe { GetModuleFileNameW(module, buffer.as_mut_ptr(), buffer.len() as u32) };
    if len == 0 || len as usize >= buffer.len() {
        return None;
    }
    buffer.truncate(len as usize);
    let module_path = PathBuf::from(std::ffi::OsString::from_wide(&buffer));
    module_path.parent().map(Path::to_path_buf)
}

#[cfg(not(target_os = "windows"))]
fn addon_directory() -> Option<PathBuf> {
    None
}

#[cfg(target_os = "windows")]
fn target_process_exe_name(pid: u32) -> Option<String> {
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Threading::{
        OpenProcess, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
        QueryFullProcessImageNameW,
    };

    if pid == 0 {
        return None;
    }
    let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
    if handle.is_null() {
        return None;
    }
    let mut buffer = vec![0u16; 1024];
    let mut size = buffer.len() as u32;
    let ok = unsafe {
        QueryFullProcessImageNameW(handle, PROCESS_NAME_WIN32, buffer.as_mut_ptr(), &mut size)
    };
    unsafe {
        CloseHandle(handle);
    }
    if ok == 0 || size == 0 || size as usize > buffer.len() {
        return None;
    }
    let full_path: String = String::from_utf16_lossy(&buffer[..size as usize]);
    Some(file_name_lower(&full_path))
}

#[cfg(target_os = "windows")]
fn target_window_class_name(hwnd: windows_sys::Win32::Foundation::HWND) -> Option<String> {
    use windows_sys::Win32::UI::WindowsAndMessaging::GetClassNameW;

    if hwnd.is_null() {
        return None;
    }
    let mut buffer = vec![0u16; 256];
    let len = unsafe { GetClassNameW(hwnd, buffer.as_mut_ptr(), buffer.len() as i32) };
    if len <= 0 {
        return None;
    }
    buffer.truncate(len as usize);
    Some(
        String::from_utf16_lossy(&buffer)
            .trim()
            .to_ascii_lowercase(),
    )
}

#[cfg(not(target_os = "windows"))]
fn target_process_exe_name(_pid: u32) -> Option<String> {
    None
}

fn file_name_lower(path: &str) -> String {
    path.rsplit(['\\', '/'])
        .next()
        .unwrap_or(path)
        .trim()
        .to_ascii_lowercase()
}

fn parse_override_json(text: &str) -> OverrideLists {
    let mut force_cpu = extract_string_array(text, "forceCpu");
    force_cpu.extend(extract_string_array(text, "force_cpu"));
    OverrideLists {
        deny: extract_string_array(text, "deny"),
        allow: extract_string_array(text, "allow"),
        force_cpu,
    }
}

fn extract_string_array(text: &str, key: &str) -> Vec<String> {
    let needle = format!("\"{key}\"");
    let mut search_from = 0usize;
    while let Some(rel) = text[search_from..].find(&needle) {
        let key_pos = search_from + rel;
        let after_key = key_pos + needle.len();
        let rest = text[after_key..].trim_start();
        if let Some(rest) = rest.strip_prefix(':') {
            let rest = rest.trim_start();
            if let Some(array_body) = rest.strip_prefix('[')
                && let Some(end) = array_body.find(']')
            {
                return parse_json_string_list(&array_body[..end]);
            }
        }
        search_from = after_key;
    }
    Vec::new()
}

fn parse_json_string_list(body: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut chars = body.char_indices().peekable();
    while let Some((_, ch)) = chars.next() {
        if ch != '"' {
            continue;
        }
        let mut value = String::new();
        let mut closed = false;
        while let Some((_, c)) = chars.next() {
            match c {
                '\\' => {
                    if let Some((_, escaped)) = chars.next() {
                        match escaped {
                            'n' => value.push('\n'),
                            't' => value.push('\t'),
                            'r' => value.push('\r'),
                            other => value.push(other),
                        }
                    }
                }
                '"' => {
                    closed = true;
                    break;
                }
                other => value.push(other),
            }
        }
        if closed {
            let normalised = file_name_lower(&value);
            if !normalised.is_empty() {
                out.push(normalised);
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn embedded_deny_matches_anticheat() {
        match evaluate_policy("easyanticheat.exe", None, None) {
            InjectionPolicy::Deny(reason) => assert!(reason.contains("EasyAntiCheat")),
            other => panic!("expected Deny, got {other:?}"),
        }
        match evaluate_policy("beservice.exe", None, None) {
            InjectionPolicy::Deny(reason) => assert!(reason.contains("BattlEye")),
            other => panic!("expected Deny, got {other:?}"),
        }
        match evaluate_policy("vgc.exe", None, None) {
            InjectionPolicy::Deny(reason) => assert!(reason.contains("Vanguard")),
            other => panic!("expected Deny, got {other:?}"),
        }
        match evaluate_policy("destiny2.exe", None, None) {
            InjectionPolicy::Deny(reason) => assert!(reason.contains("Destiny 2")),
            other => panic!("expected Deny, got {other:?}"),
        }
    }

    #[test]
    fn embedded_deny_matches_security_sensitive_windows_processes() {
        for name in [
            "lsass.exe",
            "dwm.exe",
            "explorer.exe",
            "applicationframehost.exe",
            "obs64.exe",
            "fluxer-desktop.exe",
        ] {
            match evaluate_policy(name, None, None) {
                InjectionPolicy::Deny(reason) => {
                    assert!(reason.contains("security-sensitive") || reason.contains("protected"))
                }
                other => panic!("expected Deny for {name}, got {other:?}"),
            }
        }
    }

    #[test]
    fn unknown_process_is_allowed() {
        assert_eq!(
            evaluate_policy("mygame.exe", None, None),
            InjectionPolicy::Allow
        );
    }

    #[test]
    fn override_deny_wins() {
        let lists = parse_override_json(r#"{ "deny": ["MyGame.exe"] }"#);
        match evaluate_policy("mygame.exe", None, Some(lists)) {
            InjectionPolicy::Deny(_) => {}
            other => panic!("expected Deny, got {other:?}"),
        }
    }

    #[test]
    fn override_allow_cannot_unblock_hard_deny() {
        let lists = parse_override_json(r#"{ "allow": ["easyanticheat.exe"] }"#);
        match evaluate_policy("easyanticheat.exe", None, Some(lists)) {
            InjectionPolicy::Deny(reason) => assert!(reason.contains("EasyAntiCheat")),
            other => panic!("expected hard Deny, got {other:?}"),
        }
    }

    #[test]
    fn override_allow_unblocks_soft_compatibility_deny() {
        let lists = parse_override_json(r#"{ "allow": ["LeagueClientUx.exe"] }"#);
        assert_eq!(
            evaluate_policy("LeagueClientUx.exe", None, Some(lists)),
            InjectionPolicy::Allow
        );
    }

    #[test]
    fn override_allow_plus_force_cpu_unblocks_soft_deny_with_cpu_readback() {
        let lists = parse_override_json(
            r#"{ "allow": ["LeagueClientUx.exe"], "forceCpu": ["LeagueClientUx.exe"] }"#,
        );
        assert_eq!(
            evaluate_policy("LeagueClientUx.exe", None, Some(lists)),
            InjectionPolicy::ForceCpuReadback
        );
    }

    #[test]
    fn override_force_cpu_applies() {
        let lists = parse_override_json(r#"{ "forceCpu": ["weird.exe"] }"#);
        assert_eq!(
            evaluate_policy("weird.exe", None, Some(lists)),
            InjectionPolicy::ForceCpuReadback
        );
    }

    #[test]
    fn embedded_force_cpu_applies_for_known_cross_adapter_case() {
        assert_eq!(
            evaluate_policy("Terraria.exe", None, None),
            InjectionPolicy::ForceCpuReadback
        );
    }

    #[test]
    fn local_force_cpu_cannot_override_hard_deny() {
        let lists = parse_override_json(r#"{ "forceCpu": ["lsass.exe"] }"#);
        match evaluate_policy("lsass.exe", None, Some(lists)) {
            InjectionPolicy::Deny(reason) => assert!(reason.contains("security-sensitive")),
            other => panic!("expected hard Deny, got {other:?}"),
        }
    }

    #[test]
    fn force_cpu_snake_case_alias_parses() {
        let lists = parse_override_json(r#"{ "force_cpu": ["weird.exe"] }"#);
        assert!(lists.force_cpu.contains(&"weird.exe".to_string()));
    }

    #[test]
    fn embedded_window_class_deny_matches_obs_chromium_game_windows() {
        match evaluate_policy("game.exe", Some("Chrome_WidgetWin_1"), None) {
            InjectionPolicy::Deny(reason) => assert!(reason.contains("Chromium")),
            other => panic!("expected Deny, got {other:?}"),
        }
    }

    #[test]
    fn embedded_window_class_deny_matches_xbox_gaming_services() {
        match evaluate_policy(
            "game.exe",
            Some("GamingServicesUI_Hosting_Window_Class"),
            None,
        ) {
            InjectionPolicy::Deny(reason) => assert!(reason.contains("Xbox Gaming Services")),
            other => panic!("expected Deny, got {other:?}"),
        }
    }

    #[test]
    fn override_allow_unblocks_soft_window_class_deny() {
        let lists = parse_override_json(r#"{ "allow": ["game.exe"] }"#);
        assert_eq!(
            evaluate_policy("game.exe", Some("Chrome_WidgetWin_0"), Some(lists)),
            InjectionPolicy::Allow
        );
    }

    #[test]
    fn parser_normalises_paths_and_ignores_garbage() {
        let lists = parse_override_json(
            r#"{ "deny": ["C:\\Games\\Foo\\Foo.exe", "/opt/bar/Bar.EXE", 123, null] }"#,
        );
        assert_eq!(lists.deny, vec!["foo.exe", "bar.exe"]);
    }

    #[test]
    fn malformed_json_yields_empty() {
        let lists = parse_override_json("not json at all");
        assert!(lists.is_empty());
    }

    #[test]
    fn file_name_lower_handles_both_separators() {
        assert_eq!(file_name_lower("C:\\A\\B\\Game.EXE"), "game.exe");
        assert_eq!(file_name_lower("/a/b/Game.EXE"), "game.exe");
        assert_eq!(file_name_lower("bare.exe"), "bare.exe");
    }
}
