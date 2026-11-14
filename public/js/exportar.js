// Folha "Baixar": cada material do vídeo em arquivo separado ou tudo num ZIP.
import { el, icone, api, aviso, abrirFolha, fecharFolha } from "./app.js";

const ICONES = {
  apostila: "book-open-text", video: "film-strip", infografico: "image", documento: "file-text", resumo: "text-align-left", mapa: "graph", "mapa-md": "graph",
  organograma: "tree-structure", tempo: "clock-countdown", perguntas: "cards", anki: "stack", transcricao: "subtitles", legendas: "closed-captioning", "infografico-texto": "article",
};
const DICAS = {
  apostila: "Material de curso: capa, aulas com cenas do vídeo, diagramas e exercícios",
  video: "O arquivo original",
  infografico: "O pôster em imagem",
  documento: "Tudo numa página. Abre no navegador e salva em PDF",
  resumo: "Texto (Markdown): abre no Bloco de Notas, Notion, Obsidian",
  mapa: "Abre interativo no navegador",
  "mapa-md": "Para importar no XMind, Obsidian, Markmap",
  organograma: "Texto (Markdown)",
  tempo: "Momentos com o minuto de cada um",
  perguntas: "Perguntas e respostas para revisar",
  anki: "Importa direto no Anki (cartões de memorização)",
  transcricao: "Tudo o que foi falado, com o minuto",
  legendas: "Legenda para usar com o vídeo (.srt)",
  "infografico-texto": "Os textos do pôster",
};
const ORDEM = ["apostila", "video", "infografico", "documento", "resumo", "mapa", "organograma", "tempo", "perguntas", "anki", "transcricao", "legendas", "mapa-md", "infografico-texto"];

const tamanho = (b) => b >= 1e9 ? (b / 1e9).toFixed(1).replace(".", ",") + " GB" : b >= 1e6 ? (b / 1e6).toFixed(1).replace(".", ",") + " MB" : b >= 1e3 ? Math.round(b / 1e3) + " KB" : b + " B";
const url = (nome, item, extra = "") => `/api/exportar?nome=${encodeURIComponent(nome)}&item=${encodeURIComponent(item)}${extra}`;

function baixar(href, rotulo) {
  const a = document.createElement("a");
  a.href = href; a.download = ""; a.rel = "noopener";
  document.body.append(a); a.click(); a.remove();
  aviso(`Baixando: ${rotulo}`, "download-simple");
}

export async function abrirExportar(nome, titulo) {
  abrirFolha([el("h2", { id: "folha-titulo", texto: "Baixar" }), el("p", { class: "meta", texto: "Carregando a lista..." })]);
  let d;
  try { d = await (await api(url(nome, "lista"))).json(); if (!d.ok) throw new Error(d.erro); }
  catch (e) { abrirFolha([el("h2", { id: "folha-titulo", texto: "Baixar" }), el("p", { class: "con-texto", texto: "Não deu para montar a lista: " + e.message })]); return; }

  const porId = Object.fromEntries(d.itens.map((i) => [i.id, i]));
  const temVideo = !!porId.video;
  const zip = (comVideo) => el("button", { class: "btn " + (comVideo ? "btn--primario btn--grande" : "btn--secundario") + " btn--bloco", onclick: () => baixar(url(nome, "tudo", comVideo ? "" : "&video=0"), comVideo ? "tudo em ZIP" : "materiais em ZIP") }, [
    icone(comVideo ? "file-zip" : "files", comVideo),
    el("span", { texto: comVideo ? `Baixar tudo (ZIP, ${tamanho(d.totalZip)})` : `Só os materiais, sem o vídeo (${tamanho(d.totalSemVideo)})` }),
  ]);

  // marcar itens: a caixinha seleciona para o ZIP; tocar no resto da linha baixa só aquele item
  const marcados = new Set();
  const barra = el("div", { class: "exp-sel", hidden: true });
  const atualizarBarra = () => {
    if (!marcados.size) { barra.hidden = true; return; }
    const total = [...marcados].reduce((t, id) => t + (porId[id] ? porId[id].tamanho : 0), 0);
    barra.hidden = false;
    barra.replaceChildren(
      el("button", { class: "btn btn--primario btn--bloco", onclick: () => baixar(url(nome, "tudo", "&itens=" + encodeURIComponent([...marcados].join(","))), `${marcados.size} ${marcados.size === 1 ? "item" : "itens"} em ZIP`) }, [
        icone("file-zip", true), el("span", { texto: `Baixar ${marcados.size} em ZIP · ${tamanho(total)}` }),
      ]),
      el("button", { class: "btn btn--fantasma", onclick: () => { marcados.clear(); lista.querySelectorAll("input[type=checkbox]").forEach((c) => { c.checked = false; }); atualizarBarra(); } }, ["Limpar"]),
    );
  };
  const linhas = ORDEM.filter((id) => porId[id]).map((id) => {
    const i = porId[id];
    const caixa = el("input", { type: "checkbox", class: "exp-check", "aria-label": `Marcar ${i.rotulo} para o ZIP` });
    caixa.addEventListener("change", () => { if (caixa.checked) marcados.add(id); else marcados.delete(id); atualizarBarra(); });
    return el("li", { class: "exp-linha" }, [
      el("label", { class: "exp-marca", title: "Marcar para baixar junto" }, [caixa]),
      el("a", { class: "exp-item" + (id === "apostila" ? " exp-item--destaque" : ""), href: url(nome, id), download: "", onclick: () => aviso(i.geraNaHora ? "Montando a apostila. O download começa em alguns segundos." : `Baixando: ${i.rotulo}`, i.geraNaHora ? "book-open-text" : "download-simple") }, [
        el("span", { class: "exp-ic" }, [icone(ICONES[id] || "file", true)]),
        el("span", { class: "exp-txt" }, [el("strong", { texto: i.rotulo }), el("small", { texto: DICAS[id] || i.arquivo })]),
        el("span", { class: "exp-tam mono", texto: i.geraNaHora ? "gera na hora" : tamanho(i.tamanho) }),
        icone("download-simple"),
      ]),
    ]);
  });
  const lista = el("ul", { class: "exp-lista" }, linhas);

  abrirFolha([
    el("h2", { id: "folha-titulo", texto: "Baixar" }),
    el("p", { class: "meta", texto: titulo || nome }),
    el("div", { class: "exp-zip" }, [zip(true), temVideo && d.temEstudo ? zip(false) : null]),
    d.temEstudo ? null : el("p", { class: "con-texto", texto: "Gere o estudo com IA para baixar também resumo, mapa mental, perguntas e o resto." }),
    el("h3", { class: "exp-sub", texto: "Ou escolha o que baixar" }),
    el("p", { class: "exp-dica", texto: "Marque as caixinhas para baixar vários juntos num ZIP, ou toque num item para baixar só ele." }),
    lista,
    barra,
    el("button", { class: "btn btn--fantasma btn--bloco", onclick: fecharFolha }, ["Fechar"]),
  ].filter(Boolean));
}
