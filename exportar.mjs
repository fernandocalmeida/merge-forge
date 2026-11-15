// Exportar o estudo de um vídeo: cada visão vira um arquivo (Markdown, HTML, CSV, SRT, TXT)
// e "tudo" sai num ZIP montado em streaming (o vídeo vai direto do disco, sem passar pela memória).
import { createReadStream, statSync } from "node:fs";
import zlib from "node:zlib";
import path from "node:path";

// ---------- utilidades ----------
const mmss = (s) => {
  s = Math.max(0, Math.floor(Number(s) || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return (h ? `${h}:${String(m).padStart(2, "0")}` : String(m)) + ":" + String(x).padStart(2, "0");
};
const srtTempo = (s) => {
  const ms = Math.max(0, Math.round((Number(s) || 0) * 1000));
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), x = Math.floor((ms % 60000) / 1000), r = ms % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")},${String(r).padStart(3, "0")}`;
};
const esc = (t) => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const csv = (t) => `"${String(t ?? "").replace(/"/g, '""')}"`;
export function nomeSeguro(t, max = 80) {
  let n = String(t || "video").normalize("NFC").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim();
  if (n.length > max) {
    n = n.slice(0, max);
    const corte = n.lastIndexOf(" ");
    if (corte > max * 0.5) n = n.slice(0, corte); // corta entre palavras
    n = n.replace(/\s*[(\[][^)\]]*$/, "").replace(/[\s\-.,;:]+$/, ""); // sem parêntese aberto no fim
  }
  return n || "video";
}
const rodape = "\n\n---\nGerado pelo Merge Forge, da Merge IA (https://mergeia.com.br).\n";

// ---------- cada visão em texto ----------
function resumoMd(e) {
  const r = e.resumo || {};
  return [`# ${e.titulo}`, e.tema ? `\n_${e.tema}_` : "", "\n## Em poucas palavras\n", r.tldr || "", "\n## Resumo\n",
    ...(r.paragrafos || []).map((p) => p + "\n"), "## Pontos-chave\n", ...(r.pontosChave || []).map((p) => `- ${p}`)].join("\n") + rodape;
}
function mapaMd(e) {
  const m = e.mapa || {};
  const linhas = [`# ${m.centro || e.titulo}`];
  for (const ramo of m.ramos || []) {
    linhas.push(`\n## ${ramo.titulo}`);
    for (const it of ramo.itens || []) {
      linhas.push(`\n### ${it.titulo}`);
      for (const d of it.detalhes || []) linhas.push(`- ${d}`);
    }
  }
  return linhas.join("\n") + "\n";
}
// mapa mental interativo: abre no navegador (usa o markmap pela internet)
function mapaHtml(e) {
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mapa mental: ${esc(e.titulo)}</title>
<style>html,body{margin:0;height:100%;background:#0d1117;color:#e6edf3;font-family:system-ui,sans-serif}.markmap{position:fixed;inset:0}.markmap>svg{width:100%;height:100%}
.markmap-node text,.markmap-foreign{color:#e6edf3;fill:#e6edf3}p.nota{position:fixed;left:12px;bottom:8px;margin:0;font-size:12px;opacity:.6}a{color:#e2b552}</style>
<script>window.markmap={autoLoader:{toolbar:true}}</script>
<script src="https://cdn.jsdelivr.net/npm/markmap-autoloader@0.18"></script>
</head><body>
<div class="markmap"><script type="text/template">
${mapaMd(e).replace(/<\/script/gi, "<\\/script")}
</script></div>
<p class="nota">Arraste e use a roda do mouse para navegar. Gerado pelo Merge Forge, da <a href="https://mergeia.com.br">Merge IA</a>.</p>
</body></html>`;
}
function organogramaMd(e) {
  const o = e.organograma || {};
  const linhas = [`# Organograma: ${o.raiz || e.titulo}`];
  for (const g of o.grupos || []) {
    linhas.push(`\n## ${g.titulo}`, g.descricao ? `${g.descricao}\n` : "");
    for (const f of g.filhos || []) linhas.push(`- **${f.titulo}**${f.descricao ? `: ${f.descricao}` : ""}`);
  }
  return linhas.join("\n") + rodape;
}
function tempoMd(e) {
  const linhas = [`# Linha do tempo: ${e.titulo}\n`];
  for (const m of e.linhaDoTempo || []) linhas.push(`- **[${mmss(m.segundo)}] ${m.titulo}**: ${m.texto}`);
  if ((e.citacoes || []).length) {
    linhas.push("\n## Frases marcantes\n");
    for (const c of e.citacoes) linhas.push(`> [${mmss(c.segundo)}] ${c.texto}\n`);
  }
  return linhas.join("\n") + rodape;
}
function perguntasMd(e) {
  const linhas = [`# Perguntas para revisar: ${e.titulo}\n`];
  (e.perguntas || []).forEach((p, i) => linhas.push(`## ${i + 1}. ${p.pergunta}\n`, `${p.resposta}\n`));
  return linhas.join("\n") + rodape;
}
// CSV que o Anki importa direto (frente;verso)
function perguntasCsv(e) {
  return "﻿" + (e.perguntas || []).map((p) => `${csv(p.pergunta)};${csv(p.resposta)}`).join("\r\n") + "\r\n";
}
function transcricaoTxt(e) {
  const blocos = e.transcricao || [];
  return `${e.titulo}\n\n` + blocos.map((b) => `[${mmss(b.inicio)}] ${b.texto}`).join("\n\n") + "\n";
}
// Legenda de verdade: cada bloco da transcrição (até ~20 s) é quebrado em falas curtas (até 2 linhas
// de ~42 letras), e o tempo do bloco é dividido entre elas pelo tamanho do texto.
function quebrarFala(t, max = 84) {
  const partes = [];
  let resto = String(t || "").replace(/\s+/g, " ").trim();
  while (resto.length > max) {
    const janela = resto.slice(0, max + 1);
    let corte = Math.max(janela.lastIndexOf(". "), janela.lastIndexOf("? "), janela.lastIndexOf("! "));
    if (corte < max * 0.4) corte = Math.max(janela.lastIndexOf(", "), janela.lastIndexOf("; "));
    if (corte < max * 0.4) corte = janela.lastIndexOf(" ");
    if (corte <= 0) corte = max;
    partes.push(resto.slice(0, corte + 1).trim());
    resto = resto.slice(corte + 1).trim();
  }
  if (resto) partes.push(resto);
  return partes;
}
function duasLinhas(t) {
  if (t.length <= 42) return t;
  const meio = Math.floor(t.length / 2);
  const esq = t.lastIndexOf(" ", meio), dir = t.indexOf(" ", meio);
  const c = esq < 0 ? dir : dir < 0 ? esq : meio - esq <= dir - meio ? esq : dir;
  return c > 0 ? t.slice(0, c) + "\n" + t.slice(c + 1) : t;
}
export function falasLegenda(transcricao) {
  const blocos = (transcricao || []).filter((b) => b && b.texto);
  const falas = [];
  blocos.forEach((b, i) => {
    const ini = Number(b.inicio) || 0;
    const prox = blocos[i + 1] ? Number(blocos[i + 1].inicio) : ini + Math.min(20, Math.max(3, b.texto.length / 15));
    const fim = Math.max(ini + 1, Math.min(prox, ini + 25));
    const partes = quebrarFala(b.texto);
    const total = partes.reduce((t, p) => t + p.length, 0) || 1;
    let t = ini;
    for (const p of partes) {
      const d = (fim - ini) * (p.length / total);
      falas.push({ ini: t, fim: t + d, texto: duasLinhas(p) });
      t += d;
    }
  });
  return falas;
}
export function legendasSrt(transcricao) {
  return falasLegenda(transcricao).map((f, i) => `${i + 1}\n${srtTempo(f.ini)} --> ${srtTempo(Math.max(f.ini + 0.5, f.fim - 0.05))}\n${f.texto}\n`).join("\n");
}
const NOMES_IDIOMA = { en: "inglês", es: "espanhol", fr: "francês", it: "italiano", de: "alemão", ja: "japonês", ko: "coreano", zh: "chinês", ru: "russo" };
function infograficoTexto(e) {
  const p = e.poster;
  if (!p || !(p.secoes || []).length) return null;
  const linhas = [`# ${p.titulo || "Infográfico"}`, p.subtitulo ? `_${p.subtitulo}_\n` : ""];
  for (const s of p.secoes) { linhas.push(`\n## ${s.titulo}`); for (const t of s.itens || []) linhas.push(`- ${t}`); }
  return linhas.join("\n") + rodape;
}
// documento único, bonito e pronto para imprimir em PDF
function documentoHtml(e, imagemInfo) {
  const r = e.resumo || {};
  const sec = (titulo, corpo) => corpo ? `<section><h2>${esc(titulo)}</h2>${corpo}</section>` : "";
  const lista = (itens) => itens && itens.length ? `<ul>${itens.map((t) => `<li>${t}</li>`).join("")}</ul>` : "";
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(e.titulo)}</title>
<style>
body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;max-width:820px;margin:40px auto;padding:0 20px;color:#1d1d1f;line-height:1.6}
h1{font-size:30px;line-height:1.15;margin:0 0 6px}h2{font-size:20px;margin:34px 0 10px;padding-bottom:6px;border-bottom:2px solid #e2b552}h3{font-size:16px;margin:18px 0 6px}
.tema{color:#555;margin:0 0 20px}.tldr{background:#fbf6ea;border-left:4px solid #e2b552;padding:12px 16px;border-radius:6px;font-weight:600}
.t{font-family:ui-monospace,monospace;color:#8a6a1f;font-size:13px;margin-right:6px}img{max-width:100%;border-radius:8px;margin:8px 0}
blockquote{margin:8px 0;padding:6px 14px;border-left:3px solid #ccc;color:#444}.rodape{margin-top:48px;font-size:12px;color:#777;text-align:center}
.pergunta{margin:14px 0}.pergunta b{display:block}.imprimir{position:fixed;top:14px;right:14px;padding:8px 14px;border:0;border-radius:8px;background:#e2b552;font-weight:700;cursor:pointer}
@media print{.imprimir{display:none}body{margin:0}h2{break-after:avoid}section{break-inside:auto}}
</style></head><body>
<button class="imprimir" onclick="print()">Salvar em PDF</button>
<h1>${esc(e.titulo)}</h1>${e.tema ? `<p class="tema">${esc(e.tema)}</p>` : ""}
${r.tldr ? `<p class="tldr">${esc(r.tldr)}</p>` : ""}
${sec("Resumo", (r.paragrafos || []).map((p) => `<p>${esc(p)}</p>`).join("") + (r.pontosChave?.length ? `<h3>Pontos-chave</h3>${lista(r.pontosChave.map(esc))}` : ""))}
${imagemInfo ? sec("Infográfico", `<img src="${esc(imagemInfo)}" alt="Infográfico">`) : ""}
${sec("Mapa mental", (e.mapa?.ramos || []).map((ramo) => `<h3>${esc(ramo.titulo)}</h3>${lista((ramo.itens || []).map((it) => `<b>${esc(it.titulo)}</b>${(it.detalhes || []).length ? ": " + it.detalhes.map(esc).join("; ") : ""}`))}`).join(""))}
${sec("Organograma", (e.organograma?.grupos || []).map((g) => `<h3>${esc(g.titulo)}</h3>${g.descricao ? `<p>${esc(g.descricao)}</p>` : ""}${lista((g.filhos || []).map((f) => `<b>${esc(f.titulo)}</b>${f.descricao ? ": " + esc(f.descricao) : ""}`))}`).join(""))}
${sec("Linha do tempo", lista((e.linhaDoTempo || []).map((m) => `<span class="t">${mmss(m.segundo)}</span><b>${esc(m.titulo)}</b>: ${esc(m.texto)}`)) + ((e.citacoes || []).length ? `<h3>Frases marcantes</h3>${e.citacoes.map((c) => `<blockquote><span class="t">${mmss(c.segundo)}</span>${esc(c.texto)}</blockquote>`).join("")}` : ""))}
${sec("Perguntas para revisar", (e.perguntas || []).map((p, i) => `<div class="pergunta"><b>${i + 1}. ${esc(p.pergunta)}</b>${esc(p.resposta)}</div>`).join(""))}
${sec("Transcrição", (e.transcricao || []).map((b) => `<p><span class="t">${mmss(b.inicio)}</span>${esc(b.texto)}</p>`).join(""))}
<p class="rodape">Gerado pelo Merge Forge, da <a href="https://mergeia.com.br">Merge IA</a>.</p>
</body></html>`;
}

// ---------- catálogo de itens exportáveis ----------
// cada item: { arquivo, tipo, conteudo } (texto) ou { arquivo, tipo, caminho } (arquivo do disco)
export function itensExportaveis(estudo, { video, imagemInfo, titulo, videoLegendado = null }) {
  const e = estudo || {};
  const base = nomeSeguro(titulo || e.titulo);
  const itens = {};
  if (video) itens.video = { arquivo: `${base}${path.extname(video)}`, caminho: video, rotulo: "Vídeo" };
  if (imagemInfo) itens.infografico = { arquivo: `Infográfico${path.extname(imagemInfo)}`, caminho: imagemInfo, rotulo: "Infográfico (imagem)" };
  if (!estudo) return itens;
  const md = "text/markdown; charset=utf-8";
  itens.documento = { arquivo: `${base} - estudo completo.html`, tipo: "text/html; charset=utf-8", conteudo: documentoHtml(e, imagemInfo ? `Infográfico${path.extname(imagemInfo)}` : null), rotulo: "Documento completo" };
  itens.resumo = { arquivo: "Resumo.md", tipo: md, conteudo: resumoMd(e), rotulo: "Resumo" };
  itens.mapa = { arquivo: "Mapa mental.html", tipo: "text/html; charset=utf-8", conteudo: mapaHtml(e), rotulo: "Mapa mental" };
  itens["mapa-md"] = { arquivo: "Mapa mental.md", tipo: md, conteudo: mapaMd(e), rotulo: "Mapa mental (Markdown)" };
  itens.organograma = { arquivo: "Organograma.md", tipo: md, conteudo: organogramaMd(e), rotulo: "Organograma" };
  itens.tempo = { arquivo: "Linha do tempo.md", tipo: md, conteudo: tempoMd(e), rotulo: "Linha do tempo" };
  itens.perguntas = { arquivo: "Perguntas.md", tipo: md, conteudo: perguntasMd(e), rotulo: "Perguntas" };
  itens.anki = { arquivo: "Perguntas (Anki).csv", tipo: "text/csv; charset=utf-8", conteudo: perguntasCsv(e), rotulo: "Perguntas para o Anki" };
  if ((e.transcricao || []).length) {
    itens.transcricao = { arquivo: "Transcrição.txt", tipo: "text/plain; charset=utf-8", conteudo: transcricaoTxt(e), rotulo: "Transcrição" };
    // "nome.pt-BR.srt" ao lado do vídeo: VLC e outros players reconhecem como legenda em português
    // só marca ".pt-BR" quando o texto é mesmo português (traduzido ou vídeo já em português)
    const emPt = e.traduzida || e.idiomaOriginal === "pt";
    itens.legendas = { arquivo: emPt ? `${base}.pt-BR.srt` : `${base}.srt`, tipo: "application/x-subrip; charset=utf-8", conteudo: legendasSrt(e.transcricao), rotulo: e.traduzida ? "Legenda em português (.srt)" : "Legendas (.srt)" };
  }
  if (e.traduzida && (e.transcricaoOriginal || []).length) {
    const idioma = e.idiomaOriginal || "original";
    itens["transcricao-original"] = { arquivo: `Transcrição original (${NOMES_IDIOMA[idioma] || idioma}).txt`, tipo: "text/plain; charset=utf-8", conteudo: transcricaoTxt({ titulo: e.titulo, transcricao: e.transcricaoOriginal }), rotulo: `Transcrição original (${NOMES_IDIOMA[idioma] || idioma})` };
    itens["legendas-original"] = { arquivo: `${base}.${idioma}.srt`, tipo: "application/x-subrip; charset=utf-8", conteudo: legendasSrt(e.transcricaoOriginal), rotulo: `Legenda original (${NOMES_IDIOMA[idioma] || idioma}, .srt)` };
  }
  if (videoLegendado) itens["video-legendado"] = { arquivo: `${base} (legendado em português).mp4`, caminho: videoLegendado, rotulo: "Vídeo com legenda em português" };
  const infoTxt = infograficoTexto(e);
  if (infoTxt) itens["infografico-texto"] = { arquivo: "Infográfico (texto).md", tipo: md, conteudo: infoTxt, rotulo: "Texto do infográfico" };
  return itens;
}

// ---------- ZIP em streaming ----------
// Entradas com "data descriptor" (CRC e tamanho vão depois dos dados), nomes em UTF-8.
// Texto é comprimido; vídeo e imagem vão sem compressão (já são comprimidos). Sem ZIP64: até 4 GB.
const tabelaCrc = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf, crc = 0) {
  if (typeof zlib.crc32 === "function") return zlib.crc32(buf, crc);
  let c = ~crc >>> 0;
  for (let i = 0; i < buf.length; i++) c = tabelaCrc[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}
function dataDos(d = new Date()) {
  const tempo = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const data = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { tempo, data };
}
// escreve respeitando o ritmo da conexão; os ouvintes são removidos a cada volta (sem acumular)
const escrever = (res, buf) => new Promise((ok, falha) => {
  if (res.destroyed) return falha(new Error("conexão fechada"));
  if (res.write(buf)) return ok();
  const seguiu = () => { res.off("close", fechou); ok(); };
  const fechou = () => { res.off("drain", seguiu); falha(new Error("conexão fechada")); };
  res.once("drain", seguiu);
  res.once("close", fechou);
});

export async function enviarZip(res, entradas, nomeZip) {
  res.writeHead(200, {
    "Content-Type": "application/zip",
    "Content-Disposition": disposicao(nomeZip),
    "Cache-Control": "no-store",
  });
  const { tempo, data } = dataDos();
  const central = [];
  let offset = 0;
  for (const ent of entradas) {
    const nome = Buffer.from(ent.nome, "utf8");
    const comprimir = ent.conteudo !== undefined;
    const metodo = comprimir ? 8 : 0;
    const cab = Buffer.alloc(30);
    cab.writeUInt32LE(0x04034b50, 0); cab.writeUInt16LE(20, 4); cab.writeUInt16LE(0x0808, 6); cab.writeUInt16LE(metodo, 8);
    cab.writeUInt16LE(tempo, 10); cab.writeUInt16LE(data, 12); // crc/tamanhos = 0 (vão no descriptor)
    cab.writeUInt16LE(nome.length, 26); cab.writeUInt16LE(0, 28);
    await escrever(res, Buffer.concat([cab, nome]));
    let crc = 0, tamanho = 0, comprimido = 0;
    if (comprimir) {
      const bruto = Buffer.isBuffer(ent.conteudo) ? ent.conteudo : Buffer.from(ent.conteudo, "utf8");
      crc = crc32(bruto); tamanho = bruto.length;
      const z = zlib.deflateRawSync(bruto, { level: 9 });
      comprimido = z.length;
      await escrever(res, z);
    } else {
      for await (const pedaco of createReadStream(ent.caminho, { highWaterMark: 1 << 20 })) {
        crc = crc32(pedaco, crc); tamanho += pedaco.length;
        await escrever(res, pedaco);
      }
      comprimido = tamanho;
    }
    const desc = Buffer.alloc(16);
    desc.writeUInt32LE(0x08074b50, 0); desc.writeUInt32LE(crc >>> 0, 4); desc.writeUInt32LE(comprimido, 8); desc.writeUInt32LE(tamanho, 12);
    await escrever(res, desc);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(0x031e, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0808, 8); c.writeUInt16LE(metodo, 10);
    c.writeUInt16LE(tempo, 12); c.writeUInt16LE(data, 14); c.writeUInt32LE(crc >>> 0, 16); c.writeUInt32LE(comprimido, 20); c.writeUInt32LE(tamanho, 24);
    c.writeUInt16LE(nome.length, 28); c.writeUInt32LE((0o100644 << 16) >>> 0, 38); c.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([c, nome]));
    offset += 30 + nome.length + comprimido + 16;
  }
  const dir = Buffer.concat(central);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0); fim.writeUInt16LE(entradas.length, 8); fim.writeUInt16LE(entradas.length, 10);
  fim.writeUInt32LE(dir.length, 12); fim.writeUInt32LE(offset, 16);
  await escrever(res, Buffer.concat([dir, fim]));
  res.end();
}

// nome do arquivo no download, com acentos (RFC 5987) e uma versão ASCII de reserva
export function disposicao(nome) {
  const ascii = nome.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nome)}`;
}

// tamanho aproximado do ZIP (para avisar antes de baixar vídeos grandes)
export function tamanhoAproximado(itens) {
  let t = 0;
  for (const it of Object.values(itens)) t += it.caminho ? statSync(it.caminho).size : Buffer.byteLength(it.conteudo || "");
  return t;
}
