// Apostila de estudo em PDF: monta um material com cara de curso a partir do estudo que já existe
// (sem chamar a IA de novo). Imagens = quadros do próprio vídeo nos momentos da linha do tempo;
// diagramas (mapa mental, organograma, linha do tempo) desenhados em HTML/CSS; PDF pelo Chrome headless.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile, copyFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const esc = (t) => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const mmss = (s) => {
  s = Math.max(0, Math.floor(Number(s) || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return (h ? `${h}:${String(m).padStart(2, "0")}` : String(m)) + ":" + String(x).padStart(2, "0");
};
const duracaoLonga = (s) => {
  s = Math.round(Number(s) || 0);
  if (!s) return null;
  const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
};

function rodar(cmd, args, { timeoutMs = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { windowsHide: true });
    let erro = "";
    const t = setTimeout(() => p.kill("SIGKILL"), timeoutMs);
    p.stderr.on("data", (d) => (erro += d.toString()));
    p.on("error", (e) => { clearTimeout(t); reject(e); });
    p.on("close", (code, sinal) => {
      clearTimeout(t);
      if (sinal === "SIGKILL") return reject(new Error(`${path.basename(cmd)} demorou demais`));
      code === 0 ? resolve() : reject(new Error(erro.trim().split("\n").slice(-2).join(" ").slice(0, 300) || `${path.basename(cmd)} saiu com codigo ${code}`));
    });
  });
}

// Chrome/Chromium instalado (servidor Linux ou Windows)
export function acharChrome() {
  const candidatos = [process.env.CHROME_BIN, "/usr/bin/google-chrome-stable", "/usr/bin/google-chrome", "/opt/google/chrome/chrome", "/usr/bin/chromium-browser", "/usr/bin/chromium",
    "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"].filter(Boolean);
  return candidatos.find((c) => existsSync(c)) || null;
}

// quadro do vídeo num segundo (jpg leve); devolve o nome do arquivo ou null
async function quadro(ffmpeg, video, segundo, destino) {
  try {
    await rodar(ffmpeg, ["-hide_banner", "-loglevel", "error", "-ss", String(Math.max(0, segundo)), "-i", video, "-frames:v", "1", "-vf", "scale=1280:-2", "-q:v", "4", "-y", destino], { timeoutMs: 30000 });
    const s = await stat(destino).catch(() => null);
    return s && s.size > 2000 ? path.basename(destino) : null;
  } catch { return null; }
}

// trecho da transcrição entre dois momentos, cortado no fim de uma frase
function trecho(transcricao, de, ate, max = 650) {
  const txt = (transcricao || []).filter((b) => b.inicio >= de - 1 && b.inicio < ate).map((b) => b.texto).join(" ").replace(/\s+/g, " ").trim();
  if (txt.length <= max) return txt;
  const corte = txt.slice(0, max);
  const fim = Math.max(corte.lastIndexOf(". "), corte.lastIndexOf("? "), corte.lastIndexOf("! "));
  return (fim > max * 0.5 ? corte.slice(0, fim + 1) : corte.replace(/\s+\S*$/, "") + "...");
}

// link para o vídeo original naquele segundo (YouTube aceita &t=; nas outras redes abre o vídeo)
function linkVideo(url, segundo) {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  try {
    const u = new URL(url);
    const yt = /(^|\.)youtube\.com$/.test(u.hostname) || u.hostname === "youtu.be";
    if (yt && Number.isFinite(segundo)) { u.searchParams.set("t", `${Math.max(0, Math.floor(segundo))}s`); }
    return u.toString();
  } catch { return null; }
}
const idSecao = { "Visão geral": "visao-geral", "Mapa do conteúdo": "mapa", "Estrutura": "estrutura", "Linha do tempo": "linha-do-tempo", "Aulas": "aula-1", "Infográfico": "infografico", "Exercícios de fixação": "exercicios", "Anotações": "anotacoes" };

const CORES = ["#c99a3c", "#3f8f99", "#7a6bb5", "#b5624f", "#4f8a5f", "#4d6a9c", "#a8794a"];

function montarHtml(e, { capa, quadros, infografico, logo, meta }) {
  const r = e.resumo || {};
  const momentos = (e.linhaDoTempo || []).slice().sort((a, b) => a.segundo - b.segundo);
  const duracao = Number(meta.duracao) || (momentos.length ? momentos[momentos.length - 1].segundo + 60 : 0);
  const aulas = momentos.map((m, i) => {
    const prox = momentos[i + 1] ? momentos[i + 1].segundo : Infinity;
    const cits = (e.citacoes || []).filter((c) => c.segundo >= m.segundo && c.segundo < prox);
    return { ...m, n: i + 1, imagem: quadros[i] || null, trecho: trecho(e.transcricao, m.segundo, prox), citacoes: cits };
  });
  const perguntas = e.perguntas || [];
  const fonte = meta.rede && meta.rede !== "arquivo" ? meta.rede.charAt(0).toUpperCase() + meta.rede.slice(1) : "Arquivo enviado";
  const data = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

  const secoes = [
    ["Visão geral", "A ideia central, o resumo e os pontos-chave"],
    (e.mapa?.ramos || []).length ? ["Mapa do conteúdo", "Os temas e como eles se ligam"] : null,
    (e.organograma?.grupos || []).length ? ["Estrutura", "Como o raciocínio está organizado"] : null,
    momentos.length ? ["Linha do tempo", "Os momentos importantes do vídeo"] : null,
    aulas.length ? ["Aulas", `${aulas.length} ${aulas.length === 1 ? "aula" : "aulas"}, uma para cada momento`] : null,
    infografico ? ["Infográfico", "O conteúdo em um pôster"] : null,
    perguntas.length ? ["Exercícios de fixação", `${perguntas.length} perguntas, com gabarito`] : null,
    ["Anotações", "Espaço para as suas ideias"],
  ].filter(Boolean);
  const numSecao = Object.fromEntries(secoes.map((s, i) => [s[0], String(i + 1).padStart(2, "0")]));
  const cab = (nome) => `<div class="sec-cab"><span class="sec-num">${numSecao[nome]}</span><h2>${esc(nome)}</h2><a class="voltar" href="#sumario">&#8593; Sumário</a></div>`;
  const urlVideo = meta.url || null;
  const assistir = (seg, texto = "&#9654; Assistir este trecho") => { const l = linkVideo(urlVideo, seg); return l ? `<a class="assistir" href="${esc(l)}">${texto}</a>` : ""; };

  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>${esc(e.titulo)} · Apostila Técnica Interativa</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&family=Geist+Mono:wght@500&display=swap" rel="stylesheet">
<style>
@page { size: A4; margin: 18mm 17mm 20mm;
  @bottom-left { content: "Merge Forge  ·  Apostila Técnica Interativa"; font: 500 8pt Geist, sans-serif; color: #9a958a; }
  @bottom-right { content: counter(page); font: 600 8pt "Geist Mono", monospace; color: #9a958a; } }
@page capa { margin: 0; @bottom-left { content: none; } @bottom-right { content: none; } }
@page cheia { margin: 10mm; @bottom-left { content: none; } @bottom-right { content: none; } }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font-family: Geist, "Segoe UI", sans-serif; color: #1c1d22; font-size: 10.5pt; line-height: 1.6; }
h1, h2, h3, h4 { margin: 0; line-height: 1.15; letter-spacing: -.01em; }
p { margin: 0 0 8pt; }
.mono { font-family: "Geist Mono", monospace; }
.quebra { break-before: page; }
.dourado { color: #a87b22; }

/* capa */
.capa { page: capa; position: relative; height: 297mm; width: 210mm; overflow: hidden; background: #0b0c10; color: #f4efe3; }
.capa-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: .55; }
.capa-veu { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(11,12,16,.82) 0%, rgba(11,12,16,.6) 22%, rgba(11,12,16,.62) 45%, rgba(11,12,16,.97) 76%); }
.capa-topo { position: absolute; top: 18mm; left: 18mm; right: 18mm; display: flex; align-items: center; gap: 10px; }
.capa-topo img { width: 34px; height: 34px; border-radius: 50%; }
.capa-topo strong { font-size: 12pt; letter-spacing: .02em; }
.capa-topo span { font-size: 9pt; color: #c8c1b0; display: block; }
.capa-corpo { position: absolute; left: 18mm; right: 18mm; bottom: 26mm; }
.capa-tag { display: inline-block; font: 700 8pt Geist; letter-spacing: .22em; text-transform: uppercase; color: #11100c; background: linear-gradient(135deg, #f3d08a, #c99a3c); padding: 5px 12px; border-radius: 999px; margin-bottom: 14px; }
.capa h1 { font-size: 34pt; font-weight: 800; line-height: 1.05; letter-spacing: -.02em; margin-bottom: 12px; }
.capa-tema { font-size: 13pt; color: #ddd5c3; max-width: 150mm; margin-bottom: 22px; }
.capa-dados { display: flex; gap: 22px; border-top: 1px solid rgba(243,208,138,.35); padding-top: 12px; font-size: 9pt; color: #c8c1b0; }
.capa-dados b { display: block; color: #f3d08a; font-weight: 600; font-size: 10pt; }

/* sumário */
.sumario h2 { font-size: 24pt; margin-bottom: 4pt; }
.sumario .sub { color: #6b6a66; margin-bottom: 18pt; }
.sum-item { display: grid; grid-template-columns: 14mm 1fr; gap: 4mm; padding: 9pt 0; border-bottom: 1px solid #ece8de; }
.sum-item .n { font: 600 18pt "Geist Mono"; color: #c99a3c; }
.sum-item strong { font-size: 12.5pt; display: block; }
.sum-item span { color: #6b6a66; font-size: 9.5pt; }
.como-usar { margin-top: 18pt; background: #f7f4ec; border-radius: 10px; padding: 12pt 14pt; font-size: 9.5pt; color: #4a4943; }
.como-usar b { color: #1c1d22; }

/* cabeçalho de seção */
.sec-cab { display: flex; align-items: baseline; gap: 10px; border-bottom: 2.5px solid #1c1d22; padding-bottom: 6pt; margin-bottom: 14pt; }
.sec-num { font: 600 11pt "Geist Mono"; color: #c99a3c; }
.sec-cab h2 { font-size: 20pt; font-weight: 800; }

/* visão geral */
.ideia { background: #14151a; color: #f4efe3; border-radius: 12px; padding: 14pt 16pt; margin-bottom: 14pt; break-inside: avoid; }
.ideia small { display: block; font: 700 7.5pt Geist; letter-spacing: .2em; text-transform: uppercase; color: #f3d08a; margin-bottom: 6pt; }
.ideia p { font-size: 12.5pt; line-height: 1.5; margin: 0; font-weight: 500; }
.resumo p { text-align: justify; hyphens: auto; }
h3.sub-tit { font-size: 13pt; margin: 14pt 0 8pt; }
.chaves { display: grid; grid-template-columns: 1fr 1fr; gap: 7pt; }
.chave { display: grid; grid-template-columns: 22pt 1fr; gap: 6pt; align-items: start; border: 1px solid #ece8de; border-radius: 9px; padding: 8pt 9pt; break-inside: avoid; font-size: 9.8pt; line-height: 1.45; }
.chave b { width: 20pt; height: 20pt; border-radius: 50%; background: linear-gradient(135deg, #f3d08a, #c99a3c); color: #1c1407; display: flex; align-items: center; justify-content: center; font: 700 9pt "Geist Mono"; }

/* mapa mental */
.mapa-centro { text-align: center; margin: 0 auto 12pt; }
.mapa-centro span { display: inline-block; background: #14151a; color: #f3d08a; font-weight: 700; font-size: 13pt; padding: 9pt 18pt; border-radius: 999px; }
.mapa-ramos { display: grid; grid-template-columns: 1fr 1fr; gap: 9pt; }
.ramo { border-radius: 10px; border: 1px solid #ece8de; overflow: hidden; break-inside: avoid; }
.ramo-tit { padding: 7pt 10pt; color: #fff; font-weight: 700; font-size: 10.5pt; }
.ramo ul { list-style: none; margin: 0; padding: 7pt 10pt 8pt; }
.ramo li { padding: 3pt 0; font-size: 9.5pt; border-bottom: 1px dashed #ece8de; }
.ramo li:last-child { border-bottom: 0; }
.ramo li b { display: block; font-size: 9.8pt; }
.ramo li span { color: #6b6a66; font-size: 8.8pt; }

/* organograma */
.org-raiz { text-align: center; margin-bottom: 0; }
.org-raiz span { display: inline-block; border: 2px solid #1c1d22; border-radius: 10px; padding: 8pt 16pt; font-weight: 800; font-size: 12pt; }
.org-tronco { width: 2px; height: 14pt; background: #1c1d22; margin: 0 auto; }
.org-grupos { display: grid; grid-template-columns: repeat(var(--n), 1fr); gap: 7pt; border-top: 2px solid #1c1d22; padding-top: 12pt; position: relative; }
.org-grupo { break-inside: avoid; position: relative; }
.org-grupo::before { content: ""; position: absolute; top: -12pt; left: 50%; width: 2px; height: 12pt; background: #1c1d22; }
.org-caixa { background: #14151a; color: #f4efe3; border-radius: 9px; padding: 7pt 8pt; text-align: center; }
.org-caixa b { display: block; font-size: 9.8pt; color: #f3d08a; }
.org-caixa span { font-size: 8.3pt; color: #d8d1c0; line-height: 1.35; display: block; margin-top: 2pt; }
.org-filhos { list-style: none; margin: 6pt 0 0; padding: 0 0 0 8pt; border-left: 2px solid #d9cfb5; }
.org-filhos li { margin: 0 0 5pt; font-size: 8.6pt; line-height: 1.35; }
.org-filhos li b { display: block; font-size: 9pt; }
.org-filhos li span { color: #6b6a66; }

/* linha do tempo */
.lt-barra { position: relative; height: 34pt; margin: 6pt 6pt 16pt; }
.lt-linha { position: absolute; left: 0; right: 0; top: 15pt; height: 3px; background: linear-gradient(90deg, #f3d08a, #c99a3c); border-radius: 3px; }
.lt-ponto { position: absolute; top: 7pt; width: 19pt; height: 19pt; margin-left: -9.5pt; border-radius: 50%; background: #14151a; color: #f3d08a; font: 700 8pt "Geist Mono"; display: flex; align-items: center; justify-content: center; border: 2px solid #fff; }
.lt-ini, .lt-fim { position: absolute; top: 25pt; font: 500 7.5pt "Geist Mono"; color: #9a958a; }
.lt-fim { right: 0; }
.lt-lista { list-style: none; margin: 0; padding: 0; }
.lt-lista li { display: grid; grid-template-columns: 24pt 16mm 1fr; gap: 6pt; padding: 6pt 0; border-bottom: 1px solid #ece8de; break-inside: avoid; font-size: 9.6pt; }
.lt-lista .n { width: 19pt; height: 19pt; border-radius: 50%; background: #14151a; color: #f3d08a; font: 700 8pt "Geist Mono"; display: flex; align-items: center; justify-content: center; }
.lt-lista .t { font: 600 9pt "Geist Mono"; color: #a87b22; padding-top: 2pt; }
.lt-lista b { display: block; }

/* aulas */
.aula { break-before: page; }
.aula-tag { font: 700 8pt Geist; letter-spacing: .2em; text-transform: uppercase; color: #a87b22; }
.aula h2 { font-size: 21pt; font-weight: 800; margin: 3pt 0 4pt; }
.aula-min { font: 500 9pt "Geist Mono"; color: #6b6a66; margin-bottom: 10pt; }
.aula-img { width: 100%; height: 88mm; object-fit: cover; border-radius: 12px; display: block; margin-bottom: 4pt; }
.aula-leg { font-size: 8pt; color: #9a958a; margin-bottom: 12pt; }
.aula-texto { font-size: 11.5pt; line-height: 1.6; margin-bottom: 12pt; }
.trecho { border-left: 3px solid #c99a3c; background: #f7f4ec; border-radius: 0 9px 9px 0; padding: 9pt 12pt; font-size: 9.6pt; color: #3d3c37; break-inside: avoid; }
.trecho small { display: block; font: 700 7.5pt Geist; letter-spacing: .18em; text-transform: uppercase; color: #a87b22; margin-bottom: 4pt; }
.citacao { margin: 12pt 0 0; padding: 0 0 0 14pt; border-left: 0; font-size: 13pt; font-weight: 600; line-height: 1.4; position: relative; break-inside: avoid; }
.citacao::before { content: "\\201C"; position: absolute; left: -2pt; top: -8pt; font-size: 34pt; color: #c99a3c; font-weight: 800; }
.citacao span { display: block; font: 500 8.5pt "Geist Mono"; color: #9a958a; margin-top: 4pt; }
.aula-fixa { margin-top: 12pt; border: 1px dashed #d9cfb5; border-radius: 9px; padding: 8pt 11pt; font-size: 9.3pt; color: #4a4943; break-inside: avoid; }
.aula-fixa b { color: #1c1d22; }

/* infográfico */
.info-pagina { page: cheia; text-align: center; }
.info-pagina img { max-width: 100%; max-height: 274mm; border-radius: 8px; }

/* exercícios */
.exercicio { break-inside: avoid; margin-bottom: 11pt; }
.exercicio b { display: block; font-size: 10.8pt; margin-bottom: 5pt; }
.exercicio .linhas { height: 34pt; background: repeating-linear-gradient(to bottom, transparent 0 16pt, #e2ddd0 16pt 17pt); }
.gabarito-item { display: grid; grid-template-columns: 18pt 1fr; gap: 5pt; padding: 6pt 0; border-bottom: 1px solid #ece8de; font-size: 9.5pt; break-inside: avoid; }
.gabarito-item .n { font: 700 9pt "Geist Mono"; color: #a87b22; }

/* anotações */
.anot { height: 225mm; background: repeating-linear-gradient(to bottom, transparent 0 22pt, #e2ddd0 22pt 23pt); }

/* links (o PDF mantém os links clicáveis) */
a { color: inherit; text-decoration: none; }
.voltar { margin-left: auto; font: 600 8pt Geist; color: #a87b22; border: 1px solid #e6d8b6; border-radius: 999px; padding: 2pt 8pt; }
.sum-tit { display: block; color: inherit; }
.sum-aulas { list-style: none; margin: 6pt 0 0; padding: 0; columns: 2; column-gap: 8mm; }
.sum-aulas li { font-size: 9pt; padding: 1.5pt 0; break-inside: avoid; }
.sum-aulas b { color: #a87b22; font-family: "Geist Mono"; font-weight: 600; }
.sum-aulas em { font-style: normal; color: #9a958a; font: 500 8pt "Geist Mono"; }
.lt-lista .lt-txt { display: block; }
.lt-lista .ir { display: block; font-size: 8pt; color: #a87b22; font-weight: 600; margin-top: 1pt; }
a.lt-ponto { color: #f3d08a; }
.aula-nav { display: flex; align-items: center; gap: 8pt; }
.aula-links { margin-left: auto; display: flex; gap: 5pt; }
.aula-links a { font: 600 7.5pt Geist; color: #6b6a66; border: 1px solid #e2ddd0; border-radius: 999px; padding: 2pt 7pt; }
.assistir { display: inline-block; margin-left: 8pt; font: 700 8.5pt Geist; color: #1c1407; background: linear-gradient(135deg, #f3d08a, #c99a3c); border-radius: 999px; padding: 2pt 9pt; }
.aula-img-link { position: relative; display: block; }
.play { position: absolute; left: 50%; top: 50%; width: 46pt; height: 46pt; margin: -23pt 0 0 -23pt; border-radius: 50%; background: rgba(11, 12, 16, .72); color: #f3d08a; font-size: 18pt; display: flex; align-items: center; justify-content: center; border: 2px solid rgba(243, 208, 138, .8); }
.citacao span a { color: #a87b22; }
.dica-ex { font-size: 9pt; color: #6b6a66; margin-bottom: 10pt; }
.ver-resp { font: 600 8pt Geist; color: #a87b22; }
.volta-ex { font: 600 8pt Geist; color: #a87b22; margin-left: 6pt; white-space: nowrap; }
.capa-dados a { color: #f3d08a; }
.site-video { color: #c8c1b0; font-size: 9pt; text-decoration: underline; }

/* contracapa */
.contracapa { page: capa; height: 297mm; width: 210mm; background: #0b0c10; color: #c8c1b0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 10px; }
.contracapa img { width: 64px; height: 64px; border-radius: 50%; }
.contracapa strong { color: #f4efe3; font-size: 16pt; }
.contracapa p { max-width: 120mm; font-size: 9.5pt; }
.contracapa .site { color: #f3d08a; font: 600 10pt "Geist Mono"; }
</style></head><body>

<section class="capa">
  ${capa ? `<img class="capa-img" src="${esc(capa)}" alt="">` : ""}
  <div class="capa-veu"></div>
  <div class="capa-topo">${logo ? `<img src="${esc(logo)}" alt="">` : ""}<div><strong>Merge Forge</strong><span>por Merge IA</span></div></div>
  <div class="capa-corpo">
    <span class="capa-tag">Apostila Técnica Interativa</span>
    <h1>${esc(e.titulo)}</h1>
    ${e.tema ? `<p class="capa-tema">${esc(e.tema)}</p>` : ""}
    <div class="capa-dados">
      ${duracaoLonga(duracao) ? `<div><b>${esc(duracaoLonga(duracao))}</b>de vídeo</div>` : ""}
      ${aulas.length ? `<div><b>${aulas.length} aulas</b>por momento</div>` : ""}
      ${perguntas.length ? `<div><b>${perguntas.length} exercícios</b>com gabarito</div>` : ""}
      <div><b>${urlVideo ? `<a href="${esc(urlVideo)}">${esc(fonte)} &#8599;</a>` : esc(fonte)}</b>origem</div>
      <div><b>${esc(data)}</b>gerada em</div>
    </div>
  </div>
</section>

<section class="sumario quebra" id="sumario">
  <h2>Sumário</h2>
  <p class="sub">${esc(e.titulo)}</p>
  ${secoes.map((s, i) => `<div class="sum-item"><a class="n" href="#${idSecao[s[0]]}">${String(i + 1).padStart(2, "0")}</a><div><a class="sum-tit" href="#${idSecao[s[0]]}"><strong>${esc(s[0])}</strong><span>${esc(s[1])}</span></a>${s[0] === "Aulas" ? `<ol class="sum-aulas">${aulas.map((a) => `<li><a href="#aula-${a.n}"><b>${a.n}.</b> ${esc(a.titulo)} <em>${mmss(a.segundo)}</em></a></li>`).join("")}</ol>` : ""}</div></div>`).join("")}
  <div class="como-usar"><b>Como estudar com esta apostila:</b> leia a visão geral, percorra o mapa do conteúdo, siga as aulas na ordem (cada uma indica o minuto do vídeo para rever o trecho) e termine com os exercícios. Confira as respostas só no final, no gabarito.</div>
</section>

<section class="quebra" id="visao-geral">
  ${cab("Visão geral")}
  ${r.tldr ? `<div class="ideia"><small>Em poucas palavras</small><p>${esc(r.tldr)}</p></div>` : ""}
  <div class="resumo">${(r.paragrafos || []).map((p) => `<p>${esc(p)}</p>`).join("")}</div>
  ${(r.pontosChave || []).length ? `<h3 class="sub-tit">Pontos-chave</h3><div class="chaves">${r.pontosChave.map((p, i) => `<div class="chave"><b>${i + 1}</b><span>${esc(p)}</span></div>`).join("")}</div>` : ""}
</section>

${(e.mapa?.ramos || []).length ? `<section class="quebra" id="mapa">
  ${cab("Mapa do conteúdo")}
  <div class="mapa-centro"><span>${esc(e.mapa.centro || e.titulo)}</span></div>
  <div class="mapa-ramos">${e.mapa.ramos.map((ramo, i) => `<div class="ramo"><div class="ramo-tit" style="background:${CORES[i % CORES.length]}">${esc(ramo.titulo)}</div><ul>${(ramo.itens || []).map((it) => `<li><b>${esc(it.titulo)}</b>${(it.detalhes || []).length ? `<span>${it.detalhes.map(esc).join(" · ")}</span>` : ""}</li>`).join("")}</ul></div>`).join("")}</div>
</section>` : ""}

${(e.organograma?.grupos || []).length ? `<section class="quebra" id="estrutura">
  ${cab("Estrutura")}
  <div class="org-raiz"><span>${esc(e.organograma.raiz || e.titulo)}</span></div>
  <div class="org-tronco"></div>
  <div class="org-grupos" style="--n:${Math.min(e.organograma.grupos.length, 4)}">${e.organograma.grupos.map((g) => `<div class="org-grupo"><div class="org-caixa"><b>${esc(g.titulo)}</b>${g.descricao ? `<span>${esc(g.descricao)}</span>` : ""}</div><ul class="org-filhos">${(g.filhos || []).map((f) => `<li><b>${esc(f.titulo)}</b>${f.descricao ? `<span>${esc(f.descricao)}</span>` : ""}</li>`).join("")}</ul></div>`).join("")}</div>
</section>` : ""}

${momentos.length ? `<section class="quebra" id="linha-do-tempo">
  ${cab("Linha do tempo")}
  <div class="lt-barra"><div class="lt-linha"></div>${momentos.map((m, i) => `<a class="lt-ponto" href="#aula-${i + 1}" style="left:${Math.min(97, Math.max(2, (m.segundo / Math.max(duracao, 1)) * 100)).toFixed(1)}%">${i + 1}</a>`).join("")}<span class="lt-ini">0:00</span><span class="lt-fim">${mmss(duracao)}</span></div>
  <ul class="lt-lista">${momentos.map((m, i) => { const l = linkVideo(urlVideo, m.segundo); return `<li><a class="n" href="#aula-${i + 1}">${i + 1}</a>${l ? `<a class="t" href="${esc(l)}">${mmss(m.segundo)}</a>` : `<span class="t">${mmss(m.segundo)}</span>`}<a class="lt-txt" href="#aula-${i + 1}"><b>${esc(m.titulo)}</b>${esc(m.texto)}<span class="ir">Ver aula ${i + 1} &#8594;</span></a></li>`; }).join("")}</ul>
</section>` : ""}

${aulas.map((a) => `<section class="aula" id="aula-${a.n}">
  <div class="aula-nav"><span class="aula-tag">Aula ${a.n} de ${aulas.length}</span><span class="aula-links">${a.n > 1 ? `<a href="#aula-${a.n - 1}">&#8592; Anterior</a>` : ""}<a href="#linha-do-tempo">Linha do tempo</a><a href="#sumario">Sumário</a>${a.n < aulas.length ? `<a href="#aula-${a.n + 1}">Próxima &#8594;</a>` : ""}</span></div>
  <h2>${esc(a.titulo)}</h2>
  <div class="aula-min">No vídeo a partir de ${mmss(a.segundo)} ${assistir(a.segundo)}</div>
  ${a.imagem ? `${linkVideo(urlVideo, a.segundo) ? `<a href="${esc(linkVideo(urlVideo, a.segundo))}" class="aula-img-link">` : ""}<img class="aula-img" src="${esc(a.imagem)}" alt="">${linkVideo(urlVideo, a.segundo) ? `<span class="play">&#9654;</span></a>` : ""}<div class="aula-leg">Cena do vídeo em ${mmss(a.segundo)}${linkVideo(urlVideo, a.segundo) ? " · toque na imagem para assistir" : ""}</div>` : ""}
  <p class="aula-texto">${esc(a.texto)}</p>
  ${a.trecho ? `<div class="trecho"><small>O que foi dito neste trecho</small>${esc(a.trecho)}</div>` : ""}
  ${a.citacoes.map((c) => `<blockquote class="citacao">${esc(c.texto)}<span>${linkVideo(urlVideo, c.segundo) ? `<a href="${esc(linkVideo(urlVideo, c.segundo))}">${mmss(c.segundo)} &#9654;</a>` : mmss(c.segundo)}</span></blockquote>`).join("")}
  <div class="aula-fixa"><b>Para fixar:</b> explique com as suas palavras o ponto principal desta aula e volte ao vídeo em ${mmss(a.segundo)} se precisar.${perguntas.length ? ` Depois, teste-se nos <a href="#exercicios">exercícios</a>.` : ""}</div>
</section>`).join("")}

${infografico ? `<section class="info-pagina quebra" id="infografico"><img src="${esc(infografico)}" alt="Infográfico"></section>` : ""}

${perguntas.length ? `<section class="quebra" id="exercicios">
  ${cab("Exercícios de fixação")}
  <p class="dica-ex">Responda nas linhas. Toque em "Ver resposta" para conferir no gabarito.</p>
  ${perguntas.map((p, i) => `<div class="exercicio" id="ex-${i + 1}"><b>${i + 1}. ${esc(p.pergunta)}</b><div class="linhas"></div><a class="ver-resp" href="#resp-${i + 1}">Ver resposta &#8594;</a></div>`).join("")}
</section>
<section class="quebra" id="gabarito">
  <div class="sec-cab"><span class="sec-num">${numSecao["Exercícios de fixação"]}</span><h2>Gabarito</h2><a class="voltar" href="#exercicios">&#8593; Exercícios</a></div>
  ${perguntas.map((p, i) => `<div class="gabarito-item" id="resp-${i + 1}"><span class="n">${i + 1}</span><div><b>${esc(p.pergunta)}</b><br>${esc(p.resposta)} <a class="volta-ex" href="#ex-${i + 1}">&#8592; voltar à pergunta</a></div></div>`).join("")}
</section>` : ""}

<section class="quebra" id="anotacoes">
  ${cab("Anotações")}
  <div class="anot"></div>
</section>

<section class="contracapa quebra">
  ${logo ? `<img src="${esc(logo)}" alt="">` : ""}
  <strong>Merge Forge</strong>
  <p>Apostila gerada automaticamente a partir do vídeo, com inteligência artificial. Confira as informações importantes no vídeo original.</p>
  <a class="site" href="https://mergeia.com.br">mergeia.com.br</a>
  ${urlVideo ? `<a class="site-video" href="${esc(urlVideo)}">Assistir ao vídeo original &#8599;</a>` : ""}
</section>
</body></html>`;
}

// gera o PDF; devolve o caminho do arquivo final
export async function gerarApostila({ estudo, video, audio, imagemInfo, meta, saida, ffmpeg = "ffmpeg", logoPath }) {
  const chrome = acharChrome();
  if (!chrome) throw new Error("o Google Chrome não está instalado neste servidor (precisa dele para gerar o PDF)");
  const pasta = await mkdtemp(path.join(tmpdir(), "apostila-"));
  try {
    const momentos = (estudo.linhaDoTempo || []).slice().sort((a, b) => a.segundo - b.segundo);
    const duracao = Number(meta.duracao) || 0;
    const quadros = [];
    let capa = null;
    if (!audio) {
      for (let i = 0; i < momentos.length; i++) {
        let t = momentos[i].segundo + 3;
        if (duracao && t > duracao - 1) t = Math.max(0, duracao - 2);
        quadros.push(await quadro(ffmpeg, video, t, path.join(pasta, `q${i + 1}.jpg`)));
      }
      capa = await quadro(ffmpeg, video, duracao ? Math.round(duracao * 0.18) : (momentos[1]?.segundo || 5), path.join(pasta, "capa.jpg"));
    }
    let infografico = null;
    if (imagemInfo && existsSync(imagemInfo)) { infografico = "infografico" + path.extname(imagemInfo); await copyFile(imagemInfo, path.join(pasta, infografico)); }
    let logo = null;
    if (logoPath && existsSync(logoPath)) { logo = "logo.png"; await copyFile(logoPath, path.join(pasta, logo)); }
    const html = montarHtml(estudo, { capa, quadros, infografico, logo, meta });
    const arqHtml = path.join(pasta, "apostila.html");
    await writeFile(arqHtml, html);
    const pdf = path.join(pasta, "apostila.pdf");
    // a página não tem script e todo texto vindo do vídeo é escapado (esc); --blink-settings=scriptEnabled=false impede o PDF
    const base = ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--hide-scrollbars",
      `--user-data-dir=${path.join(pasta, "perfil")}`, "--no-pdf-header-footer", "--generate-pdf-document-outline", `--print-to-pdf=${pdf}`, "--virtual-time-budget=15000", pathToFileURL(arqHtml).href];
    try { await rodar(chrome, base, { timeoutMs: 120000 }); }
    catch { await rodar(chrome, ["--no-sandbox", ...base], { timeoutMs: 120000 }); } // servidor sem sandbox de usuário
    const s = await stat(pdf).catch(() => null);
    if (!s || s.size < 5000) throw new Error("o Chrome não gerou o PDF");
    await writeFile(saida + ".tmp", await readFile(pdf));
    const { rename } = await import("node:fs/promises");
    await rename(saida + ".tmp", saida);
    return saida;
  } finally {
    await rm(pasta, { recursive: true, force: true }).catch(() => {});
  }
}
