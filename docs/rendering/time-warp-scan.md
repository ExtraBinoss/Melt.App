# Retired Time Warp Scan

Time Warp Scan is no longer offered by the effect picker, command search or shortcut catalogue, and it performs no GPU rendering or temporal sampling. Its temporal source compositor, clocks and replay caches have been removed.

The portable `time-warp-scan` identifier and parameter validation schema remain solely for existing projects, Motion keys, saved presets and undo/history records. These records still validate and open; the retired effect is ignored during rendering and hidden from the Inspector. Other effects on the same layer continue normally.
