$ErrorActionPreference = 'Stop'
Push-Location (Join-Path $PSScriptRoot '..')
try {
    New-Item -ItemType Directory -Force '.tmp/ual' | Out-Null
    foreach ($entry in @(@('ual1', 'universal_animation_librarystandard.zip'), @('ual2', 'universal_animation_library_2standard.zip'))) {
        $zip = '.tmp/ual/' + $entry[0] + '.zip'
        if (-not (Test-Path -LiteralPath $zip)) {
            & curl.exe --noproxy '*' -L --fail ('https://opengameart.org/sites/default/files/' + $entry[1]) -o $zip
            if ($LASTEXITCODE -ne 0) { throw 'UAL download failed' }
        }
        Expand-Archive -LiteralPath $zip -DestinationPath ('.tmp/ual/' + $entry[0]) -Force
    }
    $inputs = @{
        'quaternius-ual1-v1.glb' = '.tmp/ual/ual1/Animation Library[Standard]/Godot/AnimationLibrary_Godot_Standard.glb'
        'quaternius-ual2-v1.glb' = '.tmp/ual/ual2/Universal Animation Library 2 [Standard]/Unreal-Godot/UAL2_Standard.glb'
        'tv-idle-v1.glb' = 'public/room/character/TV_Character_Rigged_v03.glb'
    }
    foreach ($name in $inputs.Keys) {
        $output = 'public/room/character/motions/' + $name
        if (-not (Test-Path -LiteralPath $output)) {
            & node 'scripts/extract-shared-motion.mjs' $inputs[$name] $output
            if ($LASTEXITCODE -ne 0) { throw 'Motion extraction failed' }
        }
    }
    # Vite must already be running at localhost:1420; only local files are read.
    & node 'scripts/bake-ual-motion.mjs'
    if ($LASTEXITCODE -ne 0) { throw 'Offline bake failed' }
    $catalog = 'public/room/character/motions/library.json'
    if (Test-Path -LiteralPath $catalog) {
        Copy-Item -LiteralPath $catalog -Destination ($catalog + '.backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
    }
    Copy-Item -LiteralPath 'docs/examples/tv-authored-motion-library.json' -Destination $catalog
    Copy-Item -LiteralPath '.tmp/ual/ual1/Animation Library[Standard]/License.txt' -Destination 'public/room/character/motions/UAL1-License.txt'
    Copy-Item -LiteralPath '.tmp/ual/ual2/Universal Animation Library 2 [Standard]/License.txt' -Destination 'public/room/character/motions/UAL2-License.txt'
    & node 'scripts/audit-ual-provenance.mjs'
    if ($LASTEXITCODE -ne 0) { throw 'Provenance audit failed' }
} finally { Pop-Location }
