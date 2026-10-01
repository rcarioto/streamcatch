# Install StreamCatch native messaging host for Firefox on Windows.
# Prefer Python 3 launchers; never assume bare "python" is Python 3.
$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

$script = Join-Path $PSScriptRoot "install_host.py"

function Test-Python3 {
    param([string]$Exe)
    try {
        & $Exe -c "import sys; raise SystemExit(0 if sys.version_info[0] >= 3 else 1)" 2>$null
        return ($LASTEXITCODE -eq 0)
    } catch {
        return $false
    }
}

if (Get-Command py -ErrorAction SilentlyContinue) {
    & py -3 $script
    exit $LASTEXITCODE
}

if (Get-Command python3 -ErrorAction SilentlyContinue) {
    & python3 $script
    exit $LASTEXITCODE
}

if (Get-Command python -ErrorAction SilentlyContinue) {
    if (Test-Python3 "python") {
        & python $script
        exit $LASTEXITCODE
    }
    Write-Error 'The "python" command on PATH is Python 2. Use: py -3 install_host.py'
}

Write-Error "Python 3 was not found on PATH. Install from https://www.python.org/downloads/ and enable Add python.exe to PATH."
