import http from "node:http";
import { spawn } from "node:child_process";
import { createReadStream, createWriteStream, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { readdir, stat, unlink, writeFile, rename, mkdir, readFile } from "node:fs/promises";
import { createHash, createHmac, timingSafeEqual, scryptSync, randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { calcularProgresso, criarEstudos, motivoSemApostila, statusClaude, testarTokenClaude, testarChaveApi, testarChaveGroq, chavesGroq, criarInfograficos, chaveImagem, codexConectado, codexStatus, iniciarLoginCodex, sairCodex, verificarCodex, testarChaveGemini, testarChaveOpenAI, testarClaudeAgora, testarGroqAgora, testarCodexAgora, esquecerSaude, saudeAtual } from "./ia.mjs";
import { criarConfig } from "./config.mjs";
import { itensExportaveis, enviarZip, disposicao, nomeSeguro, tamanhoAproximado, legendasSrt } from "./exportar.mjs";
import { gerarApostila } from "./apostila.mjs";
import { criarLegendagem, fichaLegendado } from "./legendar.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuração e chaves podem vir de um arquivo .env ao lado do server.mjs (fora do git).
try { process.loadEnvFile(path.join(__dirname, ".env")); } catch { /* sem .env: usa só o ambiente */ }
const PUBLIC_DIR = path.join(__dirname, "public");
const DOWNLOADS_DIR = path.join(__dirname, "downloads");

// ---------- configuração (tudo por variável de ambiente) ----------
const PORT = Number(process.env.PORT || 8798);
// identifica esta instalação (pasta do app) sem expor o caminho: usado para saber se quem está na porta é este mesmo app
const INSTANCIA = createHash("sha1").update(__dirname.toLowerCase()).digest("hex").slice(0, 12);
// Padrão: só este computador acessa. Para abrir no celular pela rede, use HOST=0.0.0.0 (e defina SENHA).
const HOST = process.env.HOST || "127.0.0.1";
// yt-dlp próprio do app (pasta .venv, criada pelo instalador/servidor) tem prioridade: ele é
// atualizado sozinho todo dia e vem com o Deno, o motor JavaScript que o YouTube passou a exigir.
const VENV_BIN = process.platform === "win32" ? path.join(__dirname, ".venv", "Scripts") : path.join(__dirname, ".venv", "bin");
const EXE = process.platform === "win32" ? ".exe" : "";
const YTDLP_VENV = path.join(VENV_BIN, "yt-dlp" + EXE);
const DENO_VENV = path.join(VENV_BIN, "deno" + EXE);
const YTDLP = process.env.YTDLP_APP || (existsSync(YTDLP_VENV) ? YTDLP_VENV : (process.env.YTDLP || "yt-dlp"));
// argumentos extras para todo yt-dlp: motor JavaScript (YTDLP_JS="deno:/caminho" ou o Deno da .venv)
const YTDLP_JS = process.env.YTDLP_JS || (existsSync(DENO_VENV) ? `deno:${DENO_VENV}` : "");
const YTDLP_EXTRA = YTDLP_JS ? ["--js-runtimes", YTDLP_JS] : [];
// Se SENHA estiver definida, baixar/listar/tocar exige login. Sem SENHA, fica aberto (como antes).
// A SENHA é só a senha INICIAL: no primeiro acesso o app obriga a criar uma senha própria,
// que fica guardada (com hash) em dados/senha.json e passa a valer no lugar da inicial.
// Esqueceu a senha? Apague dados/senha.json no servidor e reinicie: volta a valer a SENHA inicial.
// SENHA_PROVISORIA (no .env do app) tem prioridade: permite zerar a senha sem mexer no serviço do sistema.
const SENHA = process.env.SENHA_PROVISORIA || process.env.SENHA || "";
const DADOS_DIR = process.env.DADOS_DIR || path.join(__dirname, "dados");
const ARQUIVO_SENHA = path.join(DADOS_DIR, "senha.json");
const SENHA_MIN = 8;
// Termo de uso: precisa ser aceito antes de usar. Mudou o texto (public/js/termo.js)? Mude a versão
// e o app pede um novo aceite. O aceite fica em dados/termo.json (data e versão).
const TERMO_VERSAO = "2026-11-14";
const ARQUIVO_TERMO = path.join(DADOS_DIR, "termo.json");
let termoAceito = null;
try { termoAceito = JSON.parse(readFileSync(ARQUIVO_TERMO, "utf8")); } catch { /* ainda não aceitou */ }
const termoPendente = () => !termoAceito || termoAceito.versao !== TERMO_VERSAO;
// Se DIAS_GUARDAR estiver definido, vídeos mais velhos que isso são apagados sozinhos.
const DIAS_GUARDAR = Number(process.env.DIAS_GUARDAR || 0);
const MAX_SIMULTANEOS = Number(process.env.MAX_SIMULTANEOS || 2);
const TIMEOUT_MS = Number(process.env.TIMEOUT_MIN || 30) * 60 * 1000;
const TAMANHO_MAX = process.env.TAMANHO_MAX || "2G";

const COOKIE = "br_sessao";

// ---------- senha ----------
// senhaPropria = { salt, hash } quando a pessoa já trocou a senha inicial; null enquanto não trocou.
let senhaPropria = null;
try {
  const d = JSON.parse(readFileSync(ARQUIVO_SENHA, "utf8"));
  if (d && d.salt && d.hash) senhaPropria = { salt: d.salt, hash: d.hash };
} catch { /* ainda não existe: vale a SENHA inicial */ }

const senhaLigada = () => !!(SENHA || senhaPropria);
const precisaTrocar = () => !!SENHA && !senhaPropria;
const hashSenha = (senha, salt) => scryptSync(String(senha), salt, 32).toString("hex");

// O token do cookie muda quando a senha muda: trocar a senha desloga os outros aparelhos.
function calcularToken() {
  const segredo = senhaPropria ? senhaPropria.hash : SENHA;
  return segredo ? createHmac("sha256", segredo).update("baixar-redes").digest("hex") : "";
}
let tokenSessao = calcularToken();

// Tolerância: espaços nas pontas (teclado/colar) não contam. A senha provisória também ignora
// maiúsculas, porque o celular costuma pôr a primeira letra maiúscula ("Admin").
function senhaConfere(senha) {
  const bruta = String(senha || "");
  const limpa = bruta.trim();
  if (senhaPropria) return iguais(hashSenha(limpa, senhaPropria.salt), senhaPropria.hash) || (limpa !== bruta && iguais(hashSenha(bruta, senhaPropria.salt), senhaPropria.hash));
  return iguais(limpa, SENHA) || (!!process.env.SENHA_PROVISORIA && iguais(limpa.toLowerCase(), SENHA.toLowerCase()));
}

async function salvarSenhaPropria(nova) {
  const salt = randomBytes(16).toString("hex");
  const dados = { salt, hash: hashSenha(nova, salt), trocadaEm: new Date().toISOString() };
  await mkdir(DADOS_DIR, { recursive: true, mode: 0o700 });
  const tmp = ARQUIVO_SENHA + ".tmp";
  await writeFile(tmp, JSON.stringify(dados), { mode: 0o600 });
  await rename(tmp, ARQUIVO_SENHA);
  senhaPropria = { salt: dados.salt, hash: dados.hash };
  tokenSessao = calcularToken();
}

// Freio contra chute de senha: 10 erros em 15 min por IP bloqueiam por 15 min.
const tentativas = new Map();
function ipDe(req) {
  return String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
}
function bloqueado(ip) {
  const t = tentativas.get(ip);
  if (!t) return false;
  if (Date.now() - t.inicio > 15 * 60 * 1000) { tentativas.delete(ip); return false; }
  return t.erros >= 10;
}
function registrarErro(ip) {
  const t = tentativas.get(ip);
  if (!t || Date.now() - t.inicio > 15 * 60 * 1000) tentativas.set(ip, { inicio: Date.now(), erros: 1 });
  else t.erros++;
}

function cookieSessao(req) {
  const seguro = (req.headers["x-forwarded-proto"] || "").includes("https") ? "; Secure" : "";
  return `${COOKIE}=${tokenSessao}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${seguro}`;
}

// ---------- utilidades ----------
function redeDaUrl(link) {
  let host = "";
  try { host = new URL(link).hostname.toLowerCase(); } catch { return "video"; }
  const eh = (...dominios) => dominios.some((d) => host === d || host.endsWith("." + d));
  if (eh("instagram.com")) return "instagram";
  if (eh("facebook.com", "fb.watch", "fb.com")) return "facebook";
  if (eh("tiktok.com")) return "tiktok";
  if (eh("twitter.com", "x.com")) return "x";
  if (eh("youtube.com", "youtu.be")) return "youtube";
  return "video";
}

// Link de página (busca, canal, perfil, playlist) em vez de UM vídeo: o yt-dlp tentaria baixar a página
// inteira (dezenas de vídeos) e a tela ficaria parada em 0%. Devolve a explicação, ou null se é um vídeo.
function linkNaoEhVideo(link) {
  let u;
  try { u = new URL(link); } catch { return null; }
  const host = u.hostname.toLowerCase();
  const p = u.pathname.toLowerCase();
  const eh = (...dominios) => dominios.some((d) => host === d || host.endsWith("." + d));
  const dica = (onde) => `esse link é de ${onde}, não de um vídeo. Abra o vídeo que você quer e copie o link dele (botão Compartilhar > Copiar link)`;
  if (eh("youtube.com")) {
    if (p.startsWith("/results")) return dica("uma busca do YouTube");
    if (/^\/(watch|shorts\/|live\/|embed\/|v\/)/.test(p)) return null;
    if (p.startsWith("/playlist")) return dica("uma playlist do YouTube");
    return dica("uma página do YouTube (canal ou início)");
  }
  if (eh("instagram.com")) {
    if (/^\/(p|reel|reels|tv|stories|share)\//.test(p) || /^\/[^/]+\/(p|reel)\//.test(p)) return null;
    return dica("um perfil ou página do Instagram");
  }
  if (eh("tiktok.com")) {
    if (eh("vm.tiktok.com", "vt.tiktok.com") || /\/(video|photo)\//.test(p) || p.startsWith("/t/")) return null;
    return dica("um perfil ou busca do TikTok");
  }
  return null;
}

function dataHoje() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

function json(res, codigo, corpo, extraHeaders = {}) {
  res.writeHead(codigo, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extraHeaders });
  res.end(JSON.stringify(corpo));
}

function lerCookies(req) {
  const out = {};
  for (const parte of (req.headers.cookie || "").split(";")) {
    const i = parte.indexOf("=");
    if (i > 0) out[parte.slice(0, i).trim()] = decodeURIComponent(parte.slice(i + 1).trim());
  }
  return out;
}

function iguais(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

function autenticado(req) {
  if (!senhaLigada()) return true;
  return iguais(lerCookies(req)[COOKIE] || "", tokenSessao);
}

async function lerCorpo(req, limite = 16 * 1024) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > limite) throw Object.assign(new Error("corpo grande demais"), { status: 413 });
  }
  try { return JSON.parse(body || "{}"); }
  catch { throw Object.assign(new Error("JSON invalido"), { status: 400 }); }
}

// Garante que `nome` aponta para um arquivo DENTRO de `pasta` (sem ../ nem subpastas).
function dentroDe(pasta, relativo) {
  const alvo = path.resolve(pasta, "." + path.sep + relativo);
  if (alvo !== pasta && !alvo.startsWith(pasta + path.sep)) return null;
  return alvo;
}

// ---------- estudo com IA (módulo ia.mjs) ----------
const config = criarConfig(path.join(__dirname, ".env"));
const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";
const infograficos = criarInfograficos({
  claude: process.env.CLAUDE_BIN || "claude",
  ffmpeg: process.env.FFMPEG || "ffmpeg",
  modelo: process.env.MODELO_IA || "claude-opus-5-5",
  modeloCli: process.env.MODELO_IA || null,
});
const estudos = criarEstudos({
  ytdlp: YTDLP,
  ytdlpExtra: YTDLP_EXTRA,
  ffmpeg: process.env.FFMPEG || "ffmpeg",
  claude: CLAUDE_BIN,
  provedor: process.env.IA_PROVEDOR || "auto",
  modelo: process.env.MODELO_IA || "claude-opus-5-5",     // API: modelo usado
  modeloCli: process.env.MODELO_IA || null,                // login do Claude: padrão da instalação, se não escolher
});

const legendagem = criarLegendagem({ ffmpeg: process.env.FFMPEG || "ffmpeg" });

// ---------- download ----------
let emAndamento = 0;
let emAnalise = 0;

// Qualidades oferecidas na tela. "audio" vira MP3.
const QUALIDADES = {
  "1080": { sufixo: "1080p", args: ["-f", "bv*[height<=1080]+ba/b[height<=1080]/best", "--merge-output-format", "mp4"] },
  "720": { sufixo: "720p", args: ["-f", "bv*[height<=720]+ba/b[height<=720]/best", "--merge-output-format", "mp4"] },
  "480": { sufixo: "480p", args: ["-f", "bv*[height<=480]+ba/b[height<=480]/best", "--merge-output-format", "mp4"] },
  audio: { sufixo: "audio", args: ["-f", "ba/b", "-x", "--audio-format", "mp3", "--audio-quality", "5"] },
};

function baixarVideo(url, qualidade = "720", aoProgredir = () => {}) {
  const rede = redeDaUrl(url);
  const q = QUALIDADES[qualidade] || QUALIDADES["720"];
  const padrao = path.join(DOWNLOADS_DIR, `${dataHoje()}_${rede}_%(title).50s_%(id)s_${q.sufixo}.%(ext)s`);

  return new Promise((resolve, reject) => {
    const p = spawn(YTDLP, [
      ...YTDLP_EXTRA,
      ...q.args,
      "--max-filesize", TAMANHO_MAX,
      "--no-playlist",
      // progresso linha a linha: PCT|45.3%|2.1MiB/s|00:42|<formato> (stdout) e POS|<etapa> (stderr)
      "--newline", "--progress",
      // o yt-dlp.exe "empacotado" (winget) ignora PYTHONUTF8: sem isto, títulos com acento ou "："
      // saíam com o nome errado e a ficha do vídeo (.meta.json) não casava com o arquivo
      "--encoding", "utf-8",
      "--progress-template", "download:PCT|%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s|%(info.format_id)s",
      "--progress-template", "postprocess:POS|%(progress.postprocessor)s",
      "-o", padrao,
      // imprime o id e o caminho final depois de mesclar/mover (ARQ|<id>|<caminho>)
      "--print", "after_move:ARQ|%(id)s|%(filepath)s",
      "--",
      url,
    ], {
      windowsHide: true,
      // Sem buffer: a porcentagem chega na hora, em vez de aparecer atrasada e pular para o fim.
      env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1", PYTHONUNBUFFERED: "1" },
    });
    let saida = "";
    let erro = "";
    // vídeo e áudio vêm em arquivos separados (o vídeo pesa ~90%); depois o yt-dlp junta os dois
    const partes = qualidade === "audio" ? 1 : 2;
    const pesos = partes === 1 ? [0.97] : [0.88, 0.09];
    let formato = null, parte = -1, resto = "";
    const linhaProgresso = (l) => {
      const m = /^PCT\|\s*([\d.]+)%\|\s*([^|]*)\|\s*([^|]*)\|(.*)$/.exec(l.trim());
      if (!m) return false;
      if (m[4] !== formato) { formato = m[4]; parte = Math.min(parte + 1, partes - 1); }
      const antes = pesos.slice(0, parte).reduce((a, b) => a + b, 0);
      const pct = Math.min(97, Math.round((antes + pesos[parte] * (Number(m[1]) / 100)) * 100));
      const vel = m[2].trim(), eta = m[3].trim();
      aoProgredir({ pct, velocidade: /unknown|NA/i.test(vel) ? null : vel.replace("iB", "B"), falta: /unknown|NA/i.test(eta) ? null : eta, etapa: parte === 0 ? "Baixando o vídeo" : "Baixando o áudio" });
      return true;
    };
    const timer = setTimeout(() => { p.kill("SIGKILL"); }, TIMEOUT_MS);
    p.stdout.on("data", (d) => {
      resto += d.toString();
      const linhas = resto.split(/\r?\n/);
      resto = linhas.pop();
      for (const l of linhas) if (!linhaProgresso(l)) saida += l + "\n";
    });
    p.stderr.on("data", (d) => {
      const t = d.toString();
      if (/POS\|(Merger|FFmpegMerger)/.test(t)) aoProgredir({ pct: 98, velocidade: null, falta: null, etapa: "Juntando vídeo e áudio" });
      else if (/POS\|FFmpegExtractAudio/.test(t)) aoProgredir({ pct: 98, velocidade: null, falta: null, etapa: "Convertendo o áudio" });
      erro += t.replace(/^POS\|.*$/gm, "");
    });
    p.on("error", (e) => { clearTimeout(timer); reject(new Error(`nao consegui rodar o yt-dlp (${e.code || e.message}). Confira a variavel YTDLP.`)); });
    p.on("close", (code, sinal) => {
      clearTimeout(timer);
      if (resto && !linhaProgresso(resto)) saida += resto;
      if (sinal === "SIGKILL") return reject(new Error("o download demorou demais e foi cancelado"));
      if (code !== 0) return reject(new Error(erro.trim().split("\n").filter((l) => /ERROR/i.test(l)).pop() || erro.slice(-400) || `yt-dlp saiu com codigo ${code}`));
      const linha = saida.split(/\r?\n/).filter((l) => l.startsWith("ARQ|")).pop();
      // sem a linha ARQ o yt-dlp pulou o download sem avisar: quase sempre é o limite de tamanho
      if (!linha) return reject(new Error(`o vídeo não foi baixado. O mais comum é ele passar do tamanho máximo permitido (${TAMANHO_MAX}): tente uma qualidade menor.`));
      const [, idVideo = "", caminho = ""] = linha ? linha.split("|") : [];
      const nome = arquivoBaixado(path.basename(caminho.trim()), idVideo.trim(), q.sufixo);
      if (!nome) return reject(new Error("o download terminou, mas o arquivo do vídeo não apareceu na pasta. Tente de novo ou escolha outra qualidade."));
      resolve(nome);
    });
  });
}

// Confere que o arquivo baixado existe de verdade e não está vazio. Se o nome que o yt-dlp
// informou não bater (codificação, caractere trocado), procura pelo id do vídeo + qualidade.
function arquivoBaixado(nome, idVideo, sufixo) {
  const valido = (n) => {
    const c = n && dentroDe(DOWNLOADS_DIR, n);
    if (!c || !EXT_VIDEO.has(path.extname(n).toLowerCase())) return false;
    try { return statSync(c).size > 1024; } catch { return false; }
  };
  if (valido(nome)) return nome;
  if (!idVideo) return null;
  const marca = `_${idVideo}_${sufixo}.`;
  const achados = readdirSync(DOWNLOADS_DIR).filter((n) => n.includes(marca) && !/\.(part|ytdl|temp)$|\.f\d+\./i.test(n) && valido(n));
  achados.sort((a, b) => statSync(path.join(DOWNLOADS_DIR, b)).mtimeMs - statSync(path.join(DOWNLOADS_DIR, a)).mtimeMs);
  return achados[0] || null;
}

// Só analisa (sem baixar): pega título, capa e duração pra mostrar uma prévia antes do download de verdade.
function infoVideo(url) {
  return new Promise((resolve, reject) => {
    const p = spawn(YTDLP, [...YTDLP_EXTRA, "--dump-json", "--no-playlist", "--no-warnings", "--skip-download", "--", url]);
    let saida = "";
    let erro = "";
    const timer = setTimeout(() => { p.kill("SIGKILL"); }, 20000);
    p.stdout.on("data", (d) => (saida += d.toString()));
    p.stderr.on("data", (d) => (erro += d.toString()));
    p.on("error", (e) => { clearTimeout(timer); reject(new Error(`nao consegui rodar o yt-dlp (${e.code || e.message})`)); });
    p.on("close", (code, sinal) => {
      clearTimeout(timer);
      if (sinal === "SIGKILL") return reject(new Error("demorou demais pra analisar esse link"));
      if (code !== 0) return reject(new Error(erro.trim().split("\n").filter((l) => /ERROR/i.test(l)).pop() || "nao consegui analisar esse link"));
      try {
        const linha = saida.trim().split(/\r?\n/).filter(Boolean).pop();
        const d = JSON.parse(linha);
        resolve({
          titulo: String(d.title || "").slice(0, 200),
          duracao: typeof d.duration === "number" ? Math.round(d.duration) : null,
          thumb: typeof d.thumbnail === "string" ? d.thumbnail : null,
          canal: String(d.uploader || d.channel || "").slice(0, 120),
          ...estimarTamanhos(d),
        });
      } catch { reject(new Error("nao consegui ler as informacoes do video")); }
    });
  });
}

// Estima o tamanho de cada qualidade a partir da lista de formatos que o yt-dlp devolve.
function estimarTamanhos(d) {
  const formatos = Array.isArray(d.formats) ? d.formats : [];
  const duracao = typeof d.duration === "number" ? d.duration : 0;
  const tamanho = (f) => f.filesize || f.filesize_approx || (f.tbr && duracao ? (f.tbr * 1000 / 8) * duracao : 0);
  const soAudio = formatos.filter((f) => f.vcodec === "none" && f.acodec && f.acodec !== "none");
  const melhorAudio = soAudio.sort((a, b) => (b.tbr || 0) - (a.tbr || 0))[0];
  const audioBytes = melhorAudio ? tamanho(melhorAudio) : 0;
  const comVideo = formatos.filter((f) => f.vcodec && f.vcodec !== "none" && f.height);
  const alturaMax = comVideo.reduce((m, f) => Math.max(m, f.height || 0), 0) || null;
  const paraAltura = (h) => {
    const cand = comVideo.filter((f) => f.height <= h).sort((a, b) => (b.height - a.height) || ((b.tbr || 0) - (a.tbr || 0)))[0];
    if (!cand) return null;
    const v = tamanho(cand);
    if (!v) return null;
    return Math.round(v + (cand.acodec && cand.acodec !== "none" ? 0 : audioBytes));
  };
  return {
    alturaMax,
    tamanhos: {
      "1080": paraAltura(1080),
      "720": paraAltura(720),
      "480": paraAltura(480),
      // MP3 VBR ~130 kbps
      audio: duracao ? Math.round(130000 / 8 * duracao) : null,
    },
  };
}

const EXT_VIDEO = new Set([".mp4", ".webm", ".mkv", ".mov", ".m4v", ".3gp", ".m4a", ".mp3", ".wav", ".ogg", ".opus", ".aac", ".flac"]);
const EXT_AUDIO = new Set([".m4a", ".mp3", ".wav", ".ogg", ".opus", ".aac", ".flac"]);
// arquivos enviados pela tela (arrastar ou escolher): limite em MB
const LIMITE_ENVIO = Number(process.env.LIMITE_ENVIO_MB || 2048) * 1024 * 1024;

// Cada vídeo pode ter dois arquivos "irmãos" na mesma pasta:
//   <base>.meta.json   → link de origem, título, canal, capa, duração (gravado no download)
//   <base>.estudo.json → resumo, mapa mental etc. gerados pela IA
const baseDe = (nome) => nome.slice(0, nome.length - path.extname(nome).length);
const arquivoMeta = (nome) => path.join(DOWNLOADS_DIR, baseDe(nome) + ".meta.json");
const arquivoEstudo = (nome) => path.join(DOWNLOADS_DIR, baseDe(nome) + ".estudo.json");
// imagens dos quadros: <base>.quadro-1.jpg, <base>.quadro-2.jpg...
const prefixoQuadro = (nome) => path.join(DOWNLOADS_DIR, baseDe(nome) + ".quadro-");
// vídeo com a legenda em português gravada: <base>.legendado.mp4 (não aparece na biblioteca)
const arquivoLegendado = (nome) => path.join(DOWNLOADS_DIR, baseDe(nome) + ".legendado.mp4");
const ehDerivado = (nome) => /\.legendado\.mp4(\.parcial\.mp4)?$/i.test(nome);

async function lerJson(caminho) {
  try { return JSON.parse(await readFile(caminho, "utf8")); } catch { return null; }
}

// ---------- apostila de estudo (PDF) ----------
// fica guardada ao lado do vídeo (<base>.apostila.pdf) e é refeita quando o estudo ou o infográfico mudam.
// Uma por vez: o Chrome que gera o PDF usa bastante memória.
// "-v2": versão com links e marcadores; mudar o sufixo faz todas serem geradas de novo
// v3 (19/11): aspas da citação corrigidas e transcrição revisada; mudar o sufixo faz as apostilas antigas serem montadas de novo
const arquivoApostila = (nome) => path.join(DOWNLOADS_DIR, baseDe(nome) + ".apostila-v3.pdf");
let filaApostila = Promise.resolve();
const gerandoApostila = new Map();
async function garantirApostila(nome) {
  const caminho = arquivoDoNome(nome);
  if (!caminho || !existsSync(caminho)) throw Object.assign(new Error("arquivo nao encontrado"), { status: 404 });
  const estudoArq = arquivoEstudo(nome);
  if (!existsSync(estudoArq)) throw Object.assign(new Error("gere o estudo com IA primeiro"), { status: 409 });
  const bloqueio = motivoSemApostila(await lerJson(estudoArq));
  if (bloqueio) throw Object.assign(new Error(bloqueio), { status: 409 });
  const pdf = arquivoApostila(nome);
  const imgPng = `${prefixoQuadro(nome)}1.png`, imgJpg = `${prefixoQuadro(nome)}1.jpg`;
  const imagemInfo = existsSync(imgPng) ? imgPng : existsSync(imgJpg) ? imgJpg : null;
  const mtime = async (a) => (a ? (await stat(a).catch(() => null))?.mtimeMs || 0 : 0);
  const pdfM = await mtime(pdf);
  if (pdfM && pdfM >= (await mtime(estudoArq)) && pdfM >= (await mtime(imagemInfo))) return pdf;
  if (gerandoApostila.has(nome)) return gerandoApostila.get(nome);
  const tarefa = (filaApostila = filaApostila.catch(() => {}).then(async () => {
    const estudo = await lerJson(estudoArq);
    const meta = (await lerJson(arquivoMeta(nome))) || {};
    const t0 = Date.now();
    await gerarApostila({
      estudo, video: caminho, audio: EXT_AUDIO.has(path.extname(nome).toLowerCase()), imagemInfo,
      meta: { ...meta, duracao: meta.duracao || (await duracaoDoArquivo(caminho).catch(() => null)) },
      saida: pdf, ffmpeg: process.env.FFMPEG || "ffmpeg", logoPath: path.join(PUBLIC_DIR, "logo-forge.png"),
    });
    console.log(`apostila gerada em ${((Date.now() - t0) / 1000).toFixed(1)}s: ${nome}`);
    return pdf;
  }).finally(() => gerandoApostila.delete(nome)));
  gerandoApostila.set(nome, tarefa);
  return tarefa;
}

// downloads em andamento (id → andamento), consultados pela tela a cada segundo
const tarefasDownload = new Map();

// Se o download começou antes da prévia carregar, o vídeo fica sem título e sem capa.
// Aqui o servidor busca esses dados depois, em segundo plano (uma vez por vídeo, um de cada vez).
const completando = new Set();
let filaCompletar = Promise.resolve();
function completarMeta(nome) {
  if (completando.has(nome)) return;
  completando.add(nome);
  filaCompletar = filaCompletar.then(async () => {
    const meta = await lerJson(arquivoMeta(nome));
    if (!meta || !meta.url || (meta.titulo && meta.thumb)) return;
    try {
      const i = await infoVideo(meta.url);
      const atual = (await lerJson(arquivoMeta(nome))) || meta;
      const novo = {
        ...atual,
        titulo: atual.titulo || i.titulo || null,
        canal: atual.canal || i.canal || null,
        thumb: atual.thumb || (typeof i.thumb === "string" && /^https:\/\//.test(i.thumb) ? i.thumb.slice(0, 1000) : null),
        duracao: atual.duracao || i.duracao || null,
      };
      await writeFile(arquivoMeta(nome), JSON.stringify(novo));
    } catch (e) {
      console.warn("nao deu para completar titulo/capa de", nome, "-", String(e.message || e).slice(0, 120));
    }
  }).catch(() => {});
}

// Vídeo do YouTube sem ficha (.meta.json): aconteceu quando um link de busca baixou vários vídeos sozinho,
// e quando o Windows trocou o ":" do título no nome do arquivo. O código do vídeo está no próprio nome
// (…_<11 caracteres>_720p.mp4): recria a ficha com o link e deixa o completarMeta buscar título e capa.
const RE_ID_YOUTUBE = /^\d{8}_youtube_.*_([A-Za-z0-9_-]{11})_(?:\d{3,4}p|audio)\.[a-z0-9]+$/i;
async function fichaRecriada(nome) {
  const m = RE_ID_YOUTUBE.exec(nome);
  if (!m) return null;
  const meta = { url: "https://www.youtube.com/watch?v=" + m[1], rede: "youtube", titulo: null, canal: null, thumb: null, duracao: null, recriada: true };
  try { await writeFile(arquivoMeta(nome), JSON.stringify(meta), { flag: "wx" }); } catch { return null; } // "wx": nunca sobrescreve
  completarMeta(nome);
  return meta;
}

// Capa tirada do próprio vídeo (um quadro), para quem não tem capa da rede (arquivo enviado, rede sem capa).
// Fica guardada em dados/capas e é refeita se o vídeo mudar.
const PASTA_CAPAS = path.join(DADOS_DIR, "capas");
const arquivoCapa = (nome) => path.join(PASTA_CAPAS, createHash("sha1").update(nome).digest("hex").slice(0, 20) + ".jpg");
const fazendoCapa = new Map();
let capasRodando = 0;
async function capaDoVideo(nome, caminho, duracao) {
  const destino = arquivoCapa(nome);
  const sv = await stat(caminho);
  const sc = await stat(destino).catch(() => null);
  if (sc && sc.size > 0 && sc.mtimeMs >= sv.mtimeMs) return destino;
  if (fazendoCapa.has(nome)) return fazendoCapa.get(nome);
  const tarefa = (async () => {
    while (capasRodando >= 2) await new Promise((r) => setTimeout(r, 200)); // no máximo 2 ffmpeg de capa por vez
    capasRodando++;
    try {
      await mkdir(PASTA_CAPAS, { recursive: true });
      const t = duracao > 0 ? Math.min(30, duracao * 0.1) : 3;
      const ok = await new Promise((resolve) => {
        const p = spawn(process.env.FFMPEG || "ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-ss", String(t), "-i", caminho,
          "-frames:v", "1", "-vf", "scale=480:-2", "-q:v", "5", destino + ".tmp.jpg"], { stdio: "ignore", windowsHide: true });
        const limite = setTimeout(() => p.kill("SIGKILL"), 30000);
        p.on("error", () => { clearTimeout(limite); resolve(false); });
        p.on("close", (c) => { clearTimeout(limite); resolve(c === 0); });
      });
      if (!ok || !existsSync(destino + ".tmp.jpg")) { await unlink(destino + ".tmp.jpg").catch(() => {}); return null; }
      await rename(destino + ".tmp.jpg", destino);
      return destino;
    } finally { capasRodando--; fazendoCapa.delete(nome); }
  })();
  fazendoCapa.set(nome, tarefa);
  return tarefa;
}

async function listarDownloads() {
  const arquivos = await readdir(DOWNLOADS_DIR);
  const nomes = new Set(arquivos);
  const itens = await Promise.all(
    arquivos
      .filter((nome) => EXT_VIDEO.has(path.extname(nome).toLowerCase()) && !ehDerivado(nome))
      .map(async (nome) => {
        const s = await stat(path.join(DOWNLOADS_DIR, nome));
        const meta = (await lerJson(arquivoMeta(nome))) || (await fichaRecriada(nome)) || {};
        const audio = EXT_AUDIO.has(path.extname(nome).toLowerCase());
        // sem capa da rede: usa um quadro do próprio vídeo (a tela troca por um ícone se não der)
        const capaPropria = !meta.thumb && !audio ? "/api/capa?nome=" + encodeURIComponent(nome) : null;
        return {
          nome,
          mtime: s.mtimeMs,
          tamanhoMB: (s.size / 1024 / 1024).toFixed(1),
          audio,
          titulo: meta.titulo || null,
          canal: meta.canal || null,
          thumb: meta.thumb || capaPropria,
          duracao: meta.duracao || null,
          rede: meta.rede || null,
          temEstudo: (meta.url && (!meta.titulo || !meta.thumb) && completarMeta(nome), nomes.has(baseDe(nome) + ".estudo.json")),
          estudando: estudos.emAndamento(nome),
        };
      })
  );
  return itens.sort((a, b) => b.mtime - a.mtime);
}

// Duração (em segundos) de um arquivo enviado, pelo ffprobe; null se não der
function duracaoDoArquivo(caminho) {
  return new Promise((resolve) => {
    const ffprobe = process.env.FFPROBE || "ffprobe";
    let saida = "";
    let p;
    try { p = spawn(ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", caminho], { windowsHide: true }); }
    catch { return resolve(null); }
    const t = setTimeout(() => p.kill("SIGKILL"), 15000);
    p.stdout.on("data", (d) => (saida += d));
    p.on("error", () => { clearTimeout(t); resolve(null); });
    p.on("close", () => { clearTimeout(t); const n = parseFloat(saida); resolve(Number.isFinite(n) ? Math.round(n) : null); });
  });
}

// Nome vindo da URL → caminho seguro dentro de downloads/ (ou null)
function arquivoDoNome(nome) {
  if (!nome || nome.includes("/") || nome.includes("\\")) return null;
  if (!EXT_VIDEO.has(path.extname(nome).toLowerCase())) return null;
  return dentroDe(DOWNLOADS_DIR, nome);
}

async function limparAntigos() {
  if (!DIAS_GUARDAR) return;
  const limite = Date.now() - DIAS_GUARDAR * 24 * 60 * 60 * 1000;
  for (const nome of await readdir(DOWNLOADS_DIR)) {
    if (nome === ".gitkeep") continue;
    const caminho = path.join(DOWNLOADS_DIR, nome);
    try {
      const s = await stat(caminho);
      if (s.isFile() && s.mtimeMs < limite) await unlink(caminho);
    } catch { /* arquivo sumiu no meio: ignora */ }
  }
}

// ---------- servir arquivos (com suporte a Range: obrigatório pro vídeo tocar no iPhone) ----------
const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".pdf": "application/pdf",
  ".srt": "application/x-subrip; charset=utf-8",
  ".zip": "application/zip",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".m4v": "video/mp4",
  ".3gp": "video/3gpp",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

// Cabeçalho que faz o navegador SALVAR o arquivo (em vez de abrir), mantendo o nome com acento.
function comoAnexo(nome) {
  const ascii = nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nome)}`;
}

async function servirArquivo(req, res, caminho, cacheControl, extras = {}) {
  const s = await stat(caminho);
  if (!s.isFile()) throw Object.assign(new Error("nao encontrado"), { code: "ENOENT" });
  const tipo = TIPOS[path.extname(caminho).toLowerCase()] || "application/octet-stream";
  const base = { "Content-Type": tipo, "Accept-Ranges": "bytes", "Cache-Control": cacheControl, "Last-Modified": s.mtime.toUTCString(), ...extras };

  const range = req.headers.range;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    let inicio, fim;
    if (m && (m[1] || m[2])) {
      if (m[1] === "") { inicio = Math.max(0, s.size - Number(m[2])); fim = s.size - 1; }
      else { inicio = Number(m[1]); fim = m[2] ? Math.min(Number(m[2]), s.size - 1) : s.size - 1; }
    }
    if (inicio === undefined || inicio > fim || inicio >= s.size) {
      res.writeHead(416, { ...base, "Content-Range": `bytes */${s.size}` });
      return res.end();
    }
    res.writeHead(206, { ...base, "Content-Range": `bytes ${inicio}-${fim}/${s.size}`, "Content-Length": fim - inicio + 1 });
    if (req.method === "HEAD") return res.end();
    return createReadStream(caminho, { start: inicio, end: fim }).pipe(res);
  }

  res.writeHead(200, { ...base, "Content-Length": s.size });
  if (req.method === "HEAD") return res.end();
  createReadStream(caminho).pipe(res);
}

// ---------- conexões ----------
// "Local" = a requisição veio deste próprio computador e não passou por um proxy.
// Um intermediário (Caddy, Nginx, Tailscale) também entrega as requisições por 127.0.0.1, então conferimos ainda o endereço
// digitado (Host): só "localhost"/"127.0.0.1" conta como este computador.
function ehLocal(req) {
  const ip = String(req.socket.remoteAddress || "");
  const local = ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
  const host = String(req.headers.host || "").toLowerCase().replace(/:\d+$/, "");
  const hostLocal = host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  const proxy = req.headers["x-forwarded-for"] || req.headers["tailscale-user-login"] || req.headers["x-forwarded-host"];
  return local && hostLocal && !proxy;
}
const podeConfigurar = (req) => senhaLigada() || ehLocal(req);

// Abre uma janela do terminal com `claude auth login` (Windows, macOS ou Linux com interface gráfica).
// sub: "auth login" (entrar) ou "setup-token" (gerar uma chave nova do Claude Code para colar no app)
function abrirTerminalLogin(sub = "auth login") {
  const opcoes = { detached: true, stdio: "ignore" };
  const fim = sub === "setup-token" ? "Copie a chave que apareceu acima e cole no Merge Forge." : "Pronto. Pode fechar esta janela e voltar ao Merge Forge.";
  let p;
  if (process.platform === "win32") {
    p = spawn("cmd.exe", ["/c", "start", "\"Conectar Claude\"", "cmd.exe", "/k", `"${CLAUDE_BIN} ${sub} & echo. & echo ${fim}"`], { ...opcoes, windowsVerbatimArguments: true });
  } else if (process.platform === "darwin") {
    p = spawn("osascript", ["-e", `tell application "Terminal" to do script "${CLAUDE_BIN} ${sub}"`, "-e", 'tell application "Terminal" to activate'], opcoes);
  } else {
    p = spawn("x-terminal-emulator", ["-e", `${CLAUDE_BIN} ${sub}`], opcoes);
  }
  p.on("error", () => {});
  p.unref();
}

// ---------- trava contra outros sites ----------
// Sem esta trava, um site qualquer aberto no navegador poderia mandar pedidos para o app deste computador
// (iniciar downloads, gastar a IA, trocar o login do Claude). Duas regras:
// 1) pedido para a API ou para os arquivos que venha de OUTRO site é recusado (cabeçalhos Origin e Sec-Fetch-Site,
//    que o navegador preenche sozinho e a página não consegue falsificar);
// 2) sem senha, o endereço digitado (Host) tem de ser este computador ou um IP; nome de domínio desconhecido é
//    recusado (impede o truque de "DNS rebinding"). Domínios extras: HOSTS_PERMITIDOS=meu.dominio,outro.dominio
const HOSTS_PERMITIDOS = new Set(String(process.env.HOSTS_PERMITIDOS || "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean));
const semPorta = (h) => String(h || "").toLowerCase().replace(/^\[([^\]]+)\](:\d+)?$/, "$1").replace(/:\d+$/, "");
const ehIp = (h) => /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(":");
function motivoRecusa(req, rota) {
  const hostCru = String(req.headers.host || "").toLowerCase();
  const host = semPorta(hostCru);
  if (!senhaLigada() && host && !(host === "localhost" || host.endsWith(".localhost") || ehIp(host) || HOSTS_PERMITIDOS.has(host))) {
    return `endereco nao permitido (${host}); para usar por um dominio, defina SENHA ou HOSTS_PERMITIDOS`;
  }
  if (!rota.startsWith("/api/") && !rota.startsWith("/downloads/")) return null;
  if (String(req.headers["sec-fetch-site"] || "").toLowerCase() === "cross-site") return "pedido vindo de outro site";
  const origem = req.headers.origin;
  if (origem && origem !== "null") {
    let o; try { o = new URL(origem); } catch { return "origem invalida"; }
    if (o.host.toLowerCase() !== hostCru) return "pedido vindo de outro site";
  } else if (origem === "null" && req.method !== "GET" && req.method !== "HEAD") return "pedido de origem desconhecida";
  return null;
}

// ---------- rotas ----------
const servidor = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    const rota = url.pathname;
    const recusa = motivoRecusa(req, rota);
    if (recusa) {
      console.warn(`recusado: ${req.method} ${rota} | ${recusa} | origem ${req.headers.origin || "-"} | host ${req.headers.host || "-"}`);
      return json(res, 403, { ok: false, erro: recusa });
    }

    if (rota === "/api/sessao" && req.method === "GET") {
      const logado = autenticado(req);
      return json(res, 200, { app: "merge-forge", instancia: INSTANCIA, precisaSenha: senhaLigada(), logado, precisaTrocar: logado && precisaTrocar(), precisaTermo: termoPendente(), termoVersao: TERMO_VERSAO, termoAceitoEm: termoAceito ? termoAceito.aceitoEm : null });
    }

    if (rota === "/api/entrar" && req.method === "POST") {
      const ip = ipDe(req);
      if (bloqueado(ip)) return json(res, 429, { ok: false, erro: "muitas tentativas erradas, espera 15 minutos" });
      const { senha } = await lerCorpo(req);
      if (!senhaLigada()) return json(res, 200, { ok: true, precisaTrocar: false });
      if (!senhaConfere(senha || "")) {
        registrarErro(ip);
        console.warn(`entrada recusada (${senhaPropria ? "senha propria" : "senha inicial"}; ${String(senha || "").length} caracteres; ${(tentativas.get(ip) || {}).erros || 0} erro(s) deste IP)`);
        return json(res, 401, { ok: false, erro: "senha errada" });
      }
      tentativas.delete(ip);
      return json(res, 200, { ok: true, precisaTrocar: precisaTrocar() }, { "Set-Cookie": cookieSessao(req) });
    }

    const protegida = rota.startsWith("/api/") || rota.startsWith("/downloads/");
    if (protegida && !autenticado(req)) return json(res, 401, { ok: false, erro: "precisa entrar com a senha" });

    if (rota === "/api/trocar-senha" && req.method === "POST") {
      if (!SENHA && !senhaPropria) return json(res, 400, { ok: false, erro: "o painel esta sem senha" });
      const ip = ipDe(req);
      if (bloqueado(ip)) return json(res, 429, { ok: false, erro: "muitas tentativas erradas, espera 15 minutos" });
      const { atual, nova } = await lerCorpo(req);
      if (!senhaConfere(atual || "")) { registrarErro(ip); return json(res, 401, { ok: false, erro: "a senha atual esta errada", campo: "atual" }); }
      if (typeof nova !== "string" || nova.length < SENHA_MIN) return json(res, 400, { ok: false, erro: `a senha nova precisa ter pelo menos ${SENHA_MIN} caracteres` });
      if (nova.length > 200) return json(res, 400, { ok: false, erro: "senha longa demais" });
      if (senhaConfere(nova) || (SENHA && iguais(nova, SENHA))) return json(res, 400, { ok: false, erro: "escolhe uma senha diferente da anterior" });
      await salvarSenhaPropria(nova);
      return json(res, 200, { ok: true }, { "Set-Cookie": cookieSessao(req) });
    }

    // Enquanto a senha inicial não for trocada, nada além da troca funciona.
    if (protegida && precisaTrocar()) return json(res, 403, { ok: false, erro: "crie sua senha antes de usar", precisaTrocar: true });

    // aceite do termo de uso (registra data e versão)
    if (rota === "/api/termo" && req.method === "POST") {
      const { versao, aceito } = await lerCorpo(req);
      if (aceito !== true || versao !== TERMO_VERSAO) return json(res, 400, { ok: false, erro: "marque que leu e concorda com a versão atual do termo" });
      const dados = { versao: TERMO_VERSAO, aceitoEm: new Date().toISOString() };
      await mkdir(DADOS_DIR, { recursive: true, mode: 0o700 });
      await writeFile(ARQUIVO_TERMO + ".tmp", JSON.stringify(dados), { mode: 0o600 });
      await rename(ARQUIVO_TERMO + ".tmp", ARQUIVO_TERMO);
      termoAceito = dados;
      console.log(`termo de uso aceito (versão ${TERMO_VERSAO})`);
      return json(res, 200, { ok: true, ...dados });
    }
    // sem o termo aceito, nada além de ler a sessão e aceitar o termo funciona
    if (protegida && termoPendente()) return json(res, 403, { ok: false, erro: "aceite o termo de uso antes de usar", precisaTermo: true, termoVersao: TERMO_VERSAO });

    if (rota === "/api/info" && req.method === "POST") {
      const { url: link } = await lerCorpo(req);
      if (!link || !/^https?:\/\//i.test(link)) return json(res, 400, { ok: false, erro: "link invalido" });
      if (linkNaoEhVideo(link)) return json(res, 200, { ok: false, erro: linkNaoEhVideo(link) });
      // a prévia roda a cada link colado: limita pra não abrir dezenas de yt-dlp ao mesmo tempo
      if (emAnalise >= 3) return json(res, 429, { ok: false, erro: "muitas analises ao mesmo tempo" });
      emAnalise++;
      try {
        const info = await comAutoAtualizacao(() => infoVideo(link), "prévia");
        return json(res, 200, { ok: true, rede: redeDaUrl(link), ...info });
      } catch (e) {
        return json(res, 200, { ok: false, erro: String(e.message || e).slice(0, 300) });
      } finally {
        emAnalise--;
      }
    }

    // GET /api/baixar/estado?id=... → andamento do download (porcentagem, velocidade, quanto falta)
    if (rota === "/api/baixar/estado" && req.method === "GET") {
      const t = tarefasDownload.get(url.searchParams.get("id") || "");
      if (!t) return json(res, 404, { ok: false, erro: "download nao encontrado" });
      return json(res, 200, { ok: true, ...t, decorrido: Math.round((Date.now() - t.inicio) / 1000) });
    }

    if (rota === "/api/baixar" && req.method === "POST") {
      const { url: link, qualidade, info } = await lerCorpo(req);
      if (!link || !/^https?:\/\//i.test(link)) return json(res, 400, { ok: false, erro: "link invalido" });
      if (linkNaoEhVideo(link)) return json(res, 400, { ok: false, erro: linkNaoEhVideo(link) });
      if (qualidade && !QUALIDADES[qualidade]) return json(res, 400, { ok: false, erro: "qualidade invalida" });
      if (emAndamento >= MAX_SIMULTANEOS) return json(res, 429, { ok: false, erro: "ja tem downloads em andamento, tenta de novo em instantes" });
      emAndamento++;
      const id = randomBytes(9).toString("hex");
      const tarefa = { estado: "baixando", pct: 0, etapa: "Começando", velocidade: null, falta: null, inicio: Date.now(), resultado: null, erro: null };
      tarefasDownload.set(id, tarefa);
      setTimeout(() => tarefasDownload.delete(id), 60 * 60 * 1000).unref();
      json(res, 202, { ok: true, id });
      try {
        const arquivo = await comAutoAtualizacao(() => baixarVideo(link, qualidade || "720", (p) => Object.assign(tarefa, p)), "download");
        // guarda os dados do vídeo do lado do arquivo (a prévia já trouxe; o link fica pro estudo com IA)
        const i = info && typeof info === "object" ? info : {};
        const meta = {
          url: link,
          rede: redeDaUrl(link),
          titulo: typeof i.titulo === "string" ? i.titulo.slice(0, 200) : null,
          canal: typeof i.canal === "string" ? i.canal.slice(0, 120) : null,
          thumb: typeof i.thumb === "string" && /^https:\/\//.test(i.thumb) ? i.thumb.slice(0, 1000) : null,
          duracao: typeof i.duracao === "number" ? Math.round(i.duracao) : null,
          qualidade: qualidade || "720",
          baixadoEm: new Date().toISOString(),
        };
        await writeFile(arquivoMeta(arquivo), JSON.stringify(meta)).catch(() => {});
        if (!meta.titulo || !meta.thumb) completarMeta(arquivo); // a prévia não chegou a tempo
        Object.assign(tarefa, { estado: "pronto", pct: 100, etapa: "Pronto", falta: null, resultado: { ok: true, arquivo, ...meta } });
      } catch (e) {
        Object.assign(tarefa, { estado: "erro", erro: String(e.message || e).slice(0, 500) });
      } finally {
        emAndamento--;
      }
      return;
    }

    // POST /api/enviar?nome=<nome original> com o arquivo no corpo (vídeo ou áudio do aparelho)
    if (rota === "/api/enviar" && req.method === "POST") {
      // só o nome do arquivo, sem pastas (ninguém envia "../../algo")
      const original = path.posix.basename(String(url.searchParams.get("nome") || "arquivo").split("\\").join("/")).slice(0, 200);
      const ext = path.extname(original).toLowerCase();
      if (!EXT_VIDEO.has(ext)) return json(res, 400, { ok: false, erro: "envie um vídeo ou áudio (mp4, mov, webm, mkv, mp3, m4a, wav, ogg...)" });
      const declarado = Number(req.headers["content-length"] || 0);
      if (declarado > LIMITE_ENVIO) return json(res, 413, { ok: false, erro: `arquivo grande demais (máximo ${Math.round(LIMITE_ENVIO / 1024 / 1024)} MB)` });
      const base = original.slice(0, original.length - ext.length).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^A-Za-z0-9 _-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) || "arquivo";
      const nome = `${dataHoje()}_arquivo_${base}_${randomBytes(3).toString("hex")}${ext}`;
      const destino = dentroDe(DOWNLOADS_DIR, nome);
      if (!destino) return json(res, 400, { ok: false, erro: "nome de arquivo inválido" });
      let recebidos = 0;
      try {
        await new Promise((ok, falhou) => {
          const saida = createWriteStream(destino, { flags: "wx" });
          req.on("data", (pedaco) => {
            recebidos += pedaco.length;
            if (recebidos > LIMITE_ENVIO) { req.unpipe(saida); saida.destroy(); falhou(Object.assign(new Error("arquivo grande demais"), { status: 413 })); }
          });
          req.on("aborted", () => falhou(new Error("envio interrompido")));
          req.on("error", falhou);
          saida.on("error", falhou);
          saida.on("finish", ok);
          req.pipe(saida);
        });
        if (!recebidos) throw Object.assign(new Error("o arquivo chegou vazio"), { status: 400 });
      } catch (e) {
        await unlink(destino).catch(() => {});
        return json(res, e.status || 500, { ok: false, erro: String(e.message || e) });
      }
      const meta = {
        url: null, rede: "arquivo", origem: "arquivo",
        titulo: original.slice(0, original.length - ext.length).slice(0, 200) || "Arquivo enviado",
        canal: null, thumb: null, duracao: await duracaoDoArquivo(destino),
        baixadoEm: new Date().toISOString(),
      };
      await writeFile(arquivoMeta(nome), JSON.stringify(meta)).catch(() => {});
      return json(res, 200, { ok: true, arquivo: nome, ...meta, audio: EXT_AUDIO.has(ext) });
    }

    if (rota === "/api/downloads" && req.method === "GET") {
      return json(res, 200, await listarDownloads());
    }

    // DELETE /api/downloads/<nome> → apaga o vídeo e os arquivos irmãos (meta e estudo)
    if (rota.startsWith("/api/downloads/") && req.method === "DELETE") {
      const nome = decodeURIComponent(rota.slice("/api/downloads/".length));
      const caminho = arquivoDoNome(nome);
      if (!caminho || !existsSync(caminho)) return json(res, 404, { ok: false, erro: "arquivo nao encontrado" });
      // estudo em andamento: cancela primeiro (mata ffmpeg/claude que estejam usando o arquivo) e apaga em seguida
      if (estudos.emAndamento(nome)) await estudos.cancelar(nome);
      await unlink(caminho);
      await unlink(arquivoMeta(nome)).catch(() => {});
      await unlink(arquivoEstudo(nome)).catch(() => {});
      await unlink(arquivoApostila(nome)).catch(() => {});
      await unlink(arquivoLegendado(nome)).catch(() => {});
      await unlink(fichaLegendado(arquivoLegendado(nome))).catch(() => {});
      for (const velha of [".apostila.pdf", ".apostila-v2.pdf"]) await unlink(path.join(DOWNLOADS_DIR, baseDe(nome) + velha)).catch(() => {});
      for (let i = 1; i <= 8; i++) for (const x of [".jpg", ".png"]) await unlink(`${prefixoQuadro(nome)}${i}${x}`).catch(() => {});
      await unlink(arquivoCapa(nome)).catch(() => {});
      return json(res, 200, { ok: true });
    }

    // GET /api/capa?nome= → um quadro do próprio vídeo como capa (para quem não tem capa da rede)
    if (rota === "/api/capa" && req.method === "GET") {
      const nome = url.searchParams.get("nome") || "";
      const caminho = arquivoDoNome(nome);
      if (!caminho || !existsSync(caminho) || EXT_AUDIO.has(path.extname(nome).toLowerCase())) return json(res, 404, { ok: false, erro: "arquivo nao encontrado" });
      const meta = (await lerJson(arquivoMeta(nome))) || {};
      const capa = await capaDoVideo(nome, caminho, Number(meta.duracao) || 0).catch(() => null);
      if (!capa) return json(res, 404, { ok: false, erro: "nao deu para tirar a capa" });
      res.writeHead(200, { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400" });
      return createReadStream(capa).pipe(res);
    }

    // ---------- estudo com IA (resumo, mapa mental, organograma, infográfico, linha do tempo) ----------
    // ---------- infográfico em pôster técnico (ilustrações por IA) ----------
    if (rota === "/api/poster" && req.method === "GET") {
      const nome = url.searchParams.get("nome") || "";
      const caminho = arquivoDoNome(nome);
      if (!caminho || !existsSync(caminho)) return json(res, 404, { ok: false, erro: "arquivo nao encontrado" });
      const estudo = await lerJson(arquivoEstudo(nome));
      const job = infograficos.estado(nome);
      const q = estudo && estudo.poster ? estudo.poster : null;
      const estado = job ? job.estado : q && q.pronto ? "pronto" : q ? "parcial" : "nenhum";
      return json(res, 200, { ok: true, estado, etapa: job ? job.etapa : null, erro: job ? job.erro : null, conta: job ? job.conta || null : null, progresso: calcularProgresso(job), estimado: !!(job && job.estimado), poster: q, imagemConectada: !!chaveImagem(), temEstudo: !!estudo });
    }

    if (rota === "/api/poster" && req.method === "POST") {
      const { nome, refazer } = await lerCorpo(req);
      const caminho = arquivoDoNome(nome || "");
      if (!caminho || !existsSync(caminho)) return json(res, 404, { ok: false, erro: "arquivo nao encontrado" });
      const estudo = await lerJson(arquivoEstudo(nome));
      if (!estudo) return json(res, 409, { ok: false, erro: "gere o estudo do video primeiro" });
      if (!chaveImagem()) return json(res, 409, { ok: false, conta: "codex", erro: "entre com a conta do ChatGPT para desenhar o infográfico" });
      if (!estudos.configurado()) return json(res, 409, { ok: false, conta: "claude", erro: "conecte a conta Claude" });
      // as contas são conferidas já dentro da criação (o andamento aparece na hora)
      if (refazer && estudo.poster) {
        for (let i = 1; i <= 8; i++) for (const x of [".jpg", ".png"]) await unlink(`${prefixoQuadro(nome)}${i}${x}`).catch(() => {});
        delete estudo.poster;
        await writeFile(arquivoEstudo(nome), JSON.stringify(estudo));
      }
      infograficos.iniciar({ nome, arquivoEstudo: arquivoEstudo(nome), prefixoImagem: prefixoQuadro(nome), provedorTexto: estudos.provedor() });
      return json(res, 202, { ok: true, ...infograficos.estado(nome) });
    }

    // ---------- exportar: cada visão num arquivo, ou tudo num ZIP ----------
    // GET /api/exportar?nome=<video>&item=lista|tudo|video|infografico|documento|resumo|mapa|mapa-md|organograma|tempo|perguntas|anki|transcricao|legendas|infografico-texto
    if (rota === "/api/exportar" && req.method === "GET") {
      const nome = url.searchParams.get("nome") || "";
      const item = url.searchParams.get("item") || "lista";
      const video = arquivoDoNome(nome);
      if (!video || !existsSync(video)) return json(res, 404, { ok: false, erro: "arquivo nao encontrado" });
      const estudo = await lerJson(arquivoEstudo(nome));
      const meta = await lerJson(arquivoMeta(nome));
      const imgPng = `${prefixoQuadro(nome)}1.png`, imgJpg = `${prefixoQuadro(nome)}1.jpg`;
      const imagemInfo = estudo && estudo.poster && estudo.poster.imagem ? (existsSync(imgPng) ? imgPng : existsSync(imgJpg) ? imgJpg : null) : null;
      const titulo = (estudo && estudo.titulo) || (meta && meta.titulo) || baseDe(nome);
      const videoLegendado = existsSync(arquivoLegendado(nome)) && !legendagem.emAndamento(nome) ? arquivoLegendado(nome) : null;
      const itens = itensExportaveis(estudo, { video, imagemInfo, titulo, videoLegendado });
      const pasta = nomeSeguro(titulo, 60);

      if (item === "lista") {
        const lista = Object.entries(itens).map(([id, it]) => ({ id, rotulo: it.rotulo, arquivo: it.arquivo, tamanho: tamanhoAproximado({ [id]: it }) }));
        if (estudo) {
          const pdfExiste = existsSync(arquivoApostila(nome));
          lista.unshift({ id: "apostila", rotulo: "Apostila Técnica Interativa", arquivo: "Apostila Técnica Interativa.pdf", tamanho: pdfExiste ? (await stat(arquivoApostila(nome))).size : 0, geraNaHora: !pdfExiste, bloqueada: motivoSemApostila(estudo) });
        }
        return json(res, 200, { ok: true, temEstudo: !!estudo, audio: EXT_AUDIO.has(path.extname(nome).toLowerCase()), traduzida: !!(estudo && estudo.traduzida), legendaBloqueada: estudo ? motivoSemApostila(estudo, "o vídeo legendado") : null, itens: lista, totalZip: tamanhoAproximado(itens), totalSemVideo: tamanhoAproximado(Object.fromEntries(Object.entries(itens).filter(([id]) => id !== "video" && id !== "video-legendado"))) });
      }

      if (item === "tudo") {
        const semVideo = url.searchParams.get("video") === "0";
        // &itens=resumo,mapa,... → só os marcados na tela
        const escolhidos = url.searchParams.get("itens") ? new Set(url.searchParams.get("itens").split(",").map((x) => x.trim()).filter(Boolean)) : null;
        const ordem = ["apostila", "documento", "resumo", "mapa", "mapa-md", "organograma", "tempo", "perguntas", "anki", "transcricao", "legendas", "transcricao-original", "legendas-original", "infografico", "infografico-texto", "video", "video-legendado"];
        // a apostila entra no ZIP completo e quando for marcada (é gerada antes, se precisar)
        if (estudo && !motivoSemApostila(estudo) && (!escolhidos || escolhidos.has("apostila"))) {
          try { itens.apostila = { arquivo: "Apostila Técnica Interativa.pdf", caminho: await garantirApostila(nome) }; }
          catch (e) { console.warn("apostila fora do ZIP:", e.message); }
        }
        const ids = ordem.filter((id) => itens[id] && !(semVideo && (id === "video" || id === "video-legendado")) && (id !== "video-legendado" || (escolhidos && escolhidos.has(id))) && (!escolhidos || escolhidos.has(id)));
        if (!ids.length) return json(res, 400, { ok: false, erro: "nenhum item escolhido" });
        // regra do Fernando (15/11): ZIP só para um conjunto; um arquivo só vem solto, no formato dele
        if (ids.length === 1) {
          res.writeHead(302, { Location: `/api/exportar?nome=${encodeURIComponent(nome)}&item=${encodeURIComponent(ids[0])}` });
          return res.end();
        }
        const entradas = ids.map((id) => {
          const it = itens[id];
          return it.caminho ? { nome: `${pasta}/${it.arquivo}`, caminho: it.caminho } : { nome: `${pasta}/${it.arquivo}`, conteudo: it.conteudo };
        });
        try { await enviarZip(res, entradas, `${pasta}.zip`); }
        catch (e) { console.warn("exportar zip interrompido:", e.message); res.destroy(); }
        return;
      }

      if (item === "apostila") {
        res.writeHead(302, { Location: `/api/apostila?nome=${encodeURIComponent(nome)}` });
        return res.end();
      }
      const it = itens[item];
      if (!it) return json(res, 404, { ok: false, erro: estudo ? "item desconhecido" : "gere o estudo com IA primeiro" });
      const nomeArquivo = item === "video" ? path.basename(video) : item === "infografico" ? `${pasta} - ${it.arquivo}` : it.arquivo.startsWith(pasta) ? it.arquivo : `${pasta} - ${it.arquivo}`;
      if (it.caminho) return await servirArquivo(req, res, it.caminho, "private, no-cache", { "Content-Disposition": disposicao(nomeArquivo) });
      const corpo = Buffer.from(it.conteudo, "utf8");
      res.writeHead(200, { "Content-Type": it.tipo, "Content-Length": corpo.length, "Content-Disposition": disposicao(nomeArquivo), "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
      return res.end(corpo);
    }

    // GET /api/apostila?nome=<video>            → baixa o PDF (gera se precisar)
    // GET /api/apostila?nome=<video>&preparar=1 → só gera e responde quando estiver pronto
    // GET /api/apostila?nome=<video>&abrir=1    → abre no navegador em vez de baixar
    if (rota === "/api/apostila" && req.method === "GET") {
      const nome = url.searchParams.get("nome") || "";
      let pdf;
      try { pdf = await garantirApostila(nome); }
      catch (e) { return json(res, e.status || 500, { ok: false, erro: String(e.message || e).slice(0, 300) }); }
      if (url.searchParams.has("preparar")) return json(res, 200, { ok: true, tamanho: (await stat(pdf)).size });
      const estudo = await lerJson(arquivoEstudo(nome));
      const nomeArq = `${nomeSeguro((estudo && estudo.titulo) || baseDe(nome), 70)} - Apostila Técnica Interativa.pdf`;
      const disp = url.searchParams.has("abrir") ? disposicao(nomeArq).replace(/^attachment/, "inline") : disposicao(nomeArq);
      return await servirArquivo(req, res, pdf, "private, no-cache", { "Content-Disposition": disp });
    }

    // GET /api/quadro?nome=<video>&n=1 → imagem do quadro (só números de 1 a 8)
    if (rota === "/api/quadro" && req.method === "GET") {
      const nome = url.searchParams.get("nome") || "";
      const n = Number(url.searchParams.get("n"));
      const caminho = arquivoDoNome(nome);
      if (!caminho || !Number.isInteger(n) || n < 1 || n > 8) return json(res, 404, { ok: false, erro: "nao encontrado" });
      const png = `${prefixoQuadro(nome)}${n}.png`;
      return await servirArquivo(req, res, existsSync(png) ? png : `${prefixoQuadro(nome)}${n}.jpg`, "private, max-age=86400");
    }

    if (rota === "/api/estudo" && req.method === "GET") {
      const nome = url.searchParams.get("nome") || "";
      const caminho = arquivoDoNome(nome);
      if (!caminho || !existsSync(caminho)) return json(res, 404, { ok: false, erro: "arquivo nao encontrado" });
      const estudo = await lerJson(arquivoEstudo(nome));
      if (estudo) return json(res, 200, { ok: true, estado: "pronto", estudo, apostilaBloqueada: motivoSemApostila(estudo) });
      const job = estudos.estado(nome);
      if (job) return json(res, 200, { ok: true, ...job, progresso: calcularProgresso(job) });
      return json(res, 200, { ok: true, estado: "nenhum", iaConfigurada: estudos.configurado() });
    }

    if (rota === "/api/ia" && req.method === "GET") {
      await estudos.pronto;
      const claude = await statusClaude({ claude: CLAUDE_BIN });
      return json(res, 200, {
        ok: true,
        provedor: estudos.provedor(),
        configurada: estudos.configurado(),
        claude,                                            // { instalado, logado, metodo }
        tokenClaude: !!process.env.CLAUDE_CODE_OAUTH_TOKEN, // conectado pela tela (o valor nunca sai do servidor)
        chaveApi: !!process.env.ANTHROPIC_API_KEY,
        groq: chavesGroq().length > 0,
        groqChaves: chavesGroq().length,
        gemini: !!process.env.GEMINI_API_KEY,
        openai: !!process.env.OPENAI_API_KEY,
        codex: codexConectado(),
        codexInfo: codexStatus(),
        claudeSemSistema: process.env.CLAUDE_SEM_SISTEMA === "1",
        codexSemSistema: process.env.CODEX_SEM_SISTEMA === "1",
        saude: saudeAtual(),
        local: ehLocal(req),
        podeConfigurar: podeConfigurar(req),
      });
    }

    // ---------- conectar contas (só com senha ligada ou neste próprio computador) ----------
    if (rota.startsWith("/api/ia/") && req.method === "POST") {
      if (!podeConfigurar(req)) return json(res, 403, { ok: false, erro: "para conectar contas pela rede, defina uma SENHA no app" });
      const corpo = await lerCorpo(req);

      if (rota === "/api/ia/abrir-login" || rota === "/api/ia/abrir-setup-token") {
        // abre uma janela de terminal NESTE computador: login do Claude Code, ou geração de uma chave nova (setup-token)
        if (!ehLocal(req)) return json(res, 400, { ok: false, erro: "o terminal só abre no computador onde o app está instalado; use a opção de colar a chave" });
        try {
          if (rota === "/api/ia/abrir-login") { await config.gravar({ CLAUDE_SEM_SISTEMA: null }); esquecerSaude("claude"); }
          abrirTerminalLogin(rota === "/api/ia/abrir-login" ? "auth login" : "setup-token");
          return json(res, 200, { ok: true });
        } catch (e) { return json(res, 500, { ok: false, erro: String(e.message || e) }); }
      }

      // teste REAL das contas (pede um "OK" à IA, confere as chaves da Groq, faz o Codex responder)
      if (rota === "/api/ia/testar") {
        const quais = corpo.conta ? [corpo.conta] : ["claude", "groq", "codex"];
        const r = {};
        await Promise.all(quais.map(async (q) => {
          if (q === "claude") r.claude = await testarClaudeAgora({ claude: CLAUDE_BIN });
          else if (q === "groq") r.groq = await testarGroqAgora();
          else if (q === "codex") r.codex = await testarCodexAgora();
        }));
        return json(res, 200, { ok: true, ...r });
      }

      // desconectar a conta Claude: token do app sai do .env; o login do Claude Code deste computador é
      // encerrado (claude auth logout) quando o pedido vem do próprio computador; pela rede o app só deixa de usá-lo
      if (rota === "/api/ia/claude/sair") {
        // desconecta SÓ o que o app está usando agora: com token, sai o token (o login do computador fica como está)
        const feito = [];
        const st = process.env.CLAUDE_CODE_OAUTH_TOKEN ? null : await statusClaude({ claude: CLAUDE_BIN });
        if (process.env.CLAUDE_CODE_OAUTH_TOKEN) { await config.gravar({ CLAUDE_CODE_OAUTH_TOKEN: null }); feito.push("token"); }
        else if (st.logado && process.env.CLAUDE_SEM_SISTEMA !== "1") {
          if (ehLocal(req)) {
            await new Promise((ok) => { const p = spawn(CLAUDE_BIN, ["auth", "logout"], { windowsHide: true, stdio: "ignore", shell: process.platform === "win32" }); p.on("close", ok); p.on("error", ok); });
            feito.push("logout");
          } else { await config.gravar({ CLAUDE_SEM_SISTEMA: "1" }); feito.push("ignorar"); }
        }
        esquecerSaude("claude");
        await estudos.redetectar();
        return json(res, 200, { ok: true, feito, provedor: estudos.provedor() });
      }
      if (rota === "/api/ia/claude/usar-sistema") {
        await config.gravar({ CLAUDE_SEM_SISTEMA: null });
        esquecerSaude("claude");
        await estudos.redetectar();
        return json(res, 200, { ok: true, provedor: estudos.provedor() });
      }

      if (rota === "/api/ia/conectar") {
        const tipo = corpo.tipo;
        const valor = typeof corpo.valor === "string" ? corpo.valor.trim() : "";
        if (!valor || valor.length > 400 || /\s/.test(valor)) return json(res, 400, { ok: false, erro: "cole o valor completo, sem espaços" });
        try {
          if (tipo === "claude-token") { await testarTokenClaude({ claude: CLAUDE_BIN }, valor); await config.gravar({ CLAUDE_CODE_OAUTH_TOKEN: valor }); }
          else if (tipo === "api") { await testarChaveApi(valor); await config.gravar({ ANTHROPIC_API_KEY: valor }); }
          else if (tipo === "groq") { await testarChaveGroq(valor); await config.gravar({ GROQ_API_KEY: valor }); }
          else if (tipo === "gemini") { await testarChaveGemini(valor); await config.gravar({ GEMINI_API_KEY: valor }); }
          else if (tipo === "openai") { await testarChaveOpenAI(valor); await config.gravar({ OPENAI_API_KEY: valor }); }
          else return json(res, 400, { ok: false, erro: "tipo desconhecido" });
          if (tipo === "claude-token") await config.gravar({ CLAUDE_SEM_SISTEMA: null });
        } catch (e) {
          return json(res, 400, { ok: false, erro: String(e.message || e).slice(0, 240) });
        }
        esquecerSaude();
        await estudos.redetectar();
        return json(res, 200, { ok: true, provedor: estudos.provedor() });
      }

      if (rota === "/api/ia/desconectar") {
        const chave = { "claude-token": "CLAUDE_CODE_OAUTH_TOKEN", api: "ANTHROPIC_API_KEY", groq: "GROQ_API_KEY", gemini: "GEMINI_API_KEY", openai: "OPENAI_API_KEY" }[corpo.tipo];
        if (!chave) return json(res, 400, { ok: false, erro: "tipo desconhecido" });
        await config.gravar(corpo.tipo === "groq" ? { GROQ_API_KEY: null, GROQ_API_KEYS: null } : { [chave]: null });
        esquecerSaude();
        await estudos.redetectar();
        return json(res, 200, { ok: true, provedor: estudos.provedor() });
      }

      // ---------- login do Codex (conta do ChatGPT) por código ----------
      if (rota === "/api/ia/codex/entrar") {
        esquecerSaude("codex");
        try { return json(res, 200, { ok: true, ...(await iniciarLoginCodex()) }); }
        catch (e) { return json(res, 500, { ok: false, erro: String(e.message || e).slice(0, 240) }); }
      }
      if (rota === "/api/ia/codex/estado") {
        return json(res, 200, { ok: true, ...codexStatus() });
      }
      // sair: a conta entrada pelo app é desconectada; o Codex do computador/servidor não é tocado, o app só deixa de usá-lo
      if (rota === "/api/ia/codex/sair") {
        const origem = codexStatus().origem;
        if (origem === "app") await sairCodex();
        else if (origem === "servidor") { await config.gravar({ CODEX_SEM_SISTEMA: "1" }); await verificarCodex(); }
        esquecerSaude("codex");
        return json(res, 200, { ok: true, ...codexStatus() });
      }
      if (rota === "/api/ia/codex/usar-sistema") {
        await config.gravar({ CODEX_SEM_SISTEMA: null });
        await verificarCodex();
        esquecerSaude("codex");
        return json(res, 200, { ok: true, ...codexStatus() });
      }

      if (rota === "/api/ia/verificar") {
        // depois do login no terminal, a tela pede pra conferir de novo
        await estudos.redetectar();
        return json(res, 200, { ok: true, provedor: estudos.provedor(), claude: await statusClaude({ claude: CLAUDE_BIN }) });
      }
      return json(res, 404, { ok: false, erro: "nao encontrado" });
    }

    // POST /api/estudo/cancelar { nome } → para o estudo (na fila ou rodando) e libera o vídeo
    if (rota === "/api/estudo/cancelar" && req.method === "POST") {
      const { nome } = await lerCorpo(req);
      if (!arquivoDoNome(nome || "")) return json(res, 404, { ok: false, erro: "arquivo nao encontrado" });
      const cancelou = await estudos.cancelar(nome);
      return json(res, 200, { ok: true, cancelou, estado: "nenhum" });
    }

    // ---------- vídeo com legenda em português gravada (ffmpeg) ----------
    // GET  /api/legendar?nome=<video> → estado: nenhum | na-fila | gravando (pct real) | pronto | erro
    // POST /api/legendar {nome, refazer} → começa a gravar (precisa do estudo, que tem a transcrição)
    if (rota === "/api/legendar" && (req.method === "GET" || req.method === "POST")) {
      const corpo = req.method === "POST" ? await lerCorpo(req) : {};
      const nome = req.method === "POST" ? corpo.nome || "" : url.searchParams.get("nome") || "";
      const caminho = arquivoDoNome(nome);
      if (!caminho || !existsSync(caminho)) return json(res, 404, { ok: false, erro: "arquivo nao encontrado" });
      if (EXT_AUDIO.has(path.extname(nome).toLowerCase())) return json(res, 400, { ok: false, erro: "arquivo de audio nao tem imagem para gravar legenda" });
      if (req.method === "POST") {
        if (legendagem.emAndamento(nome)) return json(res, 202, { ok: true, ...legendagem.estado(nome) });
        const estudo = await lerJson(arquivoEstudo(nome));
        if (!estudo || !(estudo.transcricao || []).length) return json(res, 409, { ok: false, erro: "gere o estudo com IA primeiro (ele traz a transcricao)" });
        // legenda "em português" só com a transcrição 100% em português (mesma regra da apostila)
        const semTraducao = motivoSemApostila(estudo, "o vídeo legendado");
        if (semTraducao) return json(res, 409, { ok: false, erro: semTraducao });
        if (corpo.refazer) { await unlink(arquivoLegendado(nome)).catch(() => {}); await unlink(fichaLegendado(arquivoLegendado(nome))).catch(() => {}); }
        else if (existsSync(arquivoLegendado(nome))) return json(res, 200, { ok: true, estado: "pronto" });
        const meta = (await lerJson(arquivoMeta(nome))) || {};
        const duracao = Number(meta.duracao) || (await duracaoDoArquivo(caminho)) || 0;
        // tarja: caixa escura atrás da legenda, para cobrir a legenda original já gravada no vídeo
        legendagem.iniciar({ nome, video: caminho, transcricao: estudo.transcricao, duracao, destino: arquivoLegendado(nome), tarja: !!corpo.tarja });
        return json(res, 202, { ok: true, ...legendagem.estado(nome) });
      }
      const job = legendagem.estado(nome);
      if (job) return json(res, 200, { ok: true, ...job });
      if (existsSync(arquivoLegendado(nome))) {
        const ficha = (await lerJson(fichaLegendado(arquivoLegendado(nome)))) || {};
        return json(res, 200, { ok: true, estado: "pronto", tamanho: (await stat(arquivoLegendado(nome))).size, tarja: !!ficha.tarja });
      }
      return json(res, 200, { ok: true, estado: "nenhum" });
    }

    // ---------- legenda em português para o player do app (WebVTT, a mesma divisão do SRT) ----------
    // GET /api/legenda.vtt?nome=<video> → só com a transcrição em português (mesma regra da apostila)
    if (rota === "/api/legenda.vtt" && req.method === "GET") {
      const nome = url.searchParams.get("nome") || "";
      if (!arquivoDoNome(nome)) return json(res, 404, { ok: false, erro: "arquivo nao encontrado" });
      const estudo = await lerJson(arquivoEstudo(nome));
      if (!estudo || !(estudo.transcricao || []).length) return json(res, 404, { ok: false, erro: "sem estudo" });
      const semTraducao = motivoSemApostila(estudo, "a legenda em português");
      if (semTraducao) return json(res, 409, { ok: false, erro: semTraducao });
      const vtt = "WEBVTT\n\n" + legendasSrt(estudo.transcricao).replace(/(\d\d:\d\d:\d\d),(\d\d\d)/g, "$1.$2");
      res.writeHead(200, { "Content-Type": "text/vtt; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(vtt);
    }

    if (rota === "/api/estudo" && req.method === "POST") {
      const { nome, refazer } = await lerCorpo(req);
      const caminho = arquivoDoNome(nome || "");
      if (!caminho || !existsSync(caminho)) return json(res, 404, { ok: false, erro: "arquivo nao encontrado" });
      if (!estudos.configurado()) return json(res, 409, { ok: false, conta: "claude", erro: "conecte a conta Claude para gerar o estudo" });
      if (!refazer && await lerJson(arquivoEstudo(nome))) return json(res, 200, { ok: true, estado: "pronto" });
      // as contas (login expirado, chave apagada...) são conferidas já dentro da geração: o painel aparece na hora
      if (refazer) { await unlink(arquivoEstudo(nome)).catch(() => {}); if (!legendagem.emAndamento(nome)) { await unlink(arquivoLegendado(nome)).catch(() => {}); await unlink(fichaLegendado(arquivoLegendado(nome))).catch(() => {}); } }
      else if (await lerJson(arquivoEstudo(nome))) return json(res, 200, { ok: true, estado: "pronto" });
      const meta = (await lerJson(arquivoMeta(nome))) || {};
      estudos.iniciar(nome, caminho, meta, arquivoEstudo(nome));
      return json(res, 202, { ok: true, ...estudos.estado(nome) });
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("metodo nao permitido");
    }

    if (rota.startsWith("/downloads/")) {
      const nome = decodeURIComponent(rota.slice("/downloads/".length));
      const caminho = arquivoDoNome(nome);
      if (!caminho) throw Object.assign(new Error("nao encontrado"), { code: "ENOENT" });
      // ?salvar=1 → o navegador salva o vídeo no aparelho (pasta Downloads / Arquivos)
      const extras = url.searchParams.has("salvar") ? { "Content-Disposition": comoAnexo(nome) } : {};
      return await servirArquivo(req, res, caminho, "private, max-age=86400", extras);
    }

    const relativo = rota === "/" ? "index.html" : decodeURIComponent(rota.slice(1));
    const caminho = dentroDe(PUBLIC_DIR, relativo);
    if (!caminho) throw Object.assign(new Error("nao encontrado"), { code: "ENOENT" });
    // página, código e manifest sempre revalidam (atualização chega na hora); imagens podem ficar 1 dia
    const semCache = /\.(html|webmanifest|js|css)$/.test(caminho);
    // diagnóstico da instalação no celular: quem busca o manifesto e os ícones (o servidor do Google também busca)
    if (/^\/(manifest\.webmanifest|icone?-[\w-]+\.png)$/.test(rota)) {
      console.log(`pwa: ${req.method} ${rota} de ${ipDe(req)} | ${String(req.headers["user-agent"] || "sem user-agent").slice(0, 110)}${req.headers.range ? " | range " + req.headers.range : ""}`);
    }
    return await servirArquivo(req, res, caminho, semCache ? "no-cache" : "public, max-age=86400");
  } catch (e) {
    if (res.headersSent) return res.destroy();
    if (e.code === "ENOENT" || e.code === "EISDIR" || e.code === "ENOTDIR") {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("nao encontrado");
    }
    if (e.status) return json(res, e.status, { ok: false, erro: e.message });
    console.error(e);
    json(res, 500, { ok: false, erro: "erro interno" });
  }
});

servidor.requestTimeout = 0; // o POST /api/baixar pode demorar alguns minutos

// No Windows, "localhost" tenta primeiro o IPv6 (::1). Escutando só em 127.0.0.1, cada acesso por
// localhost esperaria ~2s antes de cair no IPv4. Então, no modo local, escutamos também no ::1.
let v6 = null;
if (HOST === "127.0.0.1") {
  v6 = http.createServer(servidor.listeners("request")[0]);
  v6.requestTimeout = 0;
  v6.on("error", () => { /* máquina sem IPv6 (ou porta do ::1 ocupada): segue só no IPv4 */ });
}

// ---------- yt-dlp sempre em dia ----------
// 1) a cada 6h compara a versão instalada com a mais nova publicada (PyPI) e atualiza se houver;
// 2) se um download/prévia falhar com cara de "desatualizado", atualiza na hora e tenta de novo.
const PIP_VENV = path.join(VENV_BIN, "pip" + EXE);
const podeAtualizar = () => existsSync(PIP_VENV) && YTDLP === YTDLP_VENV;
let atualizando = null;      // promessa da atualização em curso (só uma por vez)
let ultimaForcada = 0;

function saidaDe(cmd, args, timeout = 30000) {
  return new Promise((resolve) => {
    let out = "";
    let p;
    try { p = spawn(cmd, args, { windowsHide: true }); } catch { return resolve(""); }
    const t = setTimeout(() => p.kill("SIGKILL"), timeout);
    p.stdout.on("data", (d) => (out += d));
    p.on("error", () => { clearTimeout(t); resolve(""); });
    p.on("close", () => { clearTimeout(t); resolve(out.trim()); });
  });
}

async function versaoMaisNova() {
  try {
    const r = await fetch("https://pypi.org/pypi/yt-dlp/json", { signal: AbortSignal.timeout(15000) });
    return r.ok ? (await r.json()).info.version : null;
  } catch { return null; }
}
// "2026.10.26" vs "2026.11.3": compara número a número
const maisNova = (a, b) => {
  const pa = String(a).split(".").map(Number), pb = String(b).split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
};

// forcar=true: roda o pip mesmo sem saber se há versão nova (usado depois de um erro)
function atualizarYtdlp({ forcar = false, motivo = "verificação" } = {}) {
  if (!podeAtualizar()) return Promise.resolve(false);
  if (atualizando) return atualizando;
  atualizando = (async () => {
    const antes = await saidaDe(YTDLP, ["--version"]);
    if (!forcar) {
      const nova = await versaoMaisNova();
      if (!nova || !maisNova(nova, antes)) return false;
      console.log(`yt-dlp: versão nova ${nova} (instalada ${antes}), atualizando`);
    }
    await saidaDe(PIP_VENV, ["install", "-q", "-U", "yt-dlp[default]", "deno"], 5 * 60 * 1000);
    const depois = await saidaDe(YTDLP, ["--version"]);
    const mudou = depois && depois !== antes;
    console.log(mudou ? `yt-dlp: atualizado ${antes} -> ${depois} (${motivo})` : `yt-dlp: já estava na última versão ${depois} (${motivo})`);
    return mudou;
  })().finally(() => { atualizando = null; });
  return atualizando;
}

// Erros típicos de yt-dlp desatualizado diante de mudanças do YouTube/Instagram/TikTok
const CARA_DE_DESATUALIZADO = /HTTP Error 403|Sign in to confirm|nsig|n challenge|signature|Unable to extract|Requested format is not available|Precondition|older than \d+ days|JavaScript runtime|Failed to parse|unable to download video data/i;

// Executa a operação; se falhar com cara de desatualizado, atualiza o yt-dlp e tenta mais uma vez
async function comAutoAtualizacao(operacao, nome) {
  try {
    return await operacao();
  } catch (e) {
    const msg = String(e.message || e);
    // não força mais de uma atualização a cada 10 min (se o erro for outro, não fica em loop)
    if (!CARA_DE_DESATUALIZADO.test(msg) || !podeAtualizar() || Date.now() - ultimaForcada < 10 * 60 * 1000) throw e;
    ultimaForcada = Date.now();
    console.log(`yt-dlp: ${nome} falhou com cara de desatualizado, atualizando e tentando de novo`);
    await atualizarYtdlp({ forcar: true, motivo: `erro em ${nome}` });
    return await operacao();
  }
}

setTimeout(() => atualizarYtdlp({ motivo: "ao ligar" }), 60 * 1000).unref();
setInterval(() => atualizarYtdlp({ motivo: "verificação de 6h" }), 6 * 60 * 60 * 1000).unref();

// Porta ocupada (só na instalação do Windows, BAIXAR_SUPERVISIONADO=1; no servidor tudo fica como antes):
// - se quem está nela é este mesmo app (outra cópia ligada), esta cópia espera e sai sem mexer em nada;
// - se é OUTRO programa, o app usa a próxima porta livre e grava no .env (o atalho lê a porta de lá).
// O outro programa nunca é tocado.
let portaAtual = PORT;
function quemEstaNaPorta(porta) {
  return new Promise((ok) => {
    const req = http.get({ host: "127.0.0.1", port: porta, path: "/api/sessao", timeout: 2000 }, (r) => {
      let corpo = "";
      r.on("data", (d) => { if (corpo.length < 4000) corpo += d; });
      r.on("end", () => { try { const j = JSON.parse(corpo); ok(j.instancia || (j.termoVersao ? "merge-forge" : "outro")); } catch { ok("outro"); } });
    });
    req.on("timeout", () => { req.destroy(); ok("outro"); });
    req.on("error", () => ok("outro"));
  });
}
function portaLivre(porta) {
  return new Promise((ok) => {
    const t = http.createServer();
    t.once("error", () => ok(false));
    t.listen(porta, HOST, () => t.close(() => ok(true)));
  });
}
servidor.on("error", async (e) => {
  if (e.code !== "EADDRINUSE" || process.env.BAIXAR_SUPERVISIONADO !== "1") throw e;
  const quem = await quemEstaNaPorta(portaAtual);
  if (quem === INSTANCIA || quem === "merge-forge") {
    console.warn(`porta ${portaAtual}: o Merge Forge já está ligado; esta cópia espera 60 s e sai`);
    setTimeout(() => process.exit(0), 60000);
    return;
  }
  for (let p = portaAtual + 1; p <= PORT + 50; p++) {
    if (!(await portaLivre(p))) continue;
    console.warn(`porta ${portaAtual} está com outro programa (não foi mexido): o Merge Forge passa para a porta ${p}`);
    portaAtual = p;
    await config.gravar({ PORT: String(p) }).catch(() => {});
    return ligar();
  }
  console.error(`portas ${PORT} a ${PORT + 50} ocupadas por outros programas; tentando de novo em 60 s`);
  setTimeout(() => process.exit(1), 60000);
});
function ligar() {
  servidor.listen(portaAtual, HOST);
  if (v6) { const ir = () => v6.listen(portaAtual, "::1"); if (v6.listening) v6.close(ir); else ir(); }
}
servidor.on("listening", () => {
  console.log(`baixar-redes rodando em ${HOST}:${portaAtual} (senha: ${senhaPropria ? "propria" : SENHA ? "inicial (troca obrigatoria)" : "DESLIGADA"}, yt-dlp: ${YTDLP})`);
  limparAntigos().catch(() => {});
  if (DIAS_GUARDAR) setInterval(() => limparAntigos().catch(() => {}), 60 * 60 * 1000).unref();
});
ligar();
