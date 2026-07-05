// Prevents an extra console window from popping up on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    fluxer_build_gui_lib::run()
}
