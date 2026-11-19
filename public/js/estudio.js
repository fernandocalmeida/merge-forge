// Estúdio IA: escolhe um vídeo, gera o estudo e mostra em 7 visões interativas.
import { $, $$, el, icone, api, aviso, duracao, linkArquivo, irPara, barraProgresso } from "./app.js";
import { abrirConexoes, aoMudarConexao, abrirReconectar } from "./conexoes.js";
import { montarPoster } from "./poster.js";
import { abrirExportar, baixarApostila } from "./exportar.js";
import { chipRede, redeDoNome } from "./redes.js";

const ICONES_DESTAQUE = {
  ideia: "lightbulb", alerta: "warning", dinheiro: "currency-circle-dollar", tempo: "clock", pessoas: "users-three",
  crescimento: "trend-up", ferramenta: "wrench", alvo: "target", livro: "book-open", coracao: "heart", foguete: "rocket-launch", check: "check-circle",
};
export const VISOES = [
  { id: "resumo", nome: "Resumo", icone: "text-align-left" },
  { id: "mapa", nome: "Mapa mental", icone: "graph" },
  { id: "organograma", nome: "Organograma", icone: "tree-structure" },
  { id: "infografico", nome: "Infográfico", icone: "image" },
  { id: "tempo", nome: "Linha do tempo", icone: "clock-countdown" },
  { id: "perguntas", nome: "Perguntas", icone: "cards" },
  { id: "transcricao", nome: "Transcrição", icone: "subtitles" },
];

let alvo = null;          // container onde o estúdio desenha (tela Estúdio ou painel embaixo)
let modoPainel = false;   // true quando está num painel dentro de Baixar/Biblioteca
let aoFecharPainel = null;
let ctx = null;           // { biblioteca(), recarregar() }
let atual = null;         // nome do arquivo em estudo
let visao = "resumo";
let estudo = null;
let player = null;
let sondagem = null;
let iaInfo = null;

const nomeDe = (it) => it.titulo || it.nome.replace(/^\d{8}_[a-z]+_/, "").replace(/_[A-Za-z0-9_-]{6,}_(1080p|720p|480p|audio)\.[a-z0-9]+$/i, "").replace(/\.[a-z0-9]+$/i, "");

let gerarAoAbrir = false;
// conta com problema (login expirado, chave apagada): abre a reconexão ali mesmo e, quando voltar, gera de novo
const ANDAMENTO = ["na-fila", "transcrevendo", "traduzindo", "analisando"];
let estadoAnterior = {};
function reconectarConta(it, conta, motivo, refazer = false) {
  abrirReconectar(conta, { motivo, rotulo: "Gerar estudo com IA", aoConectar: () => gerar(it, refazer) });
}
// abre o estudo de um vídeo direto numa visão; se ainda não existir, já começa a gerar
export function abrirEstudo(nome, qualVisao = "resumo", gerar = false) {
  atual = nome;
  visao = qualVisao || "resumo";
  estudo = null;
  gerarAoAbrir = gerar;
}

export async function montarEstudio(container, contexto) {
  if (modoPainel && alvo && alvo !== container) $$("video, audio", alvo).forEach((m) => m.pause());
  modoPainel = false;
  alvo = container;
  ctx = contexto;
  pararSondagem();
  if (!iaInfo || !iaInfo.configurada) { try { iaInfo = await (await api("/api/ia")).json(); } catch { iaInfo = iaInfo || { configurada: false }; } }
  if (!atual) return escolher();
  const it = ctx.biblioteca().find((i) => i.nome === atual);
  if (!it) { atual = null; return escolher(); }
  await carregar(it);
}

// Painel embaixo, na própria tela: abre o vídeo direto na visão escolhida (e gera se precisar)
export async function abrirPainelIA(container, it, qualVisao, contexto, { aoFechar, gerar = false } = {}) {
  pararSondagem();
  if (alvo && alvo !== container) $$("video, audio", alvo).forEach((m) => m.pause());
  alvo = container;
  ctx = contexto;
  modoPainel = true;
  aoFecharPainel = aoFechar || null;
  abrirEstudo(it.nome, qualVisao, gerar);
  try { iaInfo = await (await api("/api/ia")).json(); } catch { iaInfo = iaInfo || { configurada: false }; }
  const daLista = ctx.biblioteca().find((i) => i.nome === it.nome);
  await carregar(daLista || it);
}

function pararSondagem() { clearTimeout(sondagem); sondagem = null; }

// ---------------------------------------------------------------------
// escolher um vídeo
// ---------------------------------------------------------------------
function escolher() {
  const itens = ctx.biblioteca();
  if (!itens.length) {
    alvo.replaceChildren(el("div", { class: "vazio" }, [
      icone("sparkle"), el("h3", { texto: "Baixe um vídeo primeiro" }),
      el("p", { texto: "Depois é só escolher aqui para gerar o resumo, o mapa mental e o resto." }),
      el("button", { class: "btn btn--primario", onclick: () => irPara("baixar") }, [icone("download-simple"), "Ir para Baixar"]),
    ]));
    return;
  }
  alvo.replaceChildren(...[
    iaInfo && !iaInfo.configurada ? avisoIa() : null,
    el("h2", { class: "bloco-titulo", texto: "Escolha um vídeo" }),
    el("div", { class: "escolha" }, itens.map((it, i) => {
      const b = el("button", { class: "escolha-item", style: `--i:${Math.min(i, 12)}` }, [
        el("div", { class: "capa" }, [it.thumb ? el("img", { src: it.thumb, alt: "", loading: "lazy", referrerpolicy: "no-referrer", onerror: (e) => e.target.remove() }) : icone(it.audio ? "music-notes" : "film-strip")]),
        el("div", { class: "info" }, [
          el("strong", { texto: nomeDe(it) }),
          el("span", {}, [chipRede(it.rede || redeDoNome(it.nome)), it.duracao ? el("span", { class: "mono", texto: duracao(it.duracao) }) : null]),
        ]),
        it.temEstudo ? el("span", { class: "selo" }, [icone("sparkle", true), "Pronto"]) : el("span", { class: "seta" }, [icone("caret-right")]),
      ]);
      b.addEventListener("click", () => { abrirEstudo(it.nome); montarEstudio(alvo, ctx); });
      return b;
    })),
  ].filter(Boolean));
}

function avisoIa(it) {
  return el("div", { class: "cartao aviso-ia" }, [
    icone("plugs"),
    el("div", {}, [
      el("strong", { texto: "Conecte sua conta Claude para usar o Estúdio" }),
      el("p", { texto: "Leva um minuto: você entra com a sua conta e o app passa a gerar os estudos na sua assinatura." }),
      el("button", { class: "btn btn--primario", style: "margin-top:12px", onclick: () => (it ? reconectarConta(it, "claude", "conecte a conta Claude para gerar o estudo") : abrirConexoes()) }, [icone("plugs-connected"), "Conectar agora"]),
    ]),
  ]);
}

// quando uma conta é conectada ou desconectada, o Estúdio se atualiza sozinho
aoMudarConexao((s) => {
  if (!s) return;
  const antes = iaInfo && iaInfo.configurada;
  iaInfo = s;
  if (antes !== s.configurada && alvo && ctx && $("#tela-estudio").dataset.ativa === "1") montarEstudio(alvo, ctx);
});

// ---------------------------------------------------------------------
// vídeo escolhido
// ---------------------------------------------------------------------
async function carregar(it) {
  let d;
  try { d = await (await api("/api/estudo?nome=" + encodeURIComponent(it.nome))).json(); }
  catch (e) { d = { estado: "erro", erro: e.message }; }
  if (d.estado === "pronto") { estudo = d.estudo; window.dispatchEvent(new CustomEvent("estudo-pronto", { detail: it.nome })); }
  if (gerarAoAbrir && (d.estado === "nenhum" || d.estado === "erro")) {
    gerarAoAbrir = false;
    if (iaInfo && iaInfo.configurada) return gerar(it, false);
    abrirConexoes();
  }
  gerarAoAbrir = false;
  // o estudo acabou de falhar por causa de uma conta enquanto a pessoa olhava: abre a reconexão na hora
  if (d.estado === "erro" && d.conta && ANDAMENTO.includes(estadoAnterior[it.nome])) reconectarConta(it, d.conta, d.erro);
  estadoAnterior[it.nome] = d.estado;
  desenhar(it, d);
  if (["na-fila", "transcrevendo", "traduzindo", "analisando"].includes(d.estado)) sondagem = setTimeout(() => carregar(it), 2500);
}

function desenhar(it, d) {
  // o player só é criado uma vez por vídeo: atualizar a tela não pode reiniciar o que está tocando
  if (!alvo.isConnected) return; // painel fechado enquanto carregava
  const grade = $(".est-grade", alvo);
  const mesmoVideo = grade && grade.dataset.nome === it.nome;
  if (!mesmoVideo) {
    player = el(it.audio ? "audio" : "video", { src: linkArquivo(it.nome), controls: true, playsinline: true, preload: "metadata", class: "est-midia" });
    alvo.replaceChildren(el("div", { class: "est-grade" + (modoPainel ? " est-grade--painel" : ""), "data-nome": it.nome }, [
      el("aside", { class: "est-lado" }, [el("div", { class: "cartao est-player" }, [el("div", { class: "est-video" }, [player]), el("div", { class: "est-cabeca" })])]),
      el("section", { class: "est-principal" }),
    ]));
  }
  $(".est-cabeca", alvo).replaceChildren(
    el("div", { class: "est-titulo" }, [
      el("h2", { texto: (estudo && estudo.titulo) || nomeDe(it) }),
      estudo && estudo.tema ? el("p", { texto: estudo.tema }) : null,
    ]),
    el("div", { class: "est-botoes" }, [
      modoPainel
        ? el("button", { class: "btn btn--secundario", onclick: () => { const v = visao; const nome = it.nome; pararSondagem(); if (aoFecharPainel) aoFecharPainel(); abrirEstudo(nome, v, false); irPara("estudio"); } }, [icone("arrows-out"), "Tela cheia"])
        : el("button", { class: "btn btn--secundario", onclick: () => { atual = null; estudo = null; pararSondagem(); escolher(); } }, [icone("swap"), "Trocar vídeo"]),
      el("button", { class: "btn btn--primario", onclick: () => abrirExportar(it.nome, (estudo && estudo.titulo) || nomeDe(it)) }, [icone("download-simple", true), "Baixar"]),
      estudo ? botaoApostila(it, d.apostilaBloqueada) : null,
      estudo ? botaoCopiar() : null,
      estudo ? el("button", { class: "btn btn--fantasma btn--icone", "aria-label": "Gerar de novo", title: "Gerar de novo", onclick: () => gerar(it, true) }, [icone("arrow-clockwise")]) : null,
    ]),
  );

  let principal;
  if (d.estado === "pronto") principal = painelEstudo();
  else if (["na-fila", "transcrevendo", "traduzindo", "analisando"].includes(d.estado)) principal = progresso(d, it);
  else principal = convite(it, d);
  $(".est-principal", alvo).replaceChildren(principal);
  if (d.estado === "pronto") mostrarVisao(visao);
  ajustarLegenda(it, d);
}

// ---------------------------------------------------------------------
// legenda em português no player: chave liga/desliga + tarja escura opcional
// (a tarja cobre a legenda que o vídeo já traz gravada no idioma original; o app não tem
// como detectar isso sozinho, então é uma escolha da pessoa, guardada por vídeo)
// ---------------------------------------------------------------------
const PREF_LEGENDA = "forge-legenda:";
function prefLegenda(nome, ligadaPadrao) {
  let p = {};
  try { p = JSON.parse(localStorage.getItem(PREF_LEGENDA + nome) || "{}") || {}; } catch { p = {}; }
  return { ligada: typeof p.ligada === "boolean" ? p.ligada : ligadaPadrao, tarja: !!p.tarja };
}
function gravarPrefLegenda(nome, p) { try { localStorage.setItem(PREF_LEGENDA + nome, JSON.stringify(p)); } catch { /* sem armazenamento: vale só nesta tela */ } }
// usado pela folha Baixar: o vídeo legendado já nasce com a mesma escolha de tarja do player
export const tarjaPreferida = (nome) => prefLegenda(nome, true).tarja;

function chave(rotulo, dica, ligada, aoMudar) {
  const b = el("button", { type: "button", class: "chave", role: "switch", "aria-checked": String(ligada), title: dica }, [
    el("span", { class: "chave-trilho", "aria-hidden": "true" }, [el("span", { class: "chave-bolinha" })]),
    el("span", { class: "chave-rotulo", texto: rotulo }),
  ]);
  b.addEventListener("click", () => { const v = b.getAttribute("aria-checked") !== "true"; b.setAttribute("aria-checked", String(v)); aoMudar(v); });
  return b;
}

const tirarTrilhas = () => { for (const t of [...player.querySelectorAll("track")]) t.parentNode.removeChild(t); };

// Tarja = faixa escura de ponta a ponta no rodapé do vídeo, com a nossa legenda dentro.
// Uma caixa só atrás das nossas letras não cobria a legenda original quando ela fica um pouco
// mais acima (ex.: o vídeo do Big Bang); a faixa cobre o rodapé inteiro. Com a faixa ligada,
// quem desenha a legenda é o app (a do navegador ficaria por baixo da faixa).
function ajustarLegenda(it, d) {
  const lugar = $(".est-player", alvo);
  const moldura = player && player.parentNode;
  if (!lugar || !player || !moldura || !moldura.classList.contains("est-video")) return;
  const barra = $(".est-legenda", lugar);
  const pode = !it.audio && d.estado === "pronto" && estudo && (estudo.transcricao || []).length && !d.apostilaBloqueada;
  if (!pode) {
    if (barra) barra.parentNode.removeChild(barra);
    tirarTrilhas();
    moldura.classList.toggle("est-video--faixa", false);
    if (player.controlsList) player.controlsList.remove("nofullscreen");
    reaplicarLegenda = null;
    return;
  }
  if (barra && barra.dataset.nome === it.nome) return; // já montado para este vídeo
  // ligada por padrão quando a legenda é uma tradução (é para isso que ela existe)
  const p = prefLegenda(it.nome, !!estudo.traduzida);
  tirarTrilhas();
  const trilha = el("track", { kind: "subtitles", srclang: "pt", label: "Português", src: "/api/legenda.vtt?nome=" + encodeURIComponent(it.nome) + "&v=" + Date.now() });
  player.append(trilha);
  let faixa = $(".est-faixa", moldura);
  if (!faixa) { faixa = el("div", { class: "est-faixa", "aria-hidden": "true" }, [el("span")]); moldura.append(faixa); }
  // botão próprio de tela cheia (só aparece com a faixa): põe a moldura inteira (vídeo + faixa) em tela cheia
  if (!$(".est-tela-cheia", moldura)) {
    const bTela = el("button", { type: "button", class: "est-tela-cheia", title: "Tela cheia com a faixa (Esc para sair)", "aria-label": "Tela cheia" }, [icone("corners-out")]);
    bTela.addEventListener("click", alternarTelaCheia);
    moldura.append(bTela);
    // duplo clique no vídeo também alterna (o do navegador fica desligado com a faixa)
    moldura.addEventListener("dblclick", (e) => { if (moldura.classList.contains("est-video--faixa") && e.target === player) alternarTelaCheia(); });
  }
  const textoFaixa = faixa.firstChild;
  const atualizarFaixa = () => {
    const ativas = trilha.track.activeCues ? [...trilha.track.activeCues] : [];
    textoFaixa.textContent = ativas.map((c) => c.text).join("\n");
  };
  trilha.track.oncuechange = atualizarFaixa;
  let chTarja = null;
  let aplicando = false;
  const aplicar = () => {
    aplicando = true;
    const comFaixa = p.ligada && p.tarja;
    // tela cheia só do vídeo (caso raro: navegador que ignora o "nofullscreen"): sem faixa ali, a legenda vai pelo próprio player
    const soVideo = document.fullscreenElement === player;
    trilha.track.mode = !p.ligada ? "disabled" : comFaixa && !soVideo ? "hidden" : "showing";
    moldura.classList.toggle("est-video--faixa", comFaixa);
    // com a faixa, a tela cheia do próprio player deixaria a faixa de fora: esconde esse botão e usa o nosso
    if (player.controlsList) player.controlsList.toggle("nofullscreen", comFaixa);
    if (chTarja) chTarja.disabled = !p.ligada;
    atualizarFaixa();
    aplicando = false;
  };
  const chLegenda = chave(estudo.traduzida ? "Legenda em português" : "Legenda", "Mostra a legenda em português no vídeo", p.ligada, (v) => { p.ligada = v; gravarPrefLegenda(it.nome, p); aplicar(); });
  chTarja = chave("Tarja escura", "Faixa escura no rodapé do vídeo, para cobrir a legenda que o vídeo já traz", p.tarja, (v) => { p.tarja = v; gravarPrefLegenda(it.nome, p); aplicar(); });
  // se a pessoa usar o botão de legendas do próprio player, a chave acompanha
  player.textTracks.onchange = () => {
    if (aplicando || document.fullscreenElement === player) return;
    const modo = trilha.track.mode;
    const ligada = modo === "showing" || (modo === "hidden" && p.tarja && p.ligada);
    if (ligada !== p.ligada) { p.ligada = ligada; gravarPrefLegenda(it.nome, p); chLegenda.setAttribute("aria-checked", String(ligada)); }
    if (modo === "showing" && p.tarja) aplicar(); // escolheu a legenda no menu do player com a faixa ligada
    else if (chTarja) chTarja.disabled = !p.ligada;
  };
  const nova = el("div", { class: "est-legenda", "data-nome": it.nome, role: "group", "aria-label": "Legenda do vídeo" }, [icone("subtitles"), chLegenda, chTarja]);
  if (barra) barra.replaceWith(nova); else moldura.after(nova);
  aplicar();
  // a trilha só fica pronta depois de carregar o arquivo: reaplica quando chegar
  trilha.addEventListener("load", aplicar);
  reaplicarLegenda = aplicar;
}
let reaplicarLegenda = null;

// Tela cheia com a faixa: tem de ser a moldura (vídeo + faixa juntos), pedida direto no clique.
// (Sair da tela cheia do vídeo e pedir a da moldura depois não funciona: o navegador só aceita
// tela cheia logo após um clique, e o clique já foi gasto na primeira. Testado no Chrome.)
function alternarTelaCheia() {
  const moldura = player && player.parentNode;
  if (!moldura) return;
  if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
  if (moldura.requestFullscreen) moldura.requestFullscreen().catch(() => aviso("Este navegador não deixou abrir a tela cheia."));
}
// entrou/saiu da tela cheia: troca o ícone e, se for só o vídeo, a legenda passa para o player
document.addEventListener("fullscreenchange", () => {
  const f = document.fullscreenElement;
  for (const b of $$(".est-tela-cheia")) {
    const dentro = !!f && f.contains(b);
    b.replaceChildren(icone(dentro ? "corners-in" : "corners-out"));
    b.setAttribute("aria-label", dentro ? "Sair da tela cheia" : "Tela cheia");
    b.title = dentro ? "Sair da tela cheia (Esc)" : "Tela cheia com a faixa (Esc para sair)";
  }
  if (reaplicarLegenda) reaplicarLegenda();
});

function convite(it, d) {
  const configurada = iaInfo && iaInfo.configurada;
  const btn = el("button", { class: "btn btn--primario btn--grande", disabled: !configurada }, [el("span", { class: "rotulo" }, [icone("sparkle", true), "Gerar estudo com IA"])]);
  btn.addEventListener("click", () => gerar(it, false, btn));
  return el("div", { class: "cartao est-convite" }, [
    el("div", { class: "brilho-ia" }, [icone("sparkle", true)]),
    el("h2", { texto: "Transforme este vídeo em material de estudo" }),
    el("p", { texto: "A IA lê uma vez o que foi falado e monta todo o material de estudo de uma vez só. É o jeito mais rápido e econômico." }),
    el("ul", { class: "est-inclui", "aria-label": "O que vai ser gerado" }, VISOES.map((v) => el("li", {}, [
      icone(v.icone, true), el("span", { texto: v.nome }), el("small", { texto: v.id === "infografico" ? "à parte, quando quiser" : "incluído" }),
    ]))),
    d.estado === "erro" ? el("p", { class: "est-erro", role: "alert" }, [icone("warning-circle", true), el("span", { texto: "Da última vez deu erro: " + d.erro })]) : null,
    d.estado === "erro" && d.conta ? el("button", { class: "btn btn--secundario", onclick: () => reconectarConta(it, d.conta, d.erro) }, [icone("plugs-connected"), "Reconectar a conta e gerar de novo"]) : null,
    configurada ? btn : avisoIa(it),
    el("p", { class: "est-nota", texto: "Vídeos curtos ficam prontos em menos de um minuto. Vídeos longos podem levar alguns minutos." }),
  ]);
}

async function gerar(it, refazer, btn) {
  if (btn) { btn.dataset.estado = "carregando"; btn.disabled = true; }
  try {
    const r = await api("/api/estudo", { method: "POST", body: JSON.stringify({ nome: it.nome, refazer }) });
    const d = await r.json();
    if (!d.ok && d.conta) {
      // conferência antes de gerar achou conta com problema: reconecta aqui mesmo
      if (btn) { btn.dataset.estado = ""; btn.disabled = false; }
      return reconectarConta(it, d.conta, d.erro, refazer);
    }
    if (!d.ok) throw new Error(d.erro || "não deu para começar");
    estudo = null;
    ctx.recarregar();
    carregar(it);
  } catch (e) {
    if (btn) { btn.dataset.estado = ""; btn.disabled = false; }
    aviso("Não deu para gerar: " + e.message, "warning");
  }
}

// Cancelar estudo: dois toques (o primeiro só pede confirmação), igual ao Excluir
function botaoCancelar(it) {
  const b = el("button", { class: "btn btn--fantasma est-cancelar" }, [icone("x-circle"), el("span", { class: "rotulo", texto: "Cancelar estudo" })]);
  let armado = null;
  b.addEventListener("click", async () => {
    if (!armado) {
      $(".rotulo", b).textContent = "Toque de novo para cancelar";
      armado = setTimeout(() => { armado = null; $(".rotulo", b).textContent = "Cancelar estudo"; }, 4000);
      return;
    }
    clearTimeout(armado);
    b.disabled = true;
    $(".rotulo", b).textContent = "Cancelando...";
    try {
      const d = await (await api("/api/estudo/cancelar", { method: "POST", body: JSON.stringify({ nome: it.nome }) })).json();
      if (!d.ok) throw new Error(d.erro || "não deu para cancelar");
      pararSondagem();
      aviso("Estudo cancelado. O vídeo continua na Biblioteca.", "check-circle");
      window.dispatchEvent(new CustomEvent("estudo-cancelado", { detail: it.nome }));
      carregar(it);
    } catch (e) {
      b.disabled = false;
      $(".rotulo", b).textContent = "Cancelar estudo";
      aviso("Não deu para cancelar: " + e.message, "warning");
    }
  });
  return b;
}

function progresso(d, it) {
  const etapas = [
    { chave: "transcrevendo", nome: "Ler o que foi falado", desc: "Legendas do vídeo ou transcrição do áudio" },
    { chave: "traduzindo", nome: "Traduzir para o português", desc: "Só quando o vídeo é em outro idioma (o original fica guardado)" },
    { chave: "analisando", nome: "Analisar com IA", desc: "Resumo, mapa mental, organograma e perguntas" },
    { chave: "pronto", nome: "Pronto", desc: "Tudo aparece aqui automaticamente" },
  ];
  const ordem = { "na-fila": -1, transcrevendo: 0, traduzindo: 1, analisando: 2, pronto: 3 };
  const agora = ordem[d.estado] ?? -1;
  return el("div", { class: "cartao est-progresso", "aria-live": "polite" }, [
    el("h2", { texto: d.estado === "na-fila" ? "Na fila" : "Gerando o estudo" }),
    typeof d.progresso === "number" ? barraProgresso(d.progresso, { estimado: !!d.estimado }) : null,
    el("p", { class: "est-etapa", texto: d.etapa || "" }),
    el("ol", { class: "etapas" }, etapas.map((e, i) => el("li", { "data-estado": i < agora ? "feito" : i === agora ? "agora" : "depois" }, [
      el("span", { class: "bola" }, [i < agora ? icone("check", true) : i === agora ? icone("circle-notch") : el("span", { texto: String(i + 1) })]),
      el("div", {}, [el("strong", { texto: e.nome }), el("small", { texto: e.desc })]),
    ]))),
    el("p", { class: "est-nota", texto: "Pode sair desta tela. O estudo continua sendo gerado no servidor." }),
    it ? botaoCancelar(it) : null,
  ]);
}

// Apostila Técnica Interativa: o servidor monta o PDF (alguns segundos na primeira vez) e depois o download começa.
// Só fica liberada com a transcrição 100% em português; senão o botão explica o que falta.
function botaoApostila(it, bloqueio) {
  const b = el("button", { class: "btn btn--secundario btn--apostila", title: bloqueio ? "Bloqueada: " + bloqueio : "Apostila Técnica Interativa: PDF com sumário clicável, cenas do vídeo, diagramas, exercícios e gabarito" }, [icone(bloqueio ? "lock-simple" : "book-open-text", true), el("span", { class: "rotulo", texto: "Apostila Técnica Interativa" })]);
  if (bloqueio) {
    b.setAttribute("aria-disabled", "true"); b.classList.add("btn--bloqueado");
    b.addEventListener("click", () => aviso("Apostila Técnica Interativa bloqueada: " + bloqueio + ".", "lock-simple"));
    return b;
  }
  // o app prepara e busca o PDF (no celular o Android não entregava o download depois da espera)
  // sem infográfico ainda: pergunta se quer criar antes, para ele entrar na apostila
  b.addEventListener("click", () => baixarApostila(it.nome));
  return b;
}

function botaoCopiar() {
  const b = el("button", { class: "btn btn--fantasma btn--icone", "aria-label": "Copiar resumo", title: "Copiar resumo" }, [icone("copy")]);
  b.addEventListener("click", async () => {
    const e = estudo;
    const texto = [`# ${e.titulo}`, "", e.resumo.tldr, "", ...e.resumo.paragrafos.flatMap((p) => [p, ""]), "## Pontos-chave", ...e.resumo.pontosChave.map((p) => `- ${p}`)].join("\n");
    try { await navigator.clipboard.writeText(texto); b.replaceChildren(icone("check")); aviso("Resumo copiado."); setTimeout(() => b.replaceChildren(icone("copy")), 1800); }
    catch { aviso("Não deu para copiar.", "warning"); }
  });
  return b;
}

// ---------------------------------------------------------------------
// painel com as 7 visões
// ---------------------------------------------------------------------
function painelEstudo() {
  const abas = el("div", { class: "est-abas", role: "tablist", "aria-label": "Visões do estudo" }, VISOES.map((v) => {
    const b = el("button", { role: "tab", "data-visao": v.id, "aria-selected": String(v.id === visao) }, [icone(v.icone), el("span", { texto: v.nome })]);
    b.addEventListener("click", () => mostrarVisao(v.id));
    return b;
  }));
  return el("div", {}, [
    estudo.provedor === "demo" ? el("p", { class: "est-demo" }, [icone("info"), el("span", { texto: "Conteúdo de demonstração. Com a IA conectada, aqui aparece o estudo real do vídeo." })]) : null,
    abas,
    el("div", { class: "est-visao", role: "tabpanel" }),
  ]);
}

function mostrarVisao(id) {
  visao = id;
  $$(".est-abas [role=tab]", alvo).forEach((b) => b.setAttribute("aria-selected", String(b.dataset.visao === id)));
  const aba = $(`.est-abas [data-visao="${id}"]`, alvo);
  if (aba) aba.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  const painel = $(".est-visao", alvo);
  if (!painel) return;
  if (player) player.ontimeupdate = null;
  const fn = { resumo: vResumo, mapa: vMapa, organograma: vOrganograma, infografico: vInfografico, tempo: vTempo, perguntas: vPerguntas, transcricao: vTranscricao }[id];
  painel.replaceChildren(fn(estudo));
  painel.dataset.visao = id;
  revelar(painel);
}

// entrada em sequência dos blocos marcados com .rv (só quando aparecem na tela)
function revelar(raiz) {
  const blocos = $$(".rv", raiz);
  if (!("IntersectionObserver" in window)) { blocos.forEach((b) => b.classList.add("rv--on")); return; }
  const obs = new IntersectionObserver((ents) => {
    for (const e of ents) if (e.isIntersecting) { e.target.classList.add("rv--on"); obs.unobserve(e.target); }
  }, { threshold: .15 });
  blocos.forEach((b, i) => { b.style.setProperty("--d", `${Math.min(i, 10) * 60}ms`); obs.observe(b); });
}

function irAoMomento(seg) {
  if (!player || !Number.isFinite(seg)) return;
  player.currentTime = seg;
  player.play().catch(() => {});
  if (matchMedia("(max-width: 959px)").matches) player.scrollIntoView({ behavior: "smooth", block: "center" });
}
const botaoTempo = (seg) => el("button", { class: "tempo-btn mono", onclick: (ev) => { ev.stopPropagation(); irAoMomento(seg); }, "aria-label": `Ir para ${duracao(seg)}` }, [icone("play", true), duracao(seg)]);

// --- Resumo -----------------------------------------------------------
function vResumo(e) {
  const r = e.resumo;
  return el("div", { class: "v-resumo" }, [
    el("div", { class: "tldr rv" }, [el("span", { class: "rotulo-sec", texto: "Em poucas palavras" }), el("p", { texto: r.tldr })]),
    el("div", { class: "paragrafos rv" }, r.paragrafos.map((p) => el("p", { texto: p }))),
    el("h3", { class: "sec-titulo rv", texto: "Pontos-chave" }),
    el("ul", { class: "checklist rv" }, r.pontosChave.map((p) => {
      const li = el("li", {}, [el("button", { "aria-pressed": "false" }, [el("span", { class: "caixa" }, [icone("check", true)]), el("span", { texto: p })])]);
      $("button", li).addEventListener("click", (ev) => { const b = ev.currentTarget; b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true")); });
      return li;
    })),
    e.citacoes.length ? el("h3", { class: "sec-titulo rv", texto: "Frases marcantes" }) : null,
    e.citacoes.length ? el("div", { class: "citacoes" }, e.citacoes.map((c) => el("figure", { class: "citacao rv" }, [el("blockquote", { texto: `“${c.texto}”` }), botaoTempo(c.segundo)]))) : null,
  ]);
}

// --- Mapa mental (markmap: zoom, arrastar, clicar no nó pra recolher) ---
let markmapPronto = null;
function carregarMarkmap() {
  if (markmapPronto) return markmapPronto;
  markmapPronto = new Promise((res, rej) => {
    window.markmap = { autoLoader: { manual: true } };
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/markmap-autoloader@0.18";
    s.onload = () => res(window.markmap);
    s.onerror = () => { markmapPronto = null; rej(new Error("sem internet para carregar o mapa")); };
    document.head.append(s);
  });
  return markmapPronto;
}
const limparMd = (t) => String(t).replace(/[#*_`[\]<>]/g, "").trim();
function markdownDoMapa(m) {
  const linhas = [`# ${limparMd(m.centro)}`];
  for (const r of m.ramos) {
    linhas.push(`## ${limparMd(r.titulo)}`);
    for (const i of r.itens) {
      linhas.push(`### ${limparMd(i.titulo)}`);
      for (const d of i.detalhes) linhas.push(`- ${limparMd(d)}`);
    }
  }
  return linhas.join("\n");
}
function vMapa(e) {
  const caixa = el("div", { class: "mapa-caixa rv" }, [el("div", { class: "mapa-carregando" }, [icone("circle-notch"), "Desenhando o mapa"])]);
  const barra = el("div", { class: "mapa-barra" }, [
    el("span", { texto: "Arraste para mover, use o scroll ou pinça para zoom e toque num círculo para abrir ou fechar um ramo." }),
    el("button", { class: "btn btn--secundario", onclick: () => desenhar() }, [icone("arrows-in"), "Centralizar"]),
  ]);
  function desenhar() {
    carregarMarkmap().then((mm) => {
      const div = el("div", { class: "markmap" });
      const tpl = document.createElement("script");
      tpl.type = "text/template";
      tpl.textContent = "---\nmarkmap:\n  colorFreezeLevel: 2\n  initialExpandLevel: 3\n  maxWidth: 240\n---\n" + markdownDoMapa(e.mapa);
      div.append(tpl);
      caixa.replaceChildren(div);
      mm.autoLoader.renderAll();
    }).catch(() => caixa.replaceChildren(mapaSimples(e.mapa)));
  }
  desenhar();
  return el("div", {}, [barra, caixa]);
}
// plano B sem internet: árvore em lista
function mapaSimples(m) {
  return el("div", { class: "mapa-simples" }, [
    el("strong", { class: "centro", texto: m.centro }),
    el("ul", {}, m.ramos.map((r) => el("li", {}, [el("b", { texto: r.titulo }), el("ul", {}, r.itens.map((i) => el("li", { texto: i.titulo + (i.detalhes.length ? `: ${i.detalhes.join(", ")}` : "") })))]))),
  ]);
}

// --- Organograma ------------------------------------------------------
function vOrganograma(e) {
  const o = e.organograma;
  const grupos = el("ul", { class: "org-grupos" }, o.grupos.map((g) => {
    const filhos = el("ul", { class: "org-filhos" }, g.filhos.map((f) => el("li", {}, [el("div", { class: "org-folha" }, [el("strong", { texto: f.titulo }), f.descricao ? el("small", { texto: f.descricao }) : null])])));
    const no = el("button", { class: "org-no", "aria-expanded": "true" }, [
      el("strong", { texto: g.titulo }), g.descricao ? el("small", { texto: g.descricao }) : null,
      g.filhos.length ? el("span", { class: "org-qtd" }, [icone("caret-down"), String(g.filhos.length)]) : null,
    ]);
    no.addEventListener("click", () => no.setAttribute("aria-expanded", String(no.getAttribute("aria-expanded") !== "true")));
    return el("li", {}, [no, g.filhos.length ? filhos : null]);
  }));
  return el("div", { class: "org-rolagem rv" }, [
    el("div", { class: "org" }, [el("div", { class: "org-raiz" }, [icone("tree-structure"), el("strong", { texto: o.raiz })]), grupos]),
    el("p", { class: "est-nota", texto: "Toque num bloco para recolher ou abrir os itens dele." }),
  ]);
}

// --- Infográfico (pôster: roscas, medidores, barras, etapas, destaques) ---
function vInfografico() {
  return montarPoster(atual, { irAoMomento });
}

// --- Linha do tempo ---------------------------------------------------
function vTempo(e) {
  const itens = e.linhaDoTempo;
  const ultimo = itens.length ? itens[itens.length - 1].segundo : 0;
  const total = Math.max((player && Number.isFinite(player.duration) && player.duration) || 0, ultimo * 1.05, 1);
  const lis = itens.map((m) => {
    const li = el("li", { class: "rv" }, [el("button", { class: "lt-item" }, [
      el("span", { class: "lt-hora mono", texto: duracao(m.segundo) }),
      el("span", { class: "lt-ponto" }),
      el("span", { class: "lt-txt" }, [el("strong", { texto: m.titulo }), el("small", { texto: m.texto })]),
    ])]);
    $("button", li).addEventListener("click", () => irAoMomento(m.segundo));
    return li;
  });
  const barra = el("div", { class: "lt-barra" }, [el("span", { class: "lt-preenchida" }), ...itens.map((m) => el("button", { class: "lt-marca", style: `left:${Math.min(100, (m.segundo / total) * 100)}%`, title: `${duracao(m.segundo)} ${m.titulo}`, "aria-label": `${duracao(m.segundo)} ${m.titulo}`, onclick: () => irAoMomento(m.segundo) }))]);
  if (player) {
    player.ontimeupdate = () => {
      const t = player.currentTime;
      const dur = total;
      $(".lt-preenchida", barra).style.width = `${Math.min(100, (t / dur) * 100)}%`;
      let ativo = -1;
      itens.forEach((m, i) => { if (m.segundo <= t) ativo = i; });
      lis.forEach((li, i) => li.toggleAttribute("data-ativo", i === ativo));
    };
    player.ontimeupdate();
  }
  return el("div", { class: "v-tempo" }, [
    el("p", { class: "est-nota", texto: "Toque num momento para o vídeo pular direto para ele." }),
    barra,
    el("ol", { class: "lt" }, lis),
  ]);
}

// --- Perguntas (cartões que viram) -------------------------------------
function vPerguntas(e) {
  let ordem = e.perguntas.map((_, i) => i);
  let i = 0;
  const cartao = el("button", { class: "flash", "aria-live": "polite" });
  const cont = el("span", { class: "mono flash-cont" });
  function mostrar() {
    const p = e.perguntas[ordem[i]];
    cartao.removeAttribute("data-virado");
    cartao.replaceChildren(
      el("span", { class: "frente" }, [el("small", { texto: "Pergunta" }), el("strong", { texto: p.pergunta }), el("em", {}, [icone("hand-tap"), "Toque para ver a resposta"])]),
      el("span", { class: "verso" }, [el("small", { texto: "Resposta" }), el("strong", { texto: p.resposta })]),
    );
    cont.textContent = `${i + 1} de ${ordem.length}`;
  }
  cartao.addEventListener("click", () => cartao.toggleAttribute("data-virado"));
  const ant = el("button", { class: "btn btn--secundario btn--icone", "aria-label": "Anterior", onclick: () => { i = (i - 1 + ordem.length) % ordem.length; mostrar(); } }, [icone("arrow-left")]);
  const prox = el("button", { class: "btn btn--primario", onclick: () => { i = (i + 1) % ordem.length; mostrar(); } }, ["Próxima", icone("arrow-right")]);
  const emb = el("button", { class: "btn btn--fantasma", onclick: () => { ordem = ordem.map((x) => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map((x) => x[1]); i = 0; mostrar(); aviso("Cartões embaralhados.", "shuffle"); } }, [icone("shuffle"), "Embaralhar"]);
  if (!ordem.length) return el("p", { class: "est-nota", texto: "Este estudo não tem perguntas." });
  mostrar();
  return el("div", { class: "v-perguntas rv" }, [cartao, el("div", { class: "flash-nav" }, [ant, cont, emb, prox])]);
}

// --- Transcrição ------------------------------------------------------
let verOriginal = false;
function vTranscricao(e) {
  const original = (e.transcricaoOriginal || []).length ? e.transcricaoOriginal : null;
  if (!original) verOriginal = false;
  const blocos = (verOriginal && original) || e.transcricao || [];
  if (!blocos.length) return el("p", { class: "est-nota", texto: "A transcrição não ficou disponível para este vídeo." });
  const lista = el("ol", { class: "transc" });
  const busca = el("input", { type: "search", placeholder: "Buscar na transcrição" });
  function desenharLista(termo) {
    const t = termo.trim().toLowerCase();
    const itens = blocos.filter((b) => !t || b.texto.toLowerCase().includes(t));
    lista.replaceChildren(...itens.map((b) => {
      const p = el("p");
      if (t) {
        let resto = b.texto;
        let pos;
        while ((pos = resto.toLowerCase().indexOf(t)) >= 0) {
          p.append(resto.slice(0, pos), el("mark", { texto: resto.slice(pos, pos + t.length) }));
          resto = resto.slice(pos + t.length);
        }
        p.append(resto);
      } else p.textContent = b.texto;
      const li = el("li", { "data-inicio": String(b.inicio) }, [botaoTempo(b.inicio), p]);
      return li;
    }));
    if (t && !itens.length) lista.replaceChildren(el("li", { class: "est-nota", texto: "Nada encontrado." }));
  }
  busca.addEventListener("input", () => desenharLista(busca.value));
  desenharLista("");
  if (player) player.ontimeupdate = () => {
    const tAtual = player.currentTime;
    let ativo = null;
    for (const li of lista.children) if (Number(li.dataset.inicio) <= tAtual) ativo = li;
    for (const li of lista.children) li.toggleAttribute("data-ativo", li === ativo);
  };
  const fonte = { legendas: "Legendas do vídeo", audio: "Transcrição do áudio", demo: "Demonstração" }[e.fonte] || "";
  const NOMES = { en: "inglês", es: "espanhol", fr: "francês", it: "italiano", de: "alemão", ja: "japonês", ko: "coreano", zh: "chinês", ru: "russo" };
  const nomeOrig = NOMES[e.idiomaOriginal] || e.idiomaOriginal || "idioma original";
  // vídeo traduzido: alterna entre o texto em português e o original, sem perder os minutos
  const alternar = original ? el("div", { class: "seg-idioma", role: "group", "aria-label": "Idioma da transcrição" }, [
    el("button", { type: "button", "aria-pressed": String(!verOriginal), onclick: () => { verOriginal = false; mostrarVisao("transcricao"); } }, ["Português"]),
    el("button", { type: "button", "aria-pressed": String(verOriginal), onclick: () => { verOriginal = true; mostrarVisao("transcricao"); } }, ["Original (" + nomeOrig + ")"]),
  ]) : null;
  return el("div", { class: "v-transc" }, [
    el("div", { class: "transc-topo" }, [el("label", { class: "busca" }, [icone("magnifying-glass"), busca]), alternar, fonte ? el("span", { class: "est-nota", texto: "Fonte: " + fonte + (original ? ` · traduzido do ${nomeOrig} pela IA` : "") }) : null]),
    lista,
  ]);
}
