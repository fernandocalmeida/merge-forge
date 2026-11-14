# Desliga o Baixar Redes e tira do inicio do Windows.
# Nao apaga a pasta do app, os videos baixados nem o .env (faca isso a mao, se quiser).
# Uso:  powershell -ExecutionPolicy Bypass -File .\desinstalar-windows.ps1

$App = Split-Path -Parent $MyInvocation.MyCommand.Path
$Porta = 8798
$envArq = Join-Path $App ".env"
if (Test-Path $envArq) {
  $porta = (Select-String -Path $envArq -Pattern '^PORT=(\d+)' | Select-Object -First 1)
  if ($porta) { $Porta = [int]$porta.Matches[0].Groups[1].Value }
}

$atalho = Join-Path ([Environment]::GetFolderPath("Startup")) "Baixar Redes.vbs"
if (Test-Path $atalho) { Remove-Item $atalho -Confirm:$false; Write-Host "Removido do inicio do Windows." }

Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" | Where-Object { $_.CommandLine -like "*iniciar.cmd*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Get-NetTCPConnection -LocalPort $Porta -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
Write-Host "Baixar Redes desligado."
