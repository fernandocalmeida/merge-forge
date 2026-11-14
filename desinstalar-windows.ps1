# Desliga o Merge Forge e tira do inicio do Windows.
# Nao apaga a pasta do app, os videos baixados nem o .env (faca isso a mao, se quiser).
# Uso:  powershell -ExecutionPolicy Bypass -File .\desinstalar-windows.ps1

$App = Split-Path -Parent $MyInvocation.MyCommand.Path
$Porta = 8798
$envArq = Join-Path $App ".env"
if (Test-Path $envArq) {
  $achada = (Select-String -Path $envArq -Pattern '^PORT=(\d+)' | Select-Object -First 1)
  if ($achada) { $Porta = [int]$achada.Matches[0].Groups[1].Value }
}
$cmd = Join-Path $App "iniciar.cmd"

# tira do inicio do Windows (nome atual e o antigo "Baixar Redes"), so se o atalho for desta pasta
$inicializar = [Environment]::GetFolderPath("Startup")
foreach ($n in @("Merge Forge.vbs", "Baixar Redes.vbs")) {
  $atalho = Join-Path $inicializar $n
  if ((Test-Path $atalho) -and ((Get-Content $atalho -Raw) -like "*$cmd*")) { Remove-Item $atalho -Confirm:$false; Write-Host "Removido do inicio do Windows: $n" }
}

Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" | Where-Object { $_.CommandLine -like "*$cmd*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Get-NetTCPConnection -LocalPort $Porta -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
Write-Host "Merge Forge desligado."
