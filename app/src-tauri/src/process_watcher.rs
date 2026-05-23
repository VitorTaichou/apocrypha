use sysinfo::System;

/// Returns true if Elder Scrolls Online appears to be running. Used to skip
/// background addon updates while the game is reading from the AddOns folder.
///
/// Matches the standard ESO process names on Windows and through Proton on
/// Linux/Steam Deck (where Proton runs the same Windows `eso64.exe` binary).
pub fn is_eso_running() -> bool {
    let system = System::new_all();

    for (_, process) in system.processes() {
        let name = process.name().to_string_lossy().to_lowercase();
        if name == "eso64.exe"
            || name == "eso.exe"
            || name == "eso64"
            || name == "eso"
            || name.starts_with("eso64.")
        {
            return true;
        }
    }
    false
}
