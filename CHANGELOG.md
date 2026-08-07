# Changelog

All notable changes to Mojo Input Manager are documented here.

## [1.2.0] - 2026-08-07

### Added
- **Macro** action: a fixed sequence of press/release/wait steps played on every physical button press, targeting any vJoy button per step
- A live **output indicator** in the Advanced Mapping editor showing which vJoy button a Macro, Tempo, or Hat Buttons pipeline currently has asserted, no need to keep Windows' Game Controllers panel open to check

### Fixed
- Switching between action types (Single Press/Tap-Hold/Macro, and Response Curve/Deadzone/Hat Buttons) no longer wipes the other type's saved configuration
- Smoother, non-abrupt transitions when switching between action types

## [1.1.0] - 2026-08-07

### Added
- **Advanced Mapping**: per-input rules on top of the existing Live Mapping, described in plain sentences ("Normally, it does X", "While holding [button], instead it does Y"), no modes/bindings/sequences jargon exposed
- A single designated **Shift key** per profile: hold it to switch any other input to its alternate behavior, instead of picking a trigger for every condition individually
- Per-axis **invert, deadzone, and curve** shaping
- **Tempo** action: a quick tap and a press held past a threshold press two different vJoy buttons on the same physical button
- **Hat Buttons** action: for hardware that reports a directional hat as a single axis with a handful of fixed values instead of continuous movement, live-calibrated per device with a hands-free wizard, no universal value assumed
- **Named game profiles** for Mapping: save a full mapping setup under a name and switch between games with one click
- **Profile export/import** from Settings, for backing up or moving mappings to a new setup on the same hardware
- **Launch at startup** option, moved into Settings
- **"Test in Windows"** shortcut inside the Advanced Mapping rule editor, opens Windows' native Game Controllers panel to verify live vJoy output without leaving the app

## [1.0.0] - 2026-08-01

Initial release: vJoy virtual device automation, live Mapping (physical device to vJoy forwarding via the Gamepad API), and HidHide-based Device Filtering with save-and-apply profiles per game.
