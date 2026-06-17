param(
    [string]$Dst = "$env:USERPROFILE\Documents\GitHub\HEAT-FUSE-PRIVATE",
    [string]$Message = ""
)

$Src = $PSScriptRoot | Split-Path  # repo root (scripts/../)

if (-not (Test-Path $Dst)) {
    Write-Error "Private repo not found at '$Dst'. Clone it first:"
    Write-Error "  git clone https://github.com/AETERNAL/HEAT-FUSE-PRIVATE $Dst"
    exit 1
}

# Sync files
New-Item -ItemType Directory -Force "$Dst\game_memory" | Out-Null

Copy-Item "$Src\assets\pointer_chains.json" "$Dst\pointer_chains.json" -Force
Copy-Item "$Src\scripts\gen_chains.py"      "$Dst\gen_chains.py"      -Force
Copy-Item "$Src\native\game_memory\*"       "$Dst\game_memory\"       -Recurse -Force

# Commit and push
Set-Location $Dst

git add -A

$changed = git status --porcelain
if (-not $changed) {
    Write-Host "Nothing changed, skipping commit."
    exit 0
}

$msg = if ($Message) { $Message } else { "sync $(Get-Date -Format 'yyyy-MM-dd HH:mm')" }
git commit -m $msg
git push
