# Instalador do Merge Forge para Windows.
# Uso (na pasta do app):  powershell -ExecutionPolicy Bypass -File .\instalar-windows.ps1
# Opcoes:
#   -SemInicializacao   instala e liga o app, mas NAO coloca no inicio do Windows (bom para experimentar)
#   -Porta 8799         usa outra porta (padrao 8798)
#   -Silencioso         nao abre o navegador no fim (usado pelo MergeForgeSetup.exe, que abre sozinho)
# O que faz:
#   1. confere Node, yt-dlp, Deno, ffmpeg, Google Chrome, Claude Code e Codex (instala pelo winget/npm o que faltar)
#   2. instala as dependencias do app (npm install)
#   3. cria o arquivo .env (se ainda nao existir)
#   4. faz o app iniciar junto com o Windows, escondido, e voltar sozinho se cair
#   5. liga o app agora e abre no navegador
# Depois, no app: aceite o termo de uso e use "Conectar IA" para entrar com a conta Claude,
# colar a chave da Groq e (opcional) entrar com a conta do ChatGPT para o infografico.

param(
  [switch]$SemInicializacao,
  [int]$Porta = 0,
  [switch]$Silencioso
)

$ErrorActionPreference = "Stop"
$App = Split-Path -Parent $MyInvocation.MyCommand.Path
$Nome = "Merge Forge"

function Passo($t) { Write-Host ""; Write-Host "==> $t" -ForegroundColor Yellow }
function Ok($t) { Write-Host "  ok  $t" -ForegroundColor Green }
function Aviso($t) { Write-Host "  !!  $t" -ForegroundColor DarkYellow }
function Tem($cmd) { return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function AtualizarPath {
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
}
function InstalarWinget($id, $nome) {
  if (-not (Tem "winget")) { throw "Nao encontrei o winget. Instale $nome manualmente e rode este instalador de novo." }
  Write-Host "  Instalando $nome pelo winget..."
  winget install --id $id -e --accept-source-agreements --accept-package-agreements --silent | Out-Host
  AtualizarPath
}
# processos DESTE app: o cmd que roda o iniciar.cmd desta pasta e o que ele abriu (o node do app).
# Nada mais e desligado: um programa de outra pessoa na mesma porta nunca e tocado.
function ProcessosDoApp($cmdApp) {
  $todos = @(Get-CimInstance Win32_Process)
  $pais = @($todos | Where-Object { $_.Name -eq 'cmd.exe' -and $_.CommandLine -like "*$cmdApp*" })
  $ids = @($pais | ForEach-Object { $_.ProcessId })
  $filhos = @($todos | Where-Object { $ids -contains $_.ParentProcessId })
  return @($filhos) + @($pais)
}
function PortaLivre($p) { return -not (Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue) }
function GravarPorta($arq, $p) {
  $linhas = @(Get-Content $arq | Where-Object { $_ -notmatch '^PORT=' })
  $linhas = @("PORT=$p") + $linhas
  [IO.File]::WriteAllLines($arq, $linhas)
}
function AcharChrome {
  $lugares = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "$env:ProgramW6432\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
  )
  foreach ($l in $lugares) { if ($l -and (Test-Path $l)) { return $l } }
  return $null
}

Passo "Conferindo o que o app precisa"

# Node.js 20+
if (-not (Tem "node")) { InstalarWinget "OpenJS.NodeJS.LTS" "Node.js" }
if (-not (Tem "node")) { throw "O Node.js nao ficou disponivel. Reinicie o computador e rode o instalador de novo." }
$versao = [int]((node -v).TrimStart("v").Split(".")[0])
if ($versao -lt 20) { throw "O app precisa do Node 20 ou mais novo (encontrei $(node -v)). Atualize em nodejs.org e rode de novo." }
Ok "Node $(node -v)"

# yt-dlp (download), Deno (o YouTube exige para liberar os videos) e ffmpeg (juntar video e audio)
if (-not (Tem "yt-dlp")) { InstalarWinget "yt-dlp.yt-dlp" "yt-dlp" }
if (-not (Tem "deno")) { InstalarWinget "DenoLand.Deno" "Deno" }
if (-not (Tem "ffmpeg")) { InstalarWinget "yt-dlp.FFmpeg" "ffmpeg" }
if (-not (Tem "yt-dlp")) { throw "O yt-dlp nao ficou disponivel. Reinicie o computador e rode o instalador de novo." }
Ok "yt-dlp $(yt-dlp --version)"
if (Tem "deno") { Ok "Deno" } else { Aviso "Deno nao instalado: downloads do YouTube podem falhar (erro 403)." }
if (Tem "ffmpeg") { Ok "ffmpeg" } else { Aviso "ffmpeg nao instalado: videos em alta qualidade e a apostila nao vao funcionar." }
# deixa o yt-dlp na versao mais nova (as redes mudam com frequencia)
try { yt-dlp -U 2>&1 | Out-Null } catch { }

# Google Chrome (gera a apostila em PDF)
if (-not (AcharChrome)) { InstalarWinget "Google.Chrome" "Google Chrome" }
if (AcharChrome) { Ok "Google Chrome" } else { Aviso "Google Chrome nao encontrado: a apostila em PDF nao vai funcionar." }

# Claude Code (estudo com a conta Claude) e Codex (infografico com a conta do ChatGPT)
if (-not (Tem "claude")) {
  Write-Host "  Instalando o Claude Code (gera os estudos com a sua conta Claude)..."
  npm install -g @anthropic-ai/claude-code | Out-Host
  AtualizarPath
}
if (Tem "claude") { Ok "Claude Code" } else { Aviso "Claude Code nao instalado: o Estudio IA so funciona depois de instalar." }
if (-not (Tem "codex")) {
  Write-Host "  Instalando o Codex (desenha o infografico com a sua conta do ChatGPT; opcional)..."
  try { npm install -g @openai/codex | Out-Host; AtualizarPath } catch { }
}
if (Tem "codex") { Ok "Codex" } else { Aviso "Codex nao instalado: o infografico fica disponivel so com chave da OpenAI." }

Passo "Instalando as dependencias do app"
Push-Location $App
npm install --omit=dev --no-audit --no-fund | Out-Host
Pop-Location
Ok "dependencias"

Passo "Configuracao (.env)"
$envArq = Join-Path $App ".env"
if (-not (Test-Path $envArq)) {
  if ($Porta -le 0) { $Porta = 8798 }
  $linhas = @(
    "# Configuracao local do Merge Forge (este arquivo nao vai para o git).",
    "PORT=$Porta",
    "# 127.0.0.1 = so este computador acessa. Para abrir no celular pela rede: HOST=0.0.0.0 e defina SENHA.",
    "HOST=127.0.0.1",
    "IA_PROVEDOR=auto"
  )
  [IO.File]::WriteAllLines($envArq, $linhas)
  Ok ".env criado"
} else {
  Ok ".env ja existia (mantido)"
  $achada = (Select-String -Path $envArq -Pattern '^PORT=(\d+)' | Select-Object -First 1)
  if ($Porta -le 0) { $Porta = if ($achada) { [int]$achada.Matches[0].Groups[1].Value } else { 8798 } }
}
New-Item -ItemType Directory -Force (Join-Path $App "logs") | Out-Null

Passo "Preparando o app para rodar sozinho"
# desliga SO a copia deste app que ja estivesse rodando (outros programas e outras instalacoes nao sao tocados)
$cmd = Join-Path $App "iniciar.cmd"
$meus = @(ProcessosDoApp $cmd)
if ($meus.Count) {
  Write-Host "  Desligando a versao do Merge Forge que estava rodando..."
  $meus | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 2
}
# porta ocupada por OUTRO programa: usa a proxima livre e guarda no .env (o atalho le a porta de la)
if (-not (PortaLivre $Porta)) {
  $antiga = $Porta
  $Porta = (($Porta + 1)..($Porta + 50) | Where-Object { PortaLivre $_ } | Select-Object -First 1)
  if (-not $Porta) { throw "As portas $antiga a $($antiga + 50) estao ocupadas por outros programas. Rode de novo com -Porta e um numero livre." }
  Aviso "A porta $antiga ja e usada por outro programa (que nao foi mexido). O Merge Forge vai usar a porta $Porta."
}
GravarPorta $envArq $Porta
# iniciar.cmd: roda o servidor e, se ele cair, liga de novo depois de 5 segundos (a porta vem do .env)
[IO.File]::WriteAllLines($cmd, @(
  "@echo off",
  "cd /d `"$App`"",
  "set BAIXAR_SUPERVISIONADO=1",
  ":loop",
  "node server.mjs >> logs\servidor.log 2>&1",
  "timeout /t 5 /nobreak >nul",
  "goto loop"
))
# o .vbs liga o iniciar.cmd sem abrir janela
$vbsConteudo = @(
  "Set s = CreateObject(`"WScript.Shell`")",
  "s.Run `"cmd /c `"`"$cmd`"`"`", 0, False"
)
$inicializar = [Environment]::GetFolderPath("Startup")
if ($SemInicializacao) {
  $vbs = Join-Path $App "ligar.vbs"
  [IO.File]::WriteAllLines($vbs, $vbsConteudo)
  Ok "sem iniciar com o Windows (para ligar de novo: clique duas vezes em ligar.vbs)"
} else {
  $vbs = Join-Path $inicializar "$Nome.vbs"
  [IO.File]::WriteAllLines($vbs, $vbsConteudo)
  # instalacoes antigas usavam o nome "Baixar Redes": tira o atalho velho desta mesma pasta, para nao ligar duas vezes
  $antigo = Join-Path $inicializar "Baixar Redes.vbs"
  if ((Test-Path $antigo) -and ((Get-Content $antigo -Raw) -like "*$cmd*")) { Remove-Item $antigo -Confirm:$false }
  Ok "vai iniciar sozinho a cada login ($vbs)"
}

Passo "Ligando o app agora"
# liga pelo proprio Windows (WMI), e nao como filho deste terminal: assim o app nao cai quando o terminal fecha
$criado = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = "wscript.exe `"$vbs`"" }
if ($criado.ReturnValue -ne 0) { Start-Process -FilePath "wscript.exe" -ArgumentList "`"$vbs`"" }
$url = "http://localhost:$Porta/"
$ok = $false
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Milliseconds 500
  try { Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Porta/api/sessao" -TimeoutSec 2 | Out-Null; $ok = $true; break } catch { }
}
if (-not $ok) { throw "O app nao respondeu. Veja o log em $App\logs\servidor.log" }

Write-Host ""
Write-Host "Pronto! O $Nome esta rodando em $url" -ForegroundColor Green
Write-Host "Proximos passos no app:"
Write-Host "  1. Leia e aceite o termo de uso."
Write-Host "  2. Toque em 'Conectar IA': entre com a conta Claude e cole a chave gratis da Groq (console.groq.com/keys)."
Write-Host "  3. Opcional: entre com a conta do ChatGPT para desenhar os infograficos."
if (-not $Silencioso) { Start-Process $url }
