# Instalador do Baixar Redes para Windows.
# Uso (na pasta do app):  powershell -ExecutionPolicy Bypass -File .\instalar-windows.ps1
# O que faz:
#   1. confere Node, yt-dlp, ffmpeg e Claude Code (instala pelo winget/npm o que faltar)
#   2. instala as dependencias do app (npm install)
#   3. cria o arquivo .env (se ainda nao existir)
#   4. faz o app iniciar junto com o Windows, escondido, e voltar sozinho se cair
#   5. liga o app agora e abre no navegador
# Depois, no app, use "Conectar IA" para entrar com a conta Claude e colar a chave da Groq.

$ErrorActionPreference = "Stop"
$App = Split-Path -Parent $MyInvocation.MyCommand.Path
$Porta = 8798

function Passo($t) { Write-Host ""; Write-Host "==> $t" -ForegroundColor Yellow }
function Tem($cmd) { return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function AtualizarPath {
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
}
function InstalarWinget($id, $nome) {
  if (-not (Tem "winget")) { throw "Nao encontrei o winget. Instale $nome manualmente e rode este instalador de novo." }
  Write-Host "Instalando $nome pelo winget..."
  winget install --id $id -e --accept-source-agreements --accept-package-agreements --silent | Out-Host
  AtualizarPath
}

Passo "Conferindo o que o app precisa"
if (-not (Tem "node")) { InstalarWinget "OpenJS.NodeJS.LTS" "Node.js" }
if (-not (Tem "node")) { throw "O Node.js nao ficou disponivel. Feche e abra o PowerShell e rode de novo." }
$versao = [int]((node -v).TrimStart("v").Split(".")[0])
if ($versao -lt 20) { throw "O app precisa do Node 20 ou mais novo (encontrei $(node -v))." }
Write-Host "Node $(node -v) ok"

if (-not (Tem "yt-dlp")) { InstalarWinget "yt-dlp.yt-dlp" "yt-dlp" }
if (-not (Tem "ffmpeg")) { InstalarWinget "yt-dlp.FFmpeg" "ffmpeg" }
if (-not (Tem "yt-dlp")) { throw "O yt-dlp nao ficou disponivel. Feche e abra o PowerShell e rode de novo." }
Write-Host "yt-dlp e ffmpeg ok"

if (-not (Tem "claude")) {
  Write-Host "Instalando o Claude Code (usado para gerar os estudos com a sua conta Claude)..."
  npm install -g @anthropic-ai/claude-code | Out-Host
  AtualizarPath
}
if (Tem "claude") { Write-Host "Claude Code ok" } else { Write-Host "Claude Code nao instalado: o Estudio IA so funciona depois de instalar." -ForegroundColor Red }

Passo "Instalando as dependencias do app"
Push-Location $App
npm install --omit=dev --no-audit --no-fund | Out-Host
Pop-Location

Passo "Configuracao (.env)"
$envArq = Join-Path $App ".env"
if (-not (Test-Path $envArq)) {
  $linhas = @(
    "# Configuracao local do Baixar Redes (este arquivo nao vai para o git).",
    "PORT=$Porta",
    "# 127.0.0.1 = so este computador acessa. Para abrir no celular pela rede: HOST=0.0.0.0 e defina SENHA.",
    "HOST=127.0.0.1",
    "IA_PROVEDOR=auto"
  )
  [IO.File]::WriteAllLines($envArq, $linhas)
  Write-Host ".env criado"
} else {
  Write-Host ".env ja existia (mantido)"
  $porta = (Select-String -Path $envArq -Pattern '^PORT=(\d+)' | Select-Object -First 1)
  if ($porta) { $Porta = [int]$porta.Matches[0].Groups[1].Value }
}
New-Item -ItemType Directory -Force (Join-Path $App "logs") | Out-Null

Passo "Iniciar junto com o Windows"
# se ja estiver rodando, desliga ANTES de regravar o iniciar.cmd (o cmd le o arquivo enquanto roda)
Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" | Where-Object { $_.CommandLine -like "*iniciar.cmd*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
$jaRodando = Get-NetTCPConnection -LocalPort $Porta -State Listen -ErrorAction SilentlyContinue
if ($jaRodando) {
  Write-Host "Desligando a versao que estava rodando..."
  $jaRodando | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 1
}
# iniciar.cmd: roda o servidor e, se ele cair, liga de novo depois de 5 segundos
$cmd = Join-Path $App "iniciar.cmd"
[IO.File]::WriteAllLines($cmd, @(
  "@echo off",
  "cd /d `"$App`"",
  "set BAIXAR_SUPERVISIONADO=1",
  ":loop",
  "node server.mjs >> logs\servidor.log 2>&1",
  "timeout /t 5 /nobreak >nul",
  "goto loop"
))
# o .vbs liga o iniciar.cmd sem abrir janela; uma copia fica na pasta Inicializar do Windows
$vbs = @(
  "Set s = CreateObject(`"WScript.Shell`")",
  "s.Run `"cmd /c `"`"$cmd`"`"`", 0, False"
)
$inicializar = [Environment]::GetFolderPath("Startup")
$atalho = Join-Path $inicializar "Baixar Redes.vbs"
[IO.File]::WriteAllLines($atalho, $vbs)
Write-Host "Vai iniciar sozinho a cada login: $atalho"

Passo "Ligando o app agora"
# liga pelo proprio Windows (WMI), e nao como filho deste terminal: assim o app nao cai quando o terminal fecha
$criado = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = "wscript.exe `"$atalho`"" }
if ($criado.ReturnValue -ne 0) { Start-Process -FilePath "wscript.exe" -ArgumentList "`"$atalho`"" }
$url = "http://localhost:$Porta/"
$ok = $false
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Milliseconds 500
  try { Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Porta/api/sessao" -TimeoutSec 2 | Out-Null; $ok = $true; break } catch { }
}
if (-not $ok) { throw "O app nao respondeu. Veja o log em $App\logs\servidor.log" }

Write-Host ""
Write-Host "Pronto! O Baixar Redes esta rodando em $url" -ForegroundColor Green
Write-Host "No app, toque em 'Conectar IA' para entrar com a conta Claude e colar a chave da Groq."
Start-Process $url
