param([string]$Python = "python")
$ErrorActionPreference = "Stop"
$Repo = Split-Path -Parent $PSScriptRoot
$Sidecar = Join-Path $Repo "browser-sidecar"
$Venv = Join-Path $Sidecar ".venv"
if (!(Test-Path -LiteralPath $Sidecar)) { throw "sidecar source missing" }
& node (Join-Path $PSScriptRoot "build-preview-runtime.mjs")
if ($LASTEXITCODE) { throw "trusted preview runtime build failed; run npm ci in the desktop checkout first" }
& $Python -m venv $Venv
if ($LASTEXITCODE) { throw "venv failed" }
$Interpreter = Join-Path $Venv "Scripts/python.exe"
& $Interpreter -m pip install "playwright==1.58.0" "pyinstaller==6.19.0"
if ($LASTEXITCODE) { throw "dependency installation failed" }
$env:PLAYWRIGHT_BROWSERS_PATH = "0"
& $Interpreter -m playwright install chromium
if ($LASTEXITCODE) { throw "Chromium installation failed" }
& $Interpreter -m PyInstaller --noconfirm --onedir --console --name workbench --collect-all playwright --add-data "$(Join-Path $Sidecar '.preview-runtime');preview-runtime" --distpath (Join-Path $Sidecar "runtime") --workpath (Join-Path $Sidecar ".build") --specpath (Join-Path $Sidecar ".build") (Join-Path $Sidecar "workbench.py")
if ($LASTEXITCODE) { throw "sidecar packaging failed" }
