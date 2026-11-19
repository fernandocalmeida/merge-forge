// Folha "Baixar": cada material do vídeo em arquivo separado ou tudo num ZIP.
import { el, icone, api, aviso, abrirFolha, fecharFolha, barraProgresso } from "./app.js";
import { tarjaPreferida } from "./estudio.js";

const ICONES = {
  apostila: "book-open-text", video: "film-strip", infografico: "image", documento: "file-text", resumo: "text-align-left", mapa: "graph", "mapa-md": "graph",
  organograma: "tree-structure", tempo: "clock-countdown", perguntas: "cards", anki: "stack", transcricao: "subtitles", legendas: "closed-captioning", "infografico-texto": "article",
  "transcricao-original": "translate", "legendas-original": "closed-captioning", "video-legendado": "film-strip",
};
const DICAS = {
  apostila: "PDF com sumário clicável, cenas do vídeo, diagramas, exercícios e gabarito",
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
  legendas: "Legenda para usar com o vídeo (.srt): VLC, YouTube, editores",
  "transcricao-original": "O texto no idioma em que o vídeo foi falado",
  "legendas-original": "Legenda no idioma original (.srt)",
  "video-legendado": "O vídeo com a legenda em português gravada na imagem",
  "infografico-texto": "Os textos do pôster",
};
const ORDEM = ["apostila", "video", "video-legendado", "infografico", "documento", "resumo", "mapa", "organograma", "tempo", "perguntas", "anki", "transcricao", "legendas", "transcricao-original", "legendas-original", "mapa-md", "infografico-texto"];

const tamanho = (b) => b >= 1e9 ? (b / 1e9).toFixed(1).replace(".", ",") + " GB" : b >= 1e6 ? (b / 1e6).toFixed(1).replace(".", ",") + " MB" : b >= 1e3 ? Math.round(b / 1e3) + " KB" : b + " B";
const url = (nome, item, extra = "") => `/api/exportar?nome=${encodeURIComponent(nome)}&item=${encodeURIComponent(item)}${extra}`;

function baixar(href, rotulo) {
  const a = document.createElement("a");
  a.href = href; a.download = ""; a.rel = "noopener";
  document.body.append(a); a.click(); a.remove();
  aviso(`Baixando: ${rotulo}`, "download-simple");
}

// Celular (tela de toque): o Android não entregava itens soltos nem a apostila quando o download dependia de
// espera no servidor ou de redirecionamento. Aqui o app prepara e busca o arquivo ele mesmo e mostra
// "Salvar no celular" (toque novo, arquivo já pronto) e "Abrir ou compartilhar". No computador salva sozinho.
const toque = () => matchMedia("(pointer: coarse)").matches;
const urlApostila = (nome, extra = "") => `/api/apostila?nome=${encodeURIComponent(nome)}${extra}`;
function nomeDoCabecalho(cd) {
  const m = /filename\*=UTF-8''([^;]+)/i.exec(cd || "");
  if (m) { try { return decodeURIComponent(m[1]); } catch { /* usa o outro */ } }
  const n = /filename="([^"]+)"/i.exec(cd || "");
  return n ? n[1] : "arquivo";
}

// href: endereço do arquivo; preparar: endereço que só responde quando o arquivo está pronto (apostila);
// grande: vídeo/ZIP (não passa pela memória do app: o botão aponta direto para o endereço).
export async function entregarArquivo({ href, rotulo, preparar = null, grande = false, voltar = null }) {
  let blobUrl = null;
  const status = el("p", { class: "con-texto exp-entrega-status", texto: `Preparando ${rotulo}...` });
  const acoes = el("div", { class: "exp-zip" });
  abrirFolha([
    el("h2", { id: "folha-titulo", texto: "Baixar" }),
    el("p", { class: "meta", texto: rotulo }),
    status,
    acoes,
    voltar ? el("button", { class: "btn btn--fantasma btn--bloco", onclick: voltar }, ["Voltar à lista"]) : el("button", { class: "btn btn--fantasma btn--bloco", onclick: fecharFolha }, ["Fechar"]),
  ], { aoFechar: () => { if (blobUrl) setTimeout(() => URL.revokeObjectURL(blobUrl), 60000); } });
  const t0 = Date.now();
  const relogio = setInterval(() => { status.textContent = `Preparando ${rotulo}... ${Math.round((Date.now() - t0) / 1000)}s`; }, 500);
  try {
    if (preparar) {
      const d = await (await api(preparar)).json();
      if (!d.ok) throw new Error(d.erro || "não deu para montar");
    }
    let salvarHref = href, nomeArq = "", arquivo = null;
    if (!grande) {
      const r = await api(href);
      const tipo = r.headers.get("content-type") || "";
      if (!r.ok || tipo.includes("application/json")) {
        const erro = await r.json().then((x) => x.erro).catch(() => null);
        throw new Error(erro || `erro ${r.status}`);
      }
      const blob = await r.blob();
      nomeArq = nomeDoCabecalho(r.headers.get("content-disposition"));
      arquivo = new File([blob], nomeArq, { type: blob.type || "application/octet-stream" });
      salvarHref = blobUrl = URL.createObjectURL(blob);
    }
    clearInterval(relogio);
    status.textContent = `Pronto: ${nomeArq || rotulo}${arquivo ? ` (${tamanho(arquivo.size)})` : ""}.`;
    const salvar = el("a", { class: "btn btn--primario btn--grande btn--bloco", href: salvarHref, download: nomeArq || "", onclick: () => aviso(`Salvando: ${nomeArq || rotulo}`, "download-simple") }, [
      icone("download-simple", true), el("span", { texto: toque() ? "Salvar no celular" : "Salvar de novo" }),
    ]);
    acoes.append(salvar);
    if (arquivo && navigator.canShare && navigator.canShare({ files: [arquivo] })) {
      acoes.append(el("button", { class: "btn btn--secundario btn--bloco", onclick: () => navigator.share({ files: [arquivo], title: nomeArq }).catch(() => {}) }, [
        icone("share-network", true), el("span", { texto: "Abrir ou compartilhar" }),
      ]));
    }
    if (toque()) status.textContent += " Toque em Salvar no celular: o arquivo vai para a pasta Downloads.";
    else salvar.click(); // computador: baixa sozinho, como antes
  } catch (e) {
    clearInterval(relogio);
    status.textContent = "Não deu para preparar: " + e.message;
  }
}

export async function abrirExportar(nome, titulo) {
  abrirFolha([el("h2", { id: "folha-titulo", texto: "Baixar" }), el("p", { class: "meta", texto: "Carregando a lista..." })]);
  let d;
  try { d = await (await api(url(nome, "lista"))).json(); if (!d.ok) throw new Error(d.erro); }
  catch (e) { abrirFolha([el("h2", { id: "folha-titulo", texto: "Baixar" }), el("p", { class: "con-texto", texto: "Não deu para montar a lista: " + e.message })]); return; }

  const porId = Object.fromEntries(d.itens.map((i) => [i.id, i]));
  const temVideo = !!porId.video;
  // um arquivo só (ex.: vídeo sem estudo) não vira ZIP: o servidor manda o arquivo solto
  const soUm = d.itens.length === 1 ? d.itens[0] : null;
  const voltar = () => abrirExportar(nome, titulo);
  // um item sozinho: vídeo vai direto (grande demais para a memória do app); o resto passa por entregarArquivo
  const baixarItem = (id) => {
    const i = porId[id];
    if (id === "video" || id === "video-legendado") return baixar(url(nome, id), i.rotulo);
    if (id === "apostila") return entregarArquivo({ href: urlApostila(nome), preparar: urlApostila(nome, "&preparar=1"), rotulo: i.rotulo, voltar });
    return entregarArquivo({ href: url(nome, id), rotulo: i.rotulo, voltar });
  };
  // ZIP: se a apostila entra e ainda não existe, o servidor demora para responder; monta antes e mostra o botão pronto
  const apostilaPendente = (ids) => porId.apostila && porId.apostila.geraNaHora && !porId.apostila.bloqueada && (!ids || ids.includes("apostila"));
  const baixarZip = (href, rotulo, ids) => apostilaPendente(ids)
    ? entregarArquivo({ href, rotulo, grande: true, preparar: urlApostila(nome, "&preparar=1"), voltar })
    : baixar(href, rotulo);
  const zip = (comVideo) => el("button", { class: "btn " + (comVideo ? "btn--primario btn--grande" : "btn--secundario") + " btn--bloco", onclick: () => soUm && comVideo ? baixarItem(soUm.id) : baixarZip(url(nome, "tudo", comVideo ? "" : "&video=0"), comVideo ? "tudo em ZIP" : "materiais em ZIP", null) }, [
    icone(soUm && comVideo ? "download-simple" : comVideo ? "file-zip" : "files", comVideo),
    el("span", { texto: soUm && comVideo ? `Baixar ${soUm.rotulo.toLowerCase()} (${tamanho(soUm.tamanho)})` : comVideo ? `Baixar tudo (ZIP, ${tamanho(d.totalZip)})` : `Só os materiais, sem o vídeo (${tamanho(d.totalSemVideo)})` }),
  ]);

  // marcar itens: a caixinha seleciona para o ZIP; tocar no resto da linha baixa só aquele item
  const marcados = new Set();
  const barra = el("div", { class: "exp-sel", hidden: true });
  const atualizarBarra = () => {
    if (!marcados.size) { barra.hidden = true; return; }
    const total = [...marcados].reduce((t, id) => t + (porId[id] ? porId[id].tamanho : 0), 0);
    barra.hidden = false;
    // um item marcado vem solto, no formato dele; ZIP só com dois ou mais
    const unico = marcados.size === 1 ? [...marcados][0] : null;
    barra.replaceChildren(
      unico
        ? el("button", { class: "btn btn--primario btn--bloco", onclick: () => baixarItem(unico) }, [
          icone("download-simple", true), el("span", { class: "exp-sel-rotulo" }, ["Baixar 1 arquivo", el("small", { texto: porId[unico].geraNaHora ? "gera na hora" : tamanho(total) })]),
        ])
        : el("button", { class: "btn btn--primario btn--bloco", onclick: () => baixarZip(url(nome, "tudo", "&itens=" + encodeURIComponent([...marcados].join(","))), `${marcados.size} itens em ZIP`, [...marcados]) }, [
          icone("file-zip", true), el("span", { class: "exp-sel-rotulo" }, [`Baixar ${marcados.size} em ZIP`, el("small", { texto: tamanho(total) })]),
        ]),
      el("button", { class: "btn btn--fantasma", onclick: () => { marcados.clear(); lista.querySelectorAll("input[type=checkbox]").forEach((c) => { c.checked = false; }); atualizarBarra(); } }, ["Limpar"]),
    );
  };
  const linhas = ORDEM.filter((id) => porId[id]).map((id) => {
    const i = porId[id];
    // apostila sem tradução completa: aparece bloqueada, com o motivo, e não entra no ZIP
    if (id === "apostila" && i.bloqueada) return el("li", { class: "exp-linha exp-linha--bloqueada" }, [
      el("span", { class: "exp-marca" }),
      el("div", { class: "exp-item", "aria-disabled": "true" }, [
        el("span", { class: "exp-ic" }, [icone("lock-simple", true)]),
        el("span", { class: "exp-txt" }, [el("strong", { texto: i.rotulo + " (bloqueada)" }), el("small", { texto: i.bloqueada.charAt(0).toUpperCase() + i.bloqueada.slice(1) })]),
      ]),
    ]);
    const caixa = el("input", { type: "checkbox", class: "exp-check", "aria-label": `Marcar ${i.rotulo} para o ZIP` });
    caixa.addEventListener("change", () => { if (caixa.checked) marcados.add(id); else marcados.delete(id); atualizarBarra(); });
    return el("li", { class: "exp-linha" }, [
      el("label", { class: "exp-marca", title: "Marcar para baixar junto" }, [caixa]),
      el("a", { class: "exp-item" + (id === "apostila" ? " exp-item--destaque" : ""), href: url(nome, id), download: "", onclick: (e) => { e.preventDefault(); baixarItem(id); } }, [
        el("span", { class: "exp-ic" }, [icone(ICONES[id] || "file", true)]),
        el("span", { class: "exp-txt" }, [el("strong", { texto: i.rotulo }), el("small", { texto: DICAS[id] || i.arquivo })]),
        el("span", { class: "exp-tam mono", texto: i.geraNaHora ? "gera na hora" : tamanho(i.tamanho) }),
        icone("download-simple"),
      ]),
    ]);
  });
  const lista = el("ul", { class: "exp-lista" }, linhas);
  const gravar = temVideo && d.temEstudo && !d.audio ? cartaoLegendar(nome, titulo, d.legendaBloqueada) : null;

  abrirFolha([
    el("h2", { id: "folha-titulo", texto: "Baixar" }),
    el("p", { class: "meta", texto: titulo || nome }),
    el("div", { class: "exp-zip" }, [zip(true), temVideo && d.temEstudo ? zip(false) : null]),
    d.temEstudo ? null : el("p", { class: "con-texto", texto: "Gere o estudo com IA para baixar também resumo, mapa mental, perguntas e o resto." }),
    el("h3", { class: "exp-sub", texto: "Ou escolha o que baixar" }),
    el("p", { class: "exp-dica", texto: "Marque as caixinhas para baixar vários juntos num ZIP, ou toque num item para baixar só ele." }),
    lista,
    gravar,
    barra,
    el("button", { class: "btn btn--fantasma btn--bloco", onclick: fecharFolha }, ["Fechar"]),
  ].filter(Boolean));
}

// Vídeo com a legenda em português gravada na imagem: o servidor regrava o vídeo com o ffmpeg.
// Porcentagem real (o ffmpeg informa quanto do vídeo já foi gravado).
function cartaoLegendar(nome, titulo, bloqueio) {
  const caixa = el("div", { class: "exp-legendar" });
  // estudo antigo sem tradução: a legenda sairia no idioma original, então fica bloqueado com o motivo
  if (bloqueio) {
    caixa.classList.add("exp-legendar--bloqueado");
    caixa.replaceChildren(el("div", { class: "exp-legendar-topo" }, [
      el("span", { class: "exp-ic" }, [icone("lock-simple", true)]),
      el("span", { class: "exp-txt" }, [el("strong", { texto: "Vídeo com legenda em português (bloqueado)" }), el("small", { texto: bloqueio.charAt(0).toUpperCase() + bloqueio.slice(1) })]),
    ]));
    return caixa;
  }
  let timer = null;
  let estavaGravando = false;
  // tarja escura: cobre a legenda que o vídeo já traz gravada no idioma original (começa como no player)
  let tarja = tarjaPreferida(nome);
  const opcaoTarja = () => {
    const c = el("input", { type: "checkbox", class: "exp-check" });
    c.checked = tarja;
    c.addEventListener("change", () => { tarja = c.checked; });
    return el("label", { class: "exp-tarja" }, [c, el("span", {}, [
      el("strong", { texto: "Tarja escura atrás da legenda" }),
      el("small", { texto: "Use se o vídeo já tem legenda no idioma original: a tarja cobre a outra legenda." }),
    ])]);
  };
  const desenhar = (d) => {
    if (!caixa.isConnected && timer) { clearTimeout(timer); return; }
    if (d.estado === "pronto" && estavaGravando) { aviso("Vídeo legendado pronto.", "check-circle"); abrirExportar(nome, titulo); return; }
    const andando = d.estado === "na-fila" || d.estado === "gravando";
    estavaGravando = andando;
    const pronto = d.estado === "pronto";
    caixa.replaceChildren(...[
      el("div", { class: "exp-legendar-topo" }, [
        el("span", { class: "exp-ic" }, [icone(pronto ? "check-circle" : "subtitles", true)]),
        el("span", { class: "exp-txt" }, [
          el("strong", { texto: pronto ? "Vídeo com legenda em português: pronto" : "Vídeo com legenda em português" }),
          el("small", { texto: pronto
            ? `Gravado ${d.tarja ? "com tarja escura" : "sem tarja"}. Está na lista acima. Para trocar, grave de novo.`
            : "Grava a legenda na imagem do vídeo. Pode levar alguns minutos (vídeos longos, mais)." }),
        ]),
      ]),
      andando ? barraProgresso(d.pct || 0) : null,
      andando ? el("p", { class: "exp-dica", texto: d.estado === "na-fila" ? "Na fila..." : "Gravando a legenda no vídeo. Pode fechar esta janela: continua no computador." }) : null,
      d.estado === "erro" ? el("p", { class: "est-erro", role: "alert", texto: "Deu erro: " + d.erro }) : null,
      andando ? null : opcaoTarja(),
      andando ? null : el("button", { class: "btn btn--secundario btn--bloco", onclick: () => comecar(pronto) }, [icone(pronto ? "arrow-clockwise" : "subtitles"), pronto ? "Gravar de novo" : d.estado === "erro" ? "Tentar de novo" : "Criar vídeo legendado"]),
    ].filter(Boolean)); // sem o filtro, os "null" viravam o texto "nullnull" na tela
    if (andando) timer = setTimeout(atualizar, 1500);
  };
  async function atualizar() {
    try { desenhar(await (await api("/api/legendar?nome=" + encodeURIComponent(nome))).json()); } catch { timer = setTimeout(atualizar, 3000); }
  }
  async function comecar(refazer) {
    try {
      const d = await (await api("/api/legendar", { method: "POST", body: JSON.stringify({ nome, tarja, refazer: !!refazer }) })).json();
      if (!d.ok) throw new Error(d.erro || "não deu para começar");
      desenhar(d);
    } catch (e) { aviso("Não deu para criar: " + e.message, "warning"); }
  }
  atualizar();
  return caixa;
}
