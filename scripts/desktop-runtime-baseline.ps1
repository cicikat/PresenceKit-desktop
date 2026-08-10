[CmdletBinding()]
param(
    [int]$RootPid = 0,
    [ValidateSet('debug', 'release', 'unknown')]
    [string]$BuildType = 'unknown',
    [ValidateRange(0, 3600)]
    [int]$DurationSeconds = 0,
    [ValidateRange(1, 60)]
    [int]$SampleIntervalSeconds = 5,
    [string]$Scene = 'manual',
    [string]$OutputPath
)

$ErrorActionPreference = 'Stop'
$warnings = @()

function Get-DescendantPids {
    param([int]$Pid, [object[]]$Rows)
    $children = @($Rows | Where-Object { $_.ParentProcessId -eq $Pid })
    foreach ($child in $children) {
        $child.ProcessId
        Get-DescendantPids -Pid ([int]$child.ProcessId) -Rows $Rows
    }
}

function Get-ProcessSnapshot {
    param([object[]]$Rows, [int]$SelectedRootPid)

    $selected = @()
    if ($SelectedRootPid -gt 0) {
        $selected = @($SelectedRootPid) + @(Get-DescendantPids -Pid $SelectedRootPid -Rows $Rows)
    }

    $processes = foreach ($row in $Rows) {
        $isWebView = $row.Name -ieq 'msedgewebview2.exe'
        $isRoot = $SelectedRootPid -gt 0 -and $row.ProcessId -eq $SelectedRootPid
        $isDescendant = $selected -contains [int]$row.ProcessId
        if (-not ($isRoot -or $isDescendant -or $isWebView)) { continue }
        $role = if ($row.CommandLine -match 'window=pet') { 'pet' }
            elseif ($row.CommandLine -match 'window=presence-nag') { 'presence-nag' }
            elseif ($row.CommandLine -match 'window=diary-detail') { 'diary-detail' }
            elseif ($isRoot) { 'tauri-root' }
            elseif ($isWebView) { 'webview2' }
            else { 'child' }
        $memory = $null
        try {
            $p = Get-Process -Id ([int]$row.ProcessId) -ErrorAction Stop
            $memory = [ordered]@{
                workingSetBytes = [int64]$p.WorkingSet64
                privateBytes = [int64]$p.PrivateMemorySize64
            }
        } catch { }
        [ordered]@{
            pid = [int]$row.ProcessId
            parentPid = [int]$row.ParentProcessId
            name = [string]$row.Name
            role = $role
            memory = $memory
        }
    }

    [ordered]@{
        capturedAt = (Get-Date).ToUniversalTime().ToString('o')
        rootPid = if ($SelectedRootPid -gt 0) { $SelectedRootPid } else { $null }
        processes = @($processes)
    }
}

$repoSha = (& git rev-parse HEAD 2>$null).Trim()
$os = $null
$allRows = @()
try {
    $os = Get-CimInstance Win32_OperatingSystem
    $allRows = @(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name, CommandLine)
} catch {
    $warnings += "WMI process/OS query unavailable: $($_.Exception.Message)"
}
$rootCandidates = @($allRows | Where-Object {
    $_.Name -ieq 'tauri-app.exe' -or ($_.Name -ieq 'PresenceKit-desktop.exe')
} | ForEach-Object { [ordered]@{ pid = [int]$_.ProcessId; name = [string]$_.Name } })

if ($RootPid -eq 0 -and $rootCandidates.Count -eq 1) {
    $RootPid = $rootCandidates[0].pid
}

$samples = @()
$end = (Get-Date).AddSeconds($DurationSeconds)
do {
    $rows = @()
    try {
        $rows = @(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name, CommandLine)
    } catch {
        $warnings += "WMI process query unavailable during sample: $($_.Exception.Message)"
    }
    $samples += Get-ProcessSnapshot -Rows $rows -SelectedRootPid $RootPid
    if ($DurationSeconds -le 0 -or (Get-Date) -ge $end) { break }
    Start-Sleep -Seconds $SampleIntervalSeconds
} while ((Get-Date) -lt $end)

$result = [ordered]@{
    brief = '174'
    scene = $Scene
    buildType = $BuildType
    capturedAt = (Get-Date).ToUniversalTime().ToString('o')
    repositorySha = $repoSha
    windows = [ordered]@{
        caption = if ($os) { $os.Caption } else { $null }
        version = if ($os) { $os.Version } else { $null }
        buildNumber = if ($os) { $os.BuildNumber } else { $null }
    }
    warnings = @($warnings | Select-Object -Unique)
    rootCandidates = @($rootCandidates)
    samples = @($samples)
}

$json = $result | ConvertTo-Json -Depth 8
if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $json
} else {
    $parent = Split-Path -Parent $OutputPath
    if (-not [string]::IsNullOrWhiteSpace($parent)) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
    Set-Content -LiteralPath $OutputPath -Value $json -Encoding UTF8
    Write-Output $OutputPath
}
