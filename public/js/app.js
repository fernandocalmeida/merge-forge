import { REDES, chipRede, redeDaUrl, redeDoNome } from "./redes.js";
import { montarEstudio, abrirEstudo, abrirPainelIA, VISOES } from "./estudio.js";
import { abrirConexoes, lerEstado, aoMudarConexao } from "./conexoes.js";
import { montarCelular } from "./celular.js";
import { abrirExportar } from "./exportar.js";

// =====================================================================
// utilidades
// =====================================================================
export const $ = (s, raiz = document) => raiz.querySelector(s);
export const $$ = (s, raiz = document) => [...raiz.querySelectorAll(s)];

export function el(tag, attrs = {}, filhos = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "texto") n.textContent = v;
    else if (k === "icone") n.append(icone(v));
    else if (k === "class") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const f of [].concat(filhos)) if (f !== null && f !== undefined && f !== false) n.append(f);
  return n;
}
export const icone = (nome, fill = false) => { const i = document.createElement("i"); i.className = `${fill ? "ph-fill" : "ph"} ph-${nome}`; i.setAttribute("aria-hidden", "true"); return i; };

// barra de porcentagem usada no estudo e no infográfico
export function barraProgresso(pct, { estimado = false } = {}) {
  const p = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
  return el("div", { class: "prog", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(p) }, [
    el("div", { class: "prog-topo" }, [el("strong", { class: "prog-num mono", texto: `${p}%` }), estimado ? el("span", { class: "prog-est", texto: "estimativa" }) : null]),
    el("div", { class: "prog-trilho" }, [el("span", { class: "prog-cheio", style: `width:${p}%` })]),
  ]);
}

export function duracao(seg) {
  if (!Number.isFinite(seg)) return "";
  seg = Math.max(0, Math.floor(seg));
  const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60), s = seg % 60;
  const p = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
}
const tamanhoTexto = (bytes) => {
  if (!bytes) return "";
  const mb = bytes / 1024 / 1024;
  return mb >= 1024 ? `~${(mb / 1024).toFixed(1).replace(".", ",")} GB` : `~${Math.max(1, Math.round(mb))} MB`;
};
const dataCurta = (ms) => new Date(ms).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
const nomeLimpo = (it) => it.titulo || it.nome.replace(/^\d{8}_[a-z]+_/, "").replace(/_[A-Za-z0-9_-]{6,}_(1080p|720p|480p|audio)\.[a-z0-9]+$/i, "").replace(/\.[a-z0-9]+$/i, "");
export const linkArquivo = (nome) => "/downloads/" + encodeURIComponent(nome);

// aviso flutuante
let avisoTimer = null;
export function aviso(texto, nomeIcone = "check-circle") {
  const a = $("#aviso");
  a.replaceChildren(icone(nomeIcone, true), el("span", { texto }));
  a.dataset.visivel = "1";
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => { a.dataset.visivel = ""; }, 3200);
}

// onda no toque, saindo do ponto exato do dedo/mouse
const semMovimento = matchMedia("(prefers-reduced-motion: reduce)");
document.addEventListener("pointerdown", (e) => {
  const alvo = e.target.closest(".btn, .acao");
  if (!alvo || alvo.disabled || semMovimento.matches) return;
  const r = alvo.getBoundingClientRect();
  const lado = Math.max(r.width, r.height) * 2.2;
  const onda = el("span", { class: "onda" });
  onda.style.cssText = `width:${lado}px;height:${lado}px;left:${e.clientX - r.left - lado / 2}px;top:${e.clientY - r.top - lado / 2}px`;
  alvo.append(onda);
  onda.addEventListener("animationend", () => onda.remove());
});

// botões "magnéticos": puxam levemente na direção do mouse (só com mouse de verdade)
const temMouse = matchMedia("(hover: hover) and (pointer: fine)");
document.addEventListener("pointermove", (e) => {
  if (!temMouse.matches || semMovimento.matches) return;
  const f = e.target.closest(".ferramenta");
  if (f) { const r = f.getBoundingClientRect(); f.style.setProperty("--mx", `${e.clientX - r.left}px`); f.style.setProperty("--my", `${e.clientY - r.top}px`); }
  const m = e.target.closest(".magnetico");
  if (!m || m.disabled) return;
  const r = m.getBoundingClientRect();
  const dx = (e.clientX - (r.left + r.width / 2)) / r.width;
  const dy = (e.clientY - (r.top + r.height / 2)) / r.height;
  m.style.transform = `translate(${dx * 8}px, ${dy * 6}px)`;
});
document.addEventListener("pointerout", (e) => {
  const m = e.target.closest && e.target.closest(".magnetico");
  if (m && !m.contains(e.relatedTarget)) m.style.transform = "";
});

// confete dourado saindo de um ponto (download concluído)
export function confete(origem) {
  if (semMovimento.matches) return;
  const r = origem.getBoundingClientRect();
  const caixa = $("#confete");
  const cores = ["#f6d995", "#e2b552", "#b8862a", "#f2efe7", "#86d6a8"];
  for (let i = 0; i < 34; i++) {
    const p = document.createElement("span");
    const ang = (Math.PI * 2 * i) / 34 + Math.random() * .4;
    const dist = 90 + Math.random() * 160;
    p.style.cssText = `--x:${r.left + r.width / 2}px;--y:${r.top + r.height / 2}px;--dx:${Math.cos(ang) * dist}px;--dy:${Math.sin(ang) * dist - 60}px;--r:${Math.random() * 720 - 360}deg;--c:${cores[i % cores.length]}`;
    caixa.append(p);
    p.addEventListener("animationend", () => p.remove());
  }
}

// folha (painel que sobe de baixo no celular; diálogo no computador)
const fundo = $("#folha-fundo");
let aoFecharFolha = null;
export function abrirFolha(conteudo, { aoFechar } = {}) {
  $("#folha-corpo").replaceChildren(...[].concat(conteudo));
  fundo.dataset.aberta = "1";
  aoFecharFolha = aoFechar || null;
  document.body.style.overflow = "hidden";
}
export function fecharFolha() {
  if (fundo.dataset.aberta !== "1") return;
  fundo.dataset.aberta = "";
  document.body.style.overflow = "";
  $$("video, audio", fundo).forEach((m) => m.pause());
  $("#seta-guia").hidden = true;
  if (aoFecharFolha) { const f = aoFecharFolha; aoFecharFolha = null; f(); }
}
fundo.addEventListener("click", (e) => { if (e.target === fundo) fecharFolha(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") fecharFolha(); });

// =====================================================================
// API + sessão
// =====================================================================
let senhaProvisoria = "";
let sessao = { precisaSenha: false };

// Se o app do computador estiver desligado, a página (guardada em cache) ainda abre:
// em vez de fingir que está tudo bem, mostramos uma faixa e voltamos sozinhos quando ele religar.
let foraDoAr = false;
function marcarForaDoAr() {
  if (foraDoAr) return;
  foraDoAr = true;
  document.body.dataset.offline = "1";
  const tentar = async () => {
    try {
      const r = await fetch("/api/sessao", { cache: "no-store" });
      if (r.ok) { location.reload(); return; }
    } catch { /* ainda fora */ }
    setTimeout(tentar, 3000);
  };
  setTimeout(tentar, 3000);
}

export async function api(caminho, opcoes = {}) {
  let r;
  try {
    r = await fetch(caminho, {
      ...opcoes,
      headers: opcoes.body ? { "Content-Type": "application/json", ...(opcoes.headers || {}) } : opcoes.headers,
    });
  } catch (e) {
    marcarForaDoAr();
    throw new Error("o app do computador não respondeu");
  }
  if (r.status === 503 || r.status === 504) marcarForaDoAr();
  if (r.status === 401) { mostrarPortao("entrar"); throw new Error("precisa entrar com a senha"); }
  if (r.status === 403) { mostrarPortao("trocar", true); throw new Error("crie sua senha antes de usar"); }
  return r;
}

function mostrarPortao(qual, primeiro = false) {
  $("#app").hidden = true;
  $("#portao").hidden = false;
  $("#form-entrar").hidden = qual !== "entrar";
  $("#form-trocar").hidden = qual !== "trocar";
  if (qual === "entrar") { $("#erro-entrar").textContent = ""; $("#senha").focus(); }
  if (qual === "trocar") {
    const f = $("#form-trocar");
    f.reset();
    f.dataset.primeiro = primeiro ? "1" : "";
    $("#erro-trocar").textContent = "";
    $("#trocar-titulo").textContent = primeiro ? "Crie sua senha" : "Trocar senha";
    $("#trocar-texto").textContent = primeiro
      ? "Esse é seu primeiro acesso. Troque a senha provisória por uma só sua. A partir de agora vale só ela."
      : "A senha nova vale na hora. Os outros aparelhos vão precisar entrar de novo.";
    const pedirAtual = !senhaProvisoria;
    $("#campo-atual").hidden = !pedirAtual;
    $("#senha-atual").required = pedirAtual;
    $("#trocar-cancelar").hidden = primeiro;
    (pedirAtual ? $("#senha-atual") : $("#senha-nova")).focus();
  }
}

function mostrarApp() {
  lerEstado();
  montarCelular();
  $("#portao").hidden = true;
  $("#app").hidden = false;
  $$("[data-trocar-senha]").forEach((b) => { b.hidden = !sessao.precisaSenha; });
  // a biblioteca carrega antes de abrir a tela: o Estúdio precisa dela para achar o vídeo
  carregarBiblioteca().finally(() => irPara(telaDaUrl(), { substituir: true }));
}

function estadoBotao(btn, estado, texto) {
  btn.dataset.estado = estado || "";
  btn.disabled = estado === "carregando";
  if (texto) $(".rotulo", btn).textContent = texto;
}

// botão de olho: mostra/esconde a senha (ajuda a ver se o navegador preencheu uma senha antiga)
$$(".ver-senha").forEach((b) => b.addEventListener("click", () => {
  const input = b.parentElement.querySelector("input");
  const ver = input.type === "password";
  input.type = ver ? "text" : "password";
  b.setAttribute("aria-pressed", String(ver));
  b.setAttribute("aria-label", ver ? "Esconder a senha" : "Mostrar a senha");
  b.querySelector("i").className = ver ? "ph ph-eye-slash" : "ph ph-eye";
  input.focus();
}));

$("#form-entrar").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const querTrocar = !!(ev.submitter && ev.submitter.id === "entrar-trocar");
  const btn = $("button[type=submit]", ev.target);
  const senha = $("#senha").value;
  estadoBotao(btn, "carregando", "Entrando");
  try {
    const r = await fetch("/api/entrar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ senha }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      $("#erro-entrar").textContent = r.status === 429 ? "Muitas tentativas erradas. Espere 15 minutos."
        : r.status === 401 ? "Senha errada. Toque no olho para conferir o que foi digitado: o navegador pode ter preenchido uma senha antiga salva."
        : `O servidor não respondeu direito (erro ${r.status}). Tente de novo em instantes.`;
      return;
    }
    $("#senha").value = "";
    sessao.precisaSenha = true;
    if (d.precisaTrocar) { senhaProvisoria = senha; mostrarPortao("trocar", true); }
    // "Entrar e trocar a senha": já sabemos a senha atual, então vai direto para a nova
    else if (querTrocar) { senhaProvisoria = senha; mostrarPortao("trocar", false); }
    else mostrarApp();
  } catch {
    $("#erro-entrar").textContent = "Sem conexão. Tente de novo.";
  } finally {
    estadoBotao(btn, "", "Entrar");
  }
});

$("#form-trocar").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const f = ev.target;
  const btn = $("button[type=submit]", f);
  const erro = $("#erro-trocar");
  const primeiro = f.dataset.primeiro === "1";
  const atual = $("#campo-atual").hidden ? senhaProvisoria : $("#senha-atual").value;
  const nova = $("#senha-nova").value;
  if (nova.length < 8) { erro.textContent = "A senha nova precisa ter pelo menos 8 caracteres."; return; }
  if (nova !== $("#senha-confirma").value) { erro.textContent = "As duas senhas novas não são iguais."; return; }
  estadoBotao(btn, "carregando", "Salvando");
  try {
    const r = await fetch("/api/trocar-senha", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ atual, nova }) });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401 && !d.campo) return mostrarPortao("entrar");
    if (!r.ok) {
      erro.textContent = r.status === 429 ? "Muitas tentativas erradas. Espere 15 minutos." : (d.erro ? d.erro.charAt(0).toUpperCase() + d.erro.slice(1) + "." : "Não deu para salvar.");
      if (d.campo === "atual" && $("#campo-atual").hidden) { senhaProvisoria = ""; $("#campo-atual").hidden = false; $("#senha-atual").required = true; $("#senha-atual").focus(); }
      return;
    }
    senhaProvisoria = "";
    mostrarApp();
    aviso(primeiro ? "Senha criada. Este aparelho já fica conectado." : "Senha trocada.");
  } catch {
    erro.textContent = "Sem conexão. Tente de novo.";
  } finally {
    estadoBotao(btn, "", "Salvar senha");
  }
});
$("#trocar-cancelar").addEventListener("click", () => { senhaProvisoria = ""; mostrarApp(); });
$$("[data-trocar-senha]").forEach((b) => b.addEventListener("click", () => mostrarPortao("trocar", false)));

// =====================================================================
// navegação entre telas
// =====================================================================
const TELAS = ["baixar", "biblioteca", "estudio"];
function telaDaUrl() {
  const t = location.hash.replace("#", "").split("?")[0];
  return TELAS.includes(t) ? t : "baixar";
}
export function irPara(tela, { substituir = false } = {}) {
  if (!TELAS.includes(tela)) tela = "baixar";
  for (const t of TELAS) $("#tela-" + t).dataset.ativa = t === tela ? "1" : "";
  $$("[data-ir]").forEach((b) => { if (b.dataset.ir === tela) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
  $("#marcador").style.transform = `translateX(${TELAS.indexOf(tela) * 100}%)`;
  moverIndicadorNav();
  requestAnimationFrame(() => { moverIndicadorNav(); if (tela === "baixar") moverSeletor(); });
  const hash = "#" + tela;
  if (location.hash.split("?")[0] !== hash) {
    if (substituir) history.replaceState(null, "", hash); else history.pushState(null, "", hash);
  }
  if (tela !== "estudio") $$("#estudio video, #estudio audio").forEach((m) => m.pause());
  if (tela === "estudio") montarEstudio($("#estudio"), { biblioteca: () => itensBiblioteca, recarregar: carregarBiblioteca });
  window.scrollTo({ top: 0, behavior: "instant" });
}
$$("[data-ir]").forEach((b) => b.addEventListener("click", () => irPara(b.dataset.ir)));
function moverIndicadorNav() {
  const ativo = $(".item-nav[aria-current=page]");
  const ind = $("#nav-indicador");
  if (!ativo || !ind) return;
  ind.style.transform = `translateY(${ativo.offsetTop}px)`;
  ind.style.height = `${ativo.offsetHeight}px`;
}
window.addEventListener("popstate", () => irPara(telaDaUrl(), { substituir: true }));

// =====================================================================
// BAIXAR
// =====================================================================
const campo = $("#link");
const botaoBaixar = $("#baixar");
const status = $("#status");
let qualidade = "720";
let previa = null;          // último /api/info que deu certo
let previaUrl = "";
let previaTimer = null;
let baixando = false;

const LISTA_REDES = ["instagram", "tiktok", "youtube", "facebook", "x"];
for (const rede of LISTA_REDES) $("#redes-suportadas").append(el("span", { class: "rede-pill", "data-rede": rede }, [chipRede(rede), REDES[rede].nome]));
queueMicrotask(atualizarBotaoBaixar);

// texto de exemplo que vai trocando de rede enquanto o campo está vazio
let iRede = 0;
setInterval(() => {
  if (campo.value || document.hidden) return;
  iRede = (iRede + 1) % LISTA_REDES.length;
  $("#ph-anim").replaceChildren("Cole um link do ", el("b", { texto: REDES[LISTA_REDES[iRede]].nome }));
}, 2200);

function acenderRede() {
  const v = campo.value.trim();
  const rede = linkValido(v) ? redeDaUrl(v) : null;
  $("#redes-suportadas").dataset.tem = rede && rede !== "video" ? "1" : "";
  $$(".rede-pill").forEach((p) => p.toggleAttribute("data-ativa", p.dataset.rede === rede));
  $("#ph-anim").hidden = !!campo.value;
  $("#barra-link").dataset.valido = linkValido(v) ? "1" : "";
}

function receberLink(texto) {
  const t = String(texto || "").trim().split(/\s+/).find((p) => /^https?:\/\//i.test(p));
  if (!t) return false;
  if ($("#tela-baixar").dataset.ativa !== "1") irPara("baixar");
  campo.value = t;
  campo.dispatchEvent(new Event("input"));
  return true;
}
// Ctrl+V em qualquer lugar da tela (fora de outros campos) cola o link
document.addEventListener("paste", (e) => {
  if (e.target.closest("input, textarea, [contenteditable]") || $("#app").hidden) return;
  if (receberLink(e.clipboardData && e.clipboardData.getData("text"))) { e.preventDefault(); aviso("Link colado.", "link-simple"); }
});
// arrastar um link para a página
let arrasto = 0;
document.addEventListener("dragenter", (e) => { if ([...(e.dataTransfer?.types || [])].some((t) => /uri-list|text\/plain|Files/.test(t))) { arrasto++; $("#barra-link").dataset.arrastando = "1"; } });
document.addEventListener("dragleave", () => { arrasto = Math.max(0, arrasto - 1); if (!arrasto) $("#barra-link").dataset.arrastando = ""; });
document.addEventListener("dragover", (e) => { if ($("#barra-link").dataset.arrastando === "1") e.preventDefault(); });
document.addEventListener("drop", (e) => {
  arrasto = 0; $("#barra-link").dataset.arrastando = "";
  const arquivo = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (arquivo) { e.preventDefault(); if ($("#tela-baixar").dataset.ativa !== "1") irPara("baixar"); enviarArquivo(arquivo); return; }
  const t = e.dataTransfer && (e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain"));
  if (t && receberLink(t)) { e.preventDefault(); aviso("Link recebido.", "link-simple"); }
});

// destaque do seletor de qualidade desliza até a opção escolhida
function moverSeletor() {
  const b = $(".qualidade[aria-checked=true]");
  const ind = $("#seletor-ind");
  if (!b || !ind) return;
  ind.style.width = `${b.offsetWidth}px`;
  ind.style.height = `${b.offsetHeight}px`;
  ind.style.transform = `translate(${b.offsetLeft}px, ${b.offsetTop}px)`;
}
window.addEventListener("resize", () => { moverSeletor(); moverIndicadorNav(); });
document.fonts && document.fonts.ready.then(() => { moverSeletor(); moverIndicadorNav(); });

function linkValido(v) { return /^https?:\/\/\S+\.\S+/i.test(v); }

function atualizarBotaoBaixar() {
  const ok = linkValido(campo.value.trim());
  botaoBaixar.disabled = !ok || baixando;
  const nomes = { "1080": "em qualidade máxima", "720": "em HD", "480": "versão leve", audio: "só o áudio" };
  if (!baixando && botaoBaixar.dataset.estado !== "ok") $("#baixar-texto").textContent = ok ? `Baixar ${nomes[qualidade]}` : "Cole um link ou arraste um arquivo";
  const descr = { "1080": "Melhor imagem disponível", "720": "Equilíbrio entre qualidade e tamanho", "480": "Leve, bom para mandar no WhatsApp", audio: "Só o som, em MP3" };
  $("#qual-desc").textContent = descr[qualidade];
  acenderRede();
  moverSeletor();
  $("#limpar").hidden = !campo.value;
  // no celular a barra do botão só aparece quando há um link (ou um download/erro em andamento)
  const temAlgo = ok || baixando || botaoBaixar.dataset.estado === "ok" || !!status.textContent;
  $(".barra-acao").dataset.oculta = temAlgo ? "" : "1";
}

campo.addEventListener("input", () => {
  atualizarBotaoBaixar();
  clearTimeout(previaTimer);
  const v = campo.value.trim();
  if (!linkValido(v)) { mostrarPrevia(null); return; }
  if (v === previaUrl) return;
  previaTimer = setTimeout(() => analisar(v), 450);
});
campo.addEventListener("keydown", (e) => { if (e.key === "Enter" && !botaoBaixar.disabled) baixar(); });
$("#limpar").addEventListener("click", () => { campo.value = ""; previaUrl = ""; mostrarPrevia(null); atualizarBotaoBaixar(); campo.focus(); });
$("#colar").addEventListener("click", async () => {
  try {
    const t = (await navigator.clipboard.readText()).trim();
    if (!t) return aviso("A área de transferência está vazia.", "info");
    campo.value = t;
    campo.dispatchEvent(new Event("input"));
  } catch {
    campo.focus();
    aviso("Toque e segure no campo e escolha Colar.", "info");
  }
});

$$(".qualidade").forEach((b) => b.addEventListener("click", () => {
  if (b.disabled) return;
  qualidade = b.dataset.q;
  $$(".qualidade").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
  atualizarBotaoBaixar();
}));

function mostrarPrevia(info, carregando = false) {
  const alvo = $("#previa");
  if (!info && !carregando) {
    alvo.replaceChildren();
    previa = null;
    $$(".qualidade").forEach((b) => { b.disabled = false; $("[data-tam]", b).textContent = ""; });
    return;
  }
  if (carregando) {
    alvo.replaceChildren(el("div", { class: "previa", "aria-busy": "true" }, [
      el("div", { class: "capa esqueleto" }),
      el("div", {}, [el("div", { class: "esqueleto", style: "height:14px;width:90%" }), el("div", { class: "esqueleto", style: "height:14px;width:60%;margin-top:8px" }), el("div", { class: "esqueleto", style: "height:12px;width:40%;margin-top:14px" })]),
    ]));
    return;
  }
  if (!info.ok) {
    alvo.replaceChildren(el("p", { class: "previa-erro", texto: "Não deu para ver a prévia desse link, mas você ainda pode tentar baixar." }));
    return;
  }
  previa = info;
  const capa = el("div", { class: "capa" }, [
    info.thumb ? el("img", { src: info.thumb, alt: "", loading: "lazy", referrerpolicy: "no-referrer", onerror: (e) => e.target.remove() }) : null,
    info.duracao ? el("span", { class: "tempo", texto: duracao(info.duracao) }) : null,
  ]);
  alvo.replaceChildren(el("div", { class: "previa" }, [
    info.thumb ? el("div", { class: "fundo", style: `background-image:url("${String(info.thumb).replace(/"/g, "%22")}")` }) : null,
    capa,
    el("div", { style: "min-width:0" }, [
      el("span", { class: "pronto-selo" }, [icone("check-circle", true), "Pronto para baixar"]),
      el("h3", { texto: info.titulo || "Vídeo" }),
      el("div", { class: "sub" }, [chipRede(info.rede || redeDaUrl(previaUrl)), el("span", { texto: info.canal || (REDES[info.rede] || {}).nome || "" })]),
    ]),
  ]));
  // tamanhos estimados e qualidades que não existem nesse vídeo
  const t = info.tamanhos || {};
  for (const b of $$(".qualidade")) {
    const q = b.dataset.q;
    $("[data-tam]", b).textContent = tamanhoTexto(t[q]);
    // 480 e áudio sempre existem (o yt-dlp cai pro melhor disponível); 1080 e 720 só se o vídeo tiver
    const indisponivel = !!info.alturaMax && ((q === "1080" && info.alturaMax < 1080) || (q === "720" && info.alturaMax < 720));
    b.disabled = indisponivel;
  }
  if ($(`.qualidade[data-q="${qualidade}"]`).disabled) {
    const melhor = $$(".qualidade").find((b) => !b.disabled && b.dataset.q !== "audio");
    if (melhor) melhor.click();
  }
}

async function analisar(url) {
  previaUrl = url;
  mostrarPrevia(null, true);
  try {
    const r = await api("/api/info", { method: "POST", body: JSON.stringify({ url }) });
    const d = await r.json();
    if (previaUrl !== url) return; // o link mudou enquanto analisava
    if (r.status === 429) return mostrarPrevia(null);
    mostrarPrevia(d);
  } catch {
    if (previaUrl === url) mostrarPrevia({ ok: false });
  }
}

botaoBaixar.addEventListener("click", baixar);

// ---------- enviar arquivo (vídeo ou áudio do aparelho) ----------
$("#enviar").addEventListener("click", () => $("#arquivo").click());
$("#arquivo").addEventListener("change", (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) enviarArquivo(f); });

const EXT_ACEITAS = /\.(mp4|webm|mkv|mov|m4v|3gp|m4a|mp3|wav|ogg|opus|aac|flac)$/i;
function enviarArquivo(arquivo) {
  if (baixando) return aviso("Espere o envio atual terminar.", "info");
  if (!EXT_ACEITAS.test(arquivo.name) && !/^(video|audio)\//.test(arquivo.type)) return aviso("Envie um vídeo ou um áudio.", "warning");
  baixando = true;
  campo.value = ""; previaUrl = ""; mostrarPrevia(null);
  botaoBaixar.dataset.estado = "carregando";
  botaoBaixar.disabled = true;
  status.dataset.tipo = "";
  const mb = (arquivo.size / 1024 / 1024).toFixed(arquivo.size > 1024 * 1024 * 10 ? 0 : 1).replace(".", ",");
  status.textContent = `${arquivo.name} (${mb} MB)`;
  $("#baixar-texto").textContent = "Enviando 0%";
  atualizarBotaoBaixar();

  const xhr = new XMLHttpRequest();
  xhr.open("POST", "/api/enviar?nome=" + encodeURIComponent(arquivo.name));
  xhr.setRequestHeader("Content-Type", arquivo.type || "application/octet-stream");
  xhr.upload.onprogress = (ev) => {
    if (ev.lengthComputable) { const p = Math.round((ev.loaded / ev.total) * 100); $("#baixar-texto").textContent = `Enviando ${p}%`; encherBotao(p); }
  };
  const terminar = (erro, d) => {
    baixando = false;
    if (erro) {
      botaoBaixar.dataset.estado = "";
      encherBotao(null);
      status.dataset.tipo = "erro";
      status.textContent = "Erro: " + erro;
      atualizarBotaoBaixar();
      return;
    }
    botaoBaixar.dataset.estado = "ok";
    $("#baixar-icone").className = "ph-fill ph-check-circle";
    $("#baixar-texto").textContent = "Arquivo recebido";
    status.textContent = "";
    confete(botaoBaixar);
    mostrarResultado({ nome: d.arquivo, titulo: d.titulo, rede: "arquivo", duracao: d.duracao, audio: d.audio });
    carregarBiblioteca();
    setTimeout(() => { botaoBaixar.dataset.estado = ""; encherBotao(null); $("#baixar-icone").className = "ph-fill ph-download-simple"; atualizarBotaoBaixar(); }, 1600);
  };
  xhr.onload = () => {
    let d = {};
    try { d = JSON.parse(xhr.responseText); } catch { /* resposta não JSON */ }
    if (xhr.status === 401) { baixando = false; return mostrarPortao("entrar"); }
    if (xhr.status >= 200 && xhr.status < 300 && d.ok) terminar(null, d);
    else terminar(d.erro || `o servidor recusou (${xhr.status})`);
  };
  xhr.onerror = () => terminar("a conexão caiu durante o envio");
  xhr.send(arquivo);
}

// o botão principal se enche conforme a porcentagem (null esvazia)
function encherBotao(p) {
  let barra = botaoBaixar.querySelector(".cta-progresso");
  if (p === null) { if (barra) barra.remove(); return; }
  if (!barra) { barra = el("span", { class: "cta-progresso", "aria-hidden": "true" }); botaoBaixar.prepend(barra); }
  barra.style.width = `${Math.max(0, Math.min(100, p))}%`;
}

async function baixar() {
  const url = campo.value.trim();
  if (!linkValido(url) || baixando) return;
  baixando = true;
  const inicio = Date.now();
  botaoBaixar.dataset.estado = "carregando";
  botaoBaixar.disabled = true;
  status.dataset.tipo = "";
  let ultimo = { pct: 0, etapa: "Começando" };
  const mostrar = () => {
    const t = duracao((Date.now() - inicio) / 1000);
    $("#baixar-texto").textContent = `Baixando ${ultimo.pct}%`;
    encherBotao(ultimo.pct);
    status.textContent = [ultimo.etapa, ultimo.velocidade, ultimo.falta ? `falta ${ultimo.falta}` : null, `${t} decorridos`].filter(Boolean).join(" · ");
  };
  const relogio = setInterval(mostrar, 500);
  mostrar();
  const info = previa && previaUrl === url ? { titulo: previa.titulo, canal: previa.canal, thumb: previa.thumb, duracao: previa.duracao } : null;
  try {
    const r = await api("/api/baixar", { method: "POST", body: JSON.stringify({ url, qualidade, info }) });
    const ini = await r.json();
    if (!ini.ok) throw new Error(ini.erro || "não deu para baixar");
    // acompanha o andamento até terminar
    let d = null, falhas = 0;
    while (!d) {
      await new Promise((ok) => setTimeout(ok, 1000));
      try {
        const e = await (await api("/api/baixar/estado?id=" + encodeURIComponent(ini.id))).json();
        falhas = 0;
        if (!e.ok) throw Object.assign(new Error(e.erro || "o download sumiu do servidor"), { fatal: true });
        ultimo = e;
        if (e.estado === "pronto") d = e.resultado;
        else if (e.estado === "erro") throw Object.assign(new Error(e.erro || "não deu para baixar"), { fatal: true });
      } catch (err) {
        if (err.fatal || ++falhas > 20) throw err; // conexão oscilou: tenta de novo por até ~20 s
      }
    }
    clearInterval(relogio);
    encherBotao(100);
    botaoBaixar.dataset.estado = "ok";
    $("#baixar-icone").className = "ph-fill ph-check-circle";
    $("#baixar-texto").textContent = "Pronto";
    confete(botaoBaixar);
    setTimeout(() => { $("#baixar-icone").className = "ph-fill ph-download-simple"; }, 1600);
    status.textContent = "";
    mostrarResultado({ nome: d.arquivo, titulo: d.titulo, thumb: d.thumb, rede: d.rede, duracao: d.duracao, audio: qualidade === "audio" });
    campo.value = ""; previaUrl = ""; mostrarPrevia(null);
    carregarBiblioteca();
    setTimeout(() => { botaoBaixar.dataset.estado = ""; encherBotao(null); atualizarBotaoBaixar(); }, 1600);
  } catch (e) {
    clearInterval(relogio);
    encherBotao(null);
    botaoBaixar.dataset.estado = "";
    status.dataset.tipo = "erro";
    status.textContent = "Erro: " + String(e.message || e).replace(/^ERROR:\s*/i, "");
  } finally {
    baixando = false;
    if (botaoBaixar.dataset.estado !== "ok") atualizarBotaoBaixar();
  }
}

function botoesDeAcao(it) {
  return el("div", {}, [acoesBase(it), ferramentasIA(it)]);
}

// Um botão único gera o estudo inteiro (uma leitura da transcrição, todas as visões de uma vez: é o
// jeito mais econômico). Depois de pronto, cada botão só abre a sua visão, sem gerar nada de novo.
const DESCRICOES_IA = {
  resumo: "Ideia central e pontos-chave", mapa: "Tópicos em mapa interativo", organograma: "Estrutura do conteúdo",
  infografico: "Pôster ilustrado pela IA", tempo: "Momentos com atalho no vídeo", perguntas: "Cartões para revisar", transcricao: "Texto completo com busca",
};
// Painel de IA embaixo, dentro da própria tela (Baixar ou Biblioteca)
function telaAtual() { return ["baixar", "biblioteca", "estudio"].find((t) => $("#tela-" + t).dataset.ativa === "1") || "baixar"; }
export function abrirPainel(it, visao, gerar = false) {
  let tela = telaAtual();
  if (tela === "estudio") { abrirEstudo(it.nome, visao, gerar); return montarEstudio($("#estudio"), { biblioteca: () => itensBiblioteca, recarregar: carregarBiblioteca }); }
  const p = $("#painel-" + tela);
  const corpo = el("div", { class: "painel-corpo" });
  const fechar = () => { $$("video, audio", p).forEach((m) => m.pause()); p.hidden = true; p.replaceChildren(); };
  p.replaceChildren(
    el("div", { class: "painel-cab" }, [
      el("div", { style: "min-width:0" }, [
        el("span", { class: "painel-tag" }, [icone("sparkle", true), "Painel de IA"]),
        el("h2", { texto: nomeLimpo(it) }),
      ]),
      el("button", { class: "btn btn--fantasma btn--icone", "aria-label": "Fechar painel", title: "Fechar", onclick: fechar }, [icone("x")]),
    ]),
    corpo,
  );
  p.hidden = false;
  abrirPainelIA(corpo, it, visao, { biblioteca: () => itensBiblioteca, recarregar: carregarBiblioteca }, { aoFechar: fechar, gerar });
  requestAnimationFrame(() => p.scrollIntoView({ behavior: semMovimento.matches ? "auto" : "smooth", block: "start" }));
}

export function ferramentasIA(it) {
  const pronto = !!it.temEstudo;
  const topo = pronto ? null : it.estudando
    ? el("div", { class: "gerar-ia" }, [
      el("p", { class: "gerar-ia-txt" }, [icone("circle-notch"), "Gerando o estudo deste vídeo. As ferramentas liberam quando terminar."]),
      el("button", { class: "btn btn--secundario btn--bloco", onclick: () => { fecharFolha(); abrirPainel(it, "resumo", false); } }, [icone("eye"), "Acompanhar"]),
    ])
    : el("div", { class: "gerar-ia" }, [
      el("button", { class: "btn btn--primario btn--grande btn--bloco", onclick: () => { fecharFolha(); abrirPainel(it, "resumo", true); } }, [el("span", { class: "rotulo" }, [icone("sparkle", true), "Gerar estudo com IA"])]),
      el("p", { class: "gerar-ia-txt", texto: "Gera de uma vez resumo, mapa mental, organograma, linha do tempo, perguntas e transcrição. O infográfico é criado à parte, quando você quiser." }),
    ]);
  const caixa = el("div", { class: "ferramentas-ia" + (pronto ? "" : " ferramentas-ia--bloqueada"), "data-nome": it.nome }, [
    el("div", { class: "bloco-cab" }, [el("h4", {}, [icone("sparkle", true), "Ferramentas de IA"]), el("span", { texto: pronto ? "Prontas" : "Liberam depois de gerar" })]),
    topo,
    el("div", { class: "grade-ia" }, VISOES.map((v) => el("button", {
      class: "ferramenta", "data-visao": v.id, disabled: !pronto, "aria-disabled": String(!pronto),
      title: pronto ? v.nome : "Gere o estudo primeiro",
      onclick: () => { if (!pronto) return; fecharFolha(); abrirPainel(it, v.id, false); },
    }, [
      el("span", { class: "f-ic" }, [icone(pronto ? v.icone : "lock-simple", true)]),
      pronto ? el("span", { class: "f-estado" }, [icone("check-circle", true)]) : null,
      el("span", {}, [el("strong", { texto: v.nome }), el("small", { texto: DESCRICOES_IA[v.id] || "" })]),
    ]))),
  ]);
  caixa.__item = it;
  return caixa;
}
// quando um estudo fica pronto, libera as ferramentas desse vídeo que estiverem na tela
window.addEventListener("estudo-pronto", (e) => {
  const it = itensBiblioteca.find((i) => i.nome === e.detail);
  if (it && !it.temEstudo) { it.temEstudo = true; it.estudando = false; carregarBiblioteca(); }
  $$(".ferramentas-ia--bloqueada").filter((c) => c.dataset.nome === e.detail && c.__item).forEach((c) => c.replaceWith(ferramentasIA({ ...c.__item, temEstudo: true, estudando: false })));
});

function acoesBase(it) {
  return el("div", { class: "acoes-base" }, [
    el("button", { class: "acao", onclick: () => tocar(it) }, [icone(it.audio ? "headphones" : "play"), el("span", { texto: it.audio ? "Ouvir" : "Assistir" })]),
    el("a", { class: "acao", href: linkArquivo(it.nome) + "?salvar=1", download: it.nome, onclick: () => aviso(ehIOS ? "Salvo em Arquivos. Para ir à galeria: Compartilhar e depois Salvar vídeo." : "Salvando no aparelho (pasta Downloads).", "download-simple") }, [icone("download-simple"), el("span", { texto: "Salvar" })]),
    botaoCompartilhar(it),
    el("button", { class: "acao", onclick: () => abrirExportar(it.nome, nomeLimpo(it)) }, [icone("file-zip"), el("span", { texto: "Baixar tudo" })]),
  ]);
}

function mostrarResultado(it) {
  $("#resultado").replaceChildren(el("div", { class: "cartao vidro resultado" }, [
    el("div", { class: "topo-res" }, [icone("check-circle", true), el("span", { texto: it.rede === "arquivo" ? "Arquivo recebido" : "Download concluído" })]),
    el("h3", { texto: nomeLimpo(it) }),
    botoesDeAcao(it),
  ]));
  requestAnimationFrame(() => $("#resultado").scrollIntoView({ behavior: semMovimento.matches ? "auto" : "smooth", block: "center" }));
}

// compartilhar: no iPhone o toque "vale" pouco tempo; se o arquivo demorar, pedimos um segundo toque
function botaoCompartilhar(it) {
  let arquivo = null;
  const b = el("button", { class: "acao" }, [icone("share-network"), el("span", { texto: "Compartilhar" })]);
  b.addEventListener("click", async () => {
    try {
      if (!arquivo) {
        $("span", b).textContent = "Preparando";
        const resp = await api(linkArquivo(it.nome));
        const blob = await resp.blob();
        arquivo = new File([blob], it.nome, { type: blob.type || (it.audio ? "audio/mpeg" : "video/mp4") });
      }
      if (navigator.canShare && navigator.canShare({ files: [arquivo] })) await navigator.share({ files: [arquivo], title: nomeLimpo(it) });
      else { aviso("Este navegador não compartilha arquivos. Use Salvar e envie pela galeria.", "info"); }
      $("span", b).textContent = "Compartilhar";
    } catch (e) {
      if (e.name === "NotAllowedError") { $("span", b).textContent = "Toque de novo"; return; }
      $("span", b).textContent = "Compartilhar";
      if (e.name !== "AbortError") aviso("Não deu para compartilhar: " + e.message, "warning");
    }
  });
  return b;
}

export function tocar(it, aPartirDe = 0) {
  const midia = el(it.audio ? "audio" : "video", { src: linkArquivo(it.nome), controls: true, playsinline: true, preload: "metadata" });
  if (aPartirDe) midia.currentTime = aPartirDe;
  abrirFolha([el("h2", { id: "folha-titulo", texto: nomeLimpo(it) }), midia]);
  midia.play().catch(() => {});
}

// =====================================================================
// BIBLIOTECA
// =====================================================================
let itensBiblioteca = [];
let filtro = "todos";
let termo = "";

export async function carregarBiblioteca() {
  try {
    itensBiblioteca = await (await api("/api/downloads")).json();
  } catch { return; }
  const n = itensBiblioteca.length;
  $$("[data-contador]").forEach((c) => { c.textContent = n || ""; });
  $$("[data-contador-bolinha]").forEach((c) => { c.textContent = n > 99 ? "99+" : n; c.hidden = !n; });
  renderizarRecentes();
  const comEstudo = itensBiblioteca.filter((i) => i.temEstudo).length;
  $("#bib-resumo").textContent = n ? `${n} ${n === 1 ? "arquivo" : "arquivos"}${comEstudo ? `, ${comEstudo} com estudo de IA` : ""}.` : "Tudo o que você já baixou.";
  renderizarBiblioteca();
}

$("#busca").addEventListener("input", (e) => { termo = e.target.value.trim().toLowerCase(); renderizarBiblioteca(); });
$$(".filtro").forEach((b) => b.addEventListener("click", () => {
  filtro = b.dataset.filtro;
  $$(".filtro").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  renderizarBiblioteca();
}));

function renderizarRecentes() {
  const alvo = $("#recentes-lista");
  if (!alvo) return;
  const ultimos = itensBiblioteca.slice(0, 4);
  if (!ultimos.length) { alvo.replaceChildren(el("p", { class: "vazio-mini", texto: "Os vídeos que você baixar aparecem aqui." })); return; }
  alvo.replaceChildren(...ultimos.map((it) => {
    const b = el("button", { class: "recente" }, [
      el("div", { class: "capa" }, [it.thumb ? el("img", { src: it.thumb, alt: "", loading: "lazy", referrerpolicy: "no-referrer", onerror: (e) => e.target.replaceWith(icone("film-strip")) }) : icone(it.audio ? "music-notes" : "film-strip")]),
      el("div", { style: "min-width:0" }, [el("strong", { texto: nomeLimpo(it) }), el("small", {}, [chipRede(it.rede || redeDoNome(it.nome)), it.duracao ? el("span", { class: "mono", texto: duracao(it.duracao) }) : null, it.temEstudo ? el("span", { texto: "Estudo pronto" }) : null])]),
    ]);
    b.addEventListener("click", () => abrirAcoes(it));
    return b;
  }));
}

function renderizarBiblioteca() {
  const alvo = $("#biblioteca");
  const lista = itensBiblioteca.filter((it) => {
    if (filtro === "video" && it.audio) return false;
    if (filtro === "audio" && !it.audio) return false;
    if (filtro === "estudo" && !it.temEstudo) return false;
    return !termo || nomeLimpo(it).toLowerCase().includes(termo) || it.nome.toLowerCase().includes(termo);
  });
  if (!itensBiblioteca.length) {
    alvo.replaceChildren(el("div", { class: "vazio", style: "grid-column:1/-1" }, [
      icone("film-slate"), el("h3", { texto: "Nada por aqui ainda" }), el("p", { texto: "Os vídeos que você baixar aparecem aqui." }),
      el("button", { class: "btn btn--primario", onclick: () => irPara("baixar") }, [icone("download-simple"), "Baixar o primeiro"]),
    ]));
    return;
  }
  if (!lista.length) {
    alvo.replaceChildren(el("div", { class: "vazio", style: "grid-column:1/-1" }, [icone("magnifying-glass"), el("h3", { texto: "Nenhum resultado" }), el("p", { texto: "Tente outra palavra ou outro filtro." })]));
    return;
  }
  alvo.replaceChildren(...lista.map((it, i) => cartaoMidia(it, i)));
}

function cartaoMidia(it, i) {
  const rede = it.rede || redeDoNome(it.nome);
  const b = el("button", { class: "midia", style: `--i:${Math.min(i, 12)}`, "aria-label": nomeLimpo(it) }, [
    el("div", { class: "capa" }, [
      it.thumb ? el("img", { src: it.thumb, alt: "", loading: "lazy", referrerpolicy: "no-referrer", onerror: (e) => { e.target.replaceWith(icone(it.audio ? "music-notes" : "film-strip")); } }) : icone(it.audio ? "music-notes" : "film-strip"),
      it.duracao ? el("span", { class: "tempo", texto: duracao(it.duracao) }) : null,
      el("span", { class: "play" }, [icone(it.audio ? "headphones" : "play-circle", true)]),
    ]),
    el("div", { class: "info" }, [
      el("h3", { texto: nomeLimpo(it) }),
      el("div", { class: "linha" }, [chipRede(rede), el("span", { class: "mono", texto: `${it.tamanhoMB.replace(".", ",")} MB` }), el("span", { texto: dataCurta(it.mtime) })]),
      it.estudando ? el("div", { style: "margin-top:8px" }, [el("span", { class: "selo selo--rodando" }, [icone("circle-notch"), "Gerando estudo"])])
        : it.temEstudo ? el("div", { style: "margin-top:8px" }, [el("span", { class: "selo" }, [icone("sparkle", true), "Estudo pronto"])]) : null,
    ]),
  ]);
  b.addEventListener("click", () => abrirAcoes(it));
  return b;
}

function abrirAcoes(it) {
  const excluir = el("button", { class: "btn btn--perigo" }, [icone("trash"), el("span", { class: "rotulo", texto: "Excluir" })]);
  let confirmTimer = null;
  excluir.addEventListener("click", async () => {
    if (excluir.dataset.confirmar !== "1") {
      excluir.dataset.confirmar = "1";
      $(".rotulo", excluir).textContent = "Toque de novo para excluir";
      confirmTimer = setTimeout(() => { excluir.dataset.confirmar = ""; $(".rotulo", excluir).textContent = "Excluir"; }, 3500);
      return;
    }
    clearTimeout(confirmTimer);
    excluir.dataset.estado = "carregando";
    try {
      const r = await api("/api/downloads/" + encodeURIComponent(it.nome), { method: "DELETE" });
      const d = await r.json();
      if (!d.ok) throw new Error(d.erro);
      fecharFolha();
      aviso("Arquivo excluído.", "trash");
      carregarBiblioteca();
    } catch (e) {
      excluir.dataset.estado = "";
      aviso("Não deu para excluir: " + e.message, "warning");
    }
  });
  const rede = it.rede || redeDoNome(it.nome);
  abrirFolha([
    el("h2", { id: "folha-titulo", texto: nomeLimpo(it) }),
    el("div", { class: "meta" }, [
      chipRede(rede),
      it.duracao ? el("span", { class: "mono", texto: duracao(it.duracao) }) : null,
      el("span", { class: "mono", texto: `${it.tamanhoMB.replace(".", ",")} MB` }),
      el("span", { texto: dataCurta(it.mtime) }),
    ]),
    botoesDeAcao(it),
    el("div", { class: "rodape-folha" }, [excluir, el("button", { class: "btn btn--secundario", onclick: fecharFolha }, ["Fechar"])]),
  ]);
}

// =====================================================================
// INSTALAR NO CELULAR
// =====================================================================
const ua = navigator.userAgent;
export const ehIOS = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
const ehAndroid = /android/i.test(ua);
const ehSafariIOS = ehIOS && /safari/i.test(ua) && !/crios|fxios|edgios|opios/i.test(ua);
const ehEmbutido = /instagram|fban|fbav|fb_iab|line\/|tiktok|musical_ly|bytedance|; wv\)/i.test(ua);
const ehSamsung = /samsungbrowser/i.test(ua);
let ehXiaomi = /xiaomi|redmi|poco|miui|hyperos/i.test(ua);
// o Chrome novo esconde o modelo no userAgent; pedimos a marca/modelo pela API própria dele
if (!ehXiaomi && navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
  navigator.userAgentData.getHighEntropyValues(["model"]).then((d) => { if (/xiaomi|redmi|poco|^m\d{4}|^2\d{7}/i.test(d.model || "")) ehXiaomi = true; }).catch(() => {});
}
const jaInstalado = () => matchMedia("(display-mode: standalone)").matches || matchMedia("(display-mode: minimal-ui)").matches || navigator.standalone === true;

function esconderInstalar() { $$("[data-instalar], [data-qr]").forEach((b) => { b.hidden = true; }); }


if (jaInstalado()) esconderInstalar();
else if (navigator.getInstalledRelatedApps) navigator.getInstalledRelatedApps().then((a) => { if (a && a.length) esconderInstalar(); }).catch(() => {});
let esperaInstalacao = null;
window.addEventListener("appinstalled", () => {
  clearTimeout(esperaInstalacao); esperaInstalacao = null;
  window.__convite = null; fecharFolha(); esconderInstalar();
  aviso("Instalado. Procure o ícone Merge Forge na tela inicial ou na lista de apps.");
});

function esperarConvite(ms) {
  if (window.__convite) return Promise.resolve(window.__convite);
  return new Promise((res) => {
    const t = setTimeout(() => { window.removeEventListener("convite-pronto", ok); res(null); }, ms);
    function ok() { clearTimeout(t); res(window.__convite); }
    window.addEventListener("convite-pronto", ok, { once: true });
  });
}

$$("[data-instalar]").forEach((b) => b.addEventListener("click", async () => {
  if (ehEmbutido) return guia("embutido");
  if (ehIOS) return guia(ehSafariIOS ? "ios" : "ios-outro");
  b.dataset.estado = "carregando";
  const convite = await esperarConvite(3500); // o toque vale ~5s para o Chrome
  b.dataset.estado = "";
  if (convite) {
    try {
      convite.prompt();
      const escolha = await convite.userChoice;
      window.__convite = null;
      if (escolha.outcome === "accepted") {
        aviso("Instalando. Em instantes o ícone aparece.", "download-simple");
        // O Chrome avisa (appinstalled) quando termina. Se não avisar, o celular travou a instalação.
        clearTimeout(esperaInstalacao);
        esperaInstalacao = setTimeout(() => { esperaInstalacao = null; guia("nao-instalou"); }, 30000);
      }
      return;
    } catch { /* convite expirou: guia manual */ }
  }
  guia(ehSamsung ? "samsung" : ehAndroid ? "android" : "pc");
}));

const MENU = '<span class="tecla">⋮</span>';
const COMP = '<span class="tecla"><i class="ph ph-export"></i></span>';
const GUIAS = {
  android: { seta: true, passos: [`Toque nos três pontinhos ${MENU} no canto de cima (a seta aponta).`, `Toque em <b>Instalar app</b>. Se não aparecer, <b>Adicionar à tela inicial</b> e depois <b>Instalar</b>.`, `Pronto: o ícone <b>Merge Forge</b> aparece na tela inicial.`],
    dica: () => ehXiaomi ? "Xiaomi, Redmi ou Poco: antes, vá em Configurações, Apps, Gerenciar apps, Chrome, Outras permissões e ligue Atalhos da tela inicial." : "Se o ícone não aparecer, libere a permissão Atalhos da tela inicial do Chrome nas configurações do celular (no Xiaomi, Redmi e Poco fica em Outras permissões)." },
  samsung: { passos: [`Toque no menu <span class="tecla">≡</span> na barra de baixo.`, `Toque em <b>Adicionar página a</b> e depois <b>Tela inicial</b>.`, `Confirme em <b>Adicionar</b>.`] },
  ios: { passos: [`Toque em Compartilhar ${COMP} na barra do Safari.`, `Role e toque em <b>Adicionar à Tela de Início</b>.`, `Toque em <b>Adicionar</b>. O ícone <b>Merge Forge</b> fica na tela inicial.`] },
  "ios-outro": { passos: [`No iPhone, só dá para instalar pelo <b>Safari</b>.`, `Abra <b>${location.host}</b> no Safari.`, `Toque em Compartilhar ${COMP} e em <b>Adicionar à Tela de Início</b>.`] },
  embutido: { seta: true, passos: [`Você abriu o link dentro de outro app (Instagram, Facebook, TikTok). Dali não dá para instalar.`, `Toque nos três pontinhos ${MENU} e escolha <b>Abrir no navegador</b>.`, `No navegador, toque de novo em <b>Instalar</b>.`] },
  "nao-instalou": { seta: true, passos: [
    `Procure o ícone <b>Merge Forge</b> também na <b>lista de apps</b> (deslize a tela inicial para cima). Em alguns Android ele vai só para lá.`,
    `Se não estiver: toque nos três pontinhos ${MENU} do Chrome e em <b>Adicionar à tela inicial</b>. Se perguntar, escolha <b>Instalar</b> ou <b>Criar atalho</b>.`,
    `Se o Chrome disser que já está instalado, abra pelo ícone. Se nada aparecer, libere a permissão do Chrome descrita abaixo e tente de novo.`],
    dica: () => ehXiaomi
      ? "Xiaomi, Redmi ou Poco: Configurações, Apps, Gerenciar apps, Chrome, Outras permissões, e ligue Atalhos da tela inicial. Depois toque em Instalar de novo."
      : "Em alguns celulares é preciso liberar a permissão de atalhos do Chrome. Xiaomi, Redmi e Poco: Configurações, Apps, Gerenciar apps, Chrome, Outras permissões, Atalhos da tela inicial. Outros: Configurações, Apps, Chrome, Permissões. Depois toque em Instalar de novo.",
    titulo: "O ícone não apareceu?" },
  pc: { passos: [`Na barra de endereço, clique no ícone de instalar, à direita.`, `Ou abra o menu ${MENU} e escolha <b>Instalar página como app</b>.`, `No celular é mais fácil: aponte a câmera para o QR code ao lado.`] },
};
function guia(tipo) {
  const g = GUIAS[tipo];
  const ol = el("ol", { class: "passos" });
  for (const p of g.passos) { const li = document.createElement("li"); li.innerHTML = p; ol.append(li); }
  const dica = typeof g.dica === "function" ? g.dica() : g.dica;
  abrirFolha([el("h2", { id: "folha-titulo", texto: g.titulo || "Instalar o Baixar" }), ol, dica ? el("p", { class: "dica", texto: dica }) : null,
    el("button", { class: "btn btn--primario btn--bloco", onclick: fecharFolha }, ["Entendi"])]);
  $("#seta-guia").hidden = !g.seta;
}

// =====================================================================
// início
// =====================================================================
(async () => {
  try {
    const s = await (await fetch("/api/sessao", { cache: "no-store" })).json();
    sessao = s;
    if (s.precisaSenha && !s.logado) return mostrarPortao("entrar");
    if (s.precisaTrocar) return mostrarPortao("trocar", true);
  } catch { marcarForaDoAr(); /* abre a casca mesmo assim, com a faixa de aviso */ }
  mostrarApp();
})();

// ---------- conexões de IA ----------
$$("[data-conexoes]").forEach((b) => b.addEventListener("click", abrirConexoes));
aoMudarConexao((s) => {
  const t = !s ? "Sem resposta" : s.provedor === "claude-cli" ? "Assinatura Claude" : s.provedor === "api" ? "Chave da API" : s.provedor === "demo" ? "Demonstração" : "Não conectada";
  $$("[data-conexao-status]").forEach((x) => { x.textContent = t + (s && s.groq ? " + Groq" : ""); });
  $$("[data-conexoes]").forEach((b) => b.toggleAttribute("data-desligada", !(s && s.provedor)));
});
export { abrirConexoes };

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
