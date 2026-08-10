# Brief 174 desktop runtime baseline

This is the evidence template for the release-only lifecycle work. The
PowerShell collector is read-only unless an explicit `-OutputPath` is passed;
it does not terminate processes, enumerate unrelated Edge instances, or print
command-line bodies. It records process roles, working set, and private bytes.

Run it from the desktop repository after building the requested configuration:

```powershell
.\scripts\desktop-runtime-baseline.ps1 -BuildType release -Scene cold-start
```

For a bounded sample window, add `-DurationSeconds 600 -SampleIntervalSeconds
5`. If more than one Tauri root is running, pass the intended PID explicitly.
Capture the same scenes on the same machine/configuration:

| Scene | Build | Root PID | WebView roles | Peak private bytes | Recovered after close | Notes |
|---|---|---:|---|---:|---|---|
| cold start, 30 s |  |  |  |  |  |  |
| idle, 10 min |  |  |  |  |  |  |
| Pet open/close |  |  |  |  |  |  |
| Presence Nag show/close |  |  |  |  |  |  |
| Room/Dream/Diary Detail |  |  |  |  |  |  |
| ten open/close toggles |  |  |  |  |  |  |

Debug captures are useful diagnostics, but are not release acceptance. Final
acceptance still requires a real Windows release run with continuous toggling
and process-level memory observations.
