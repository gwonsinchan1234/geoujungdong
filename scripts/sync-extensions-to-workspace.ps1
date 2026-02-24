# vscode-extension-ids.txt 목록을 .vscode/extensions.json 으로 만들어
# Cursor에서 "워크스페이스 권장 확장 설치"로 한 번에 설치 가능하게 함.

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$txtPath = Join-Path $root "vscode-extension-ids.txt"
$vscodeDir = Join-Path $root ".vscode"
$jsonPath = Join-Path $vscodeDir "extensions.json"

if (-not (Test-Path $txtPath)) {
    Write-Host "vscode-extension-ids.txt 를 프로젝트 루트에 만들어 주세요." -ForegroundColor Red
    exit 1
}

$ids = Get-Content $txtPath -Encoding UTF8 |
    ForEach-Object { $_.Trim() } |
    Where-Object { $_ -and $_ -notmatch "^\s*#" }

if ($ids.Count -eq 0) {
    Write-Host "vscode-extension-ids.txt 에 확장 ID를 한 줄에 하나씩 넣어 주세요." -ForegroundColor Yellow
    exit 1
}

if (-not (Test-Path $vscodeDir)) {
    New-Item -ItemType Directory -Path $vscodeDir | Out-Null
}

$obj = @{
    recommendations = [array]$ids
}
$obj | ConvertTo-Json | Set-Content -Path $jsonPath -Encoding UTF8

Write-Host "총 $($ids.Count)개 확장을 .vscode/extensions.json 에 반영했습니다." -ForegroundColor Green
Write-Host "Cursor에서 이 폴더를 열고 '워크스페이스 권장 확장 설치'를 누르면 됩니다." -ForegroundColor Cyan
