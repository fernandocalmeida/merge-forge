// Tela "Conectar IA": conta Claude (login do Claude Code ou token), Groq, conta ChatGPT (Codex) e, opcionalmente, chaves de API.
// Os valores colados vão direto para o servidor, que testa e guarda no .env; eles nunca voltam para a tela.
import { $, el, icone, api, aviso, abrirFolha, fecharFolha, verTermo } from "./app.js";

let estado = null;
// a folha aberta é desta tela? (o teste das contas termina depois e só redesenha se ela ainda estiver aberta)
const folhaNossa = () => $("#folha-fundo").dataset.aberta === "1" && !!document.querySelector("#folha-corpo [data-conexoes]");
function abrir(conteudo, opcoes = {}) {
  abrirFolha([el("span", { hidden: true, "data-conexoes": "1" }), ...[].concat(conteudo)], opcoes);
}
let sondagem = null;
const ouvintes = new Set();
export const aoMudarConexao = (fn) => ouvintes.add(fn);

export async function lerEstado() {
  try { estado = await (await api("/api/ia")).json(); } catch { estado = null; }
  for (const fn of ouvintes) fn(estado);
  return estado;
}

const NOMES = { "claude-cli": "assinatura Claude", api: "chave da API Anthropic", demo: "modo demonstração" };

function copiavel(texto) {
  const b = el("button", { class: "btn btn--secundario btn--icone", "aria-label": "Copiar comando", title: "Copiar" }, [icone("copy")]);
  b.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(texto); b.replaceChildren(icone("check")); setTimeout(() => b.replaceChildren(icone("copy")), 1600); }
    catch { aviso("Não deu para copiar. Selecione o texto.", "warning"); }
  });
  return el("div", { class: "comando" }, [el("code", { class: "mono", texto }), b]);
}

function campoSegredo(rotulo, tipo, placeholder, depois) {
  const input = el("input", { type: "password", autocomplete: "off", spellcheck: "false", placeholder });
  const erro = el("p", { class: "erro-form", role: "alert" });
  const btn = el("button", { class: "btn btn--primario", type: "submit" }, [el("span", { class: "rotulo", texto: "Conectar" })]);
  const form = el("form", { class: "segredo" }, [
    el("label", { class: "sr", texto: rotulo }),
    el("div", { class: "linha-segredo" }, [input, btn]),
    erro,
  ]);
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const valor = input.value.trim();
    if (!valor) { erro.textContent = "Cole o valor primeiro."; return; }
    erro.textContent = "";
    btn.dataset.estado = "carregando"; btn.disabled = true; $(".rotulo", btn).textContent = "Testando";
    try {
      const r = await api("/api/ia/conectar", { method: "POST", body: JSON.stringify({ tipo, valor }) });
      const d = await r.json();
      if (!d.ok) throw new Error(d.erro || "não funcionou");
      input.value = "";
      btn.dataset.estado = "ok"; $(".rotulo", btn).textContent = "Conectado";
      aviso("Conectado.");
      await lerEstado();
      const conta = { "claude-token": "claude", api: "claude", groq: "groq", openai: "codex" }[tipo];
      setTimeout(() => (depois ? depois() : conta ? testarContas(conta) : desenhar()), 600);
    } catch (e) {
      btn.dataset.estado = ""; btn.disabled = false; $(".rotulo", btn).textContent = "Conectar";
      erro.textContent = String(e.message || e).replace(/^./, (c) => c.toUpperCase());
    }
  });
  return form;
}

async function desconectar(tipo) {
  try {
    await api("/api/ia/desconectar", { method: "POST", body: JSON.stringify({ tipo }) });
    aviso("Desconectado.", "plug");
  } catch (e) { aviso("Não deu: " + e.message, "warning"); }
  await lerEstado();
  desenhar();
}

function selo(ok, textoOk, textoNao) {
  return el("span", { class: "selo-con" + (ok ? " selo-con--ok" : "") }, [icone(ok ? "check-circle" : "circle-dashed", ok), ok ? textoOk : textoNao]);
}

// Resultado do teste REAL da conta (o servidor pede um "OK" à IA): funcionando, com problema ou conferindo
let testando = false;
function seloSaude(conta, conectado, textoNao = "Não conectada") {
  const x = estado && estado.saude ? estado.saude[conta] : null;
  if (!conectado) return selo(false, "", textoNao);
  if (testando && (!x || x.ok !== false)) return el("span", { class: "selo-con selo-con--testando" }, [icone("circle-notch"), "Conferindo..."]);
  if (!x || x.ok === null) return selo(true, "Conectada", textoNao);
  if (x.ok) return el("span", { class: "selo-con selo-con--ok" }, [icone("check-circle", true), "Funcionando"]);
  return el("span", { class: "selo-con selo-con--erro" }, [icone("warning-circle", true), "Com problema"]);
}
function avisoSaude(conta) {
  const x = estado && estado.saude ? estado.saude[conta] : null;
  if (!x || x.ok !== false || !x.erro) return null;
  return el("p", { class: "con-problema", role: "alert" }, [icone("warning-circle", true), el("span", { texto: x.erro.charAt(0).toUpperCase() + x.erro.slice(1) + ". Entre de novo ou conecte outra conta abaixo." })]);
}
const quando = (ms) => { const s = Math.round((Date.now() - ms) / 1000); return s < 60 ? "agora" : s < 3600 ? `há ${Math.round(s / 60)} min` : `há ${Math.round(s / 3600)} h`; };

// testa as contas de verdade e redesenha; "conta" testa só uma
export async function testarContas(conta = null) {
  testando = true; if (folhaNossa()) desenhar();
  try { await api("/api/ia/testar", { method: "POST", body: JSON.stringify(conta ? { conta } : {}) }); } catch { /* mostra o que tiver */ }
  testando = false;
  await lerEstado();
  if (folhaNossa()) desenhar();
  return estado && estado.saude ? (conta ? estado.saude[conta] : estado.saude) : null;
}

async function postar(caminho, corpo = {}) {
  const d = await (await api(caminho, { method: "POST", body: JSON.stringify(corpo) })).json();
  if (!d.ok) throw new Error(d.erro || "não deu");
  return d;
}

// ---------- seção: conta Claude ----------
function secaoClaude(s) {
  const c = s.claude || {};
  const viaLogin = c.logado && !s.claudeSemSistema;
  const conectado = viaLogin || s.tokenClaude;
  const filhos = [
    el("div", { class: "con-cabeca" }, [
      el("span", { class: "con-icone" }, [icone("sparkle", true)]),
      el("div", {}, [el("h3", { texto: "Conta Claude" }), el("p", { texto: "Gera resumo, mapa mental e o resto usando a sua assinatura Claude." })]),
      seloSaude("claude", conectado),
    ]),
  ];

  if (!c.instalado) {
    filhos.push(
      el("p", { class: "con-texto", texto: "O Claude Code ainda não está instalado neste computador. Instale com o comando abaixo (precisa do Node) e depois toque em Verificar." }),
      copiavel("npm install -g @anthropic-ai/claude-code"),
      el("button", { class: "btn btn--secundario", onclick: verificar }, [icone("arrow-clockwise"), "Verificar de novo"]),
    );
    return el("section", { class: "con-secao" }, filhos);
  }

  const problema = avisoSaude("claude");
  if (problema) filhos.push(problema);
  const x = s.saude && s.saude.claude;
  if (conectado) {
    filhos.push(el("p", { class: "con-texto", texto: (s.tokenClaude ? "Conectada por chave (token) do Claude Code." : "Conectada pelo login do Claude Code deste computador.") + (x && x.ok ? ` Conferida ${quando(x.em)}.` : "") }));
  } else if (s.claudeSemSistema && c.logado) {
    filhos.push(el("p", { class: "con-texto", texto: "Desconectada: o app não usa mais o login do Claude Code deste computador." }),
      el("button", { class: "btn btn--secundario", onclick: () => acao(() => postar("/api/ia/claude/usar-sistema"), "Login do computador em uso de novo.", "claude") }, [icone("arrow-counter-clockwise"), "Usar de novo o login do computador"]));
  }

  // ações sempre à mão: testar, entrar de novo, gerar chave nova, desconectar
  const botoes = el("div", { class: "con-acoes" });
  if (conectado) botoes.append(el("button", { class: "btn btn--secundario", onclick: () => testarContas("claude") }, [icone("pulse"), "Testar agora"]));
  if (s.local) {
    const entrar = el("button", { class: "btn " + (conectado && !problema ? "btn--secundario" : "btn--primario") }, [el("span", { class: "rotulo" }, [icone("sign-in"), conectado ? "Entrar de novo" : "Entrar com a conta Claude"])]);
    entrar.addEventListener("click", () => loginNoTerminal(entrar));
    botoes.append(entrar);
  }
  if (conectado) botoes.append(el("button", { class: "btn btn--fantasma", onclick: () => desconectarClaude(s) }, [icone("plug"), "Desconectar"]));
  filhos.push(botoes);

  // chave nova (token) do Claude Code: vale 1 ano e funciona também com o app num servidor
  const abrirToken = s.local ? el("button", { class: "btn btn--secundario btn--bloco", onclick: () => abrirSetupToken() }, [icone("key"), "Gerar chave nova no terminal"]) : null;
  filhos.push(el("details", { class: "con-alternativa", open: !s.local && (!conectado || !!problema) }, [
    el("summary", { texto: s.tokenClaude ? "Trocar a chave (token) do Claude" : "Gerar uma chave nova (token) do Claude Code e colar aqui" }),
    el("ol", { class: "con-passos" }, [
      el("li", {}, s.local ? ["Toque abaixo: abre um terminal com ", el("code", { class: "mono", texto: "claude setup-token" }), "."] : ["Num computador com o Claude Code, rode:", copiavel("claude setup-token")]),
      el("li", { texto: "Entre na sua conta Claude no navegador que abrir." }),
      el("li", { texto: "Copie a chave que aparece no terminal e cole aqui. O app testa antes de salvar." }),
    ]),
    abrirToken,
    campoSegredo("Token do Claude", "claude-token", "Cole a chave (token) aqui"),
  ].filter(Boolean)));
  return el("section", { class: "con-secao" }, filhos);
}

async function acao(fn, okTexto, conta) {
  try { await fn(); if (okTexto) aviso(okTexto, "check-circle"); }
  catch (e) { aviso("Não deu: " + e.message, "warning"); }
  await lerEstado();
  if (conta) return testarContas(conta);
  desenhar();
}

async function desconectarClaude(s) {
  const msg = s.tokenClaude
    ? "Desconectar a chave (token) do Claude deste app?"
    : s.local ? "Desconectar a conta Claude? Isso sai do login do Claude Code neste computador (claude auth logout). Depois é só tocar em Entrar com a conta Claude." : "Desconectar a conta Claude deste app? O login do servidor não é apagado; o app só deixa de usá-lo.";
  if (!confirm(msg)) return;
  await acao(() => postar("/api/ia/claude/sair"), "Conta Claude desconectada.", "claude");
}

async function abrirSetupToken() {
  try { await postar("/api/ia/abrir-setup-token"); aviso("Terminal aberto: entre na conta e copie a chave que aparecer.", "key"); }
  catch (e) { aviso("Não abriu o terminal: " + e.message, "warning"); }
}

async function loginNoTerminal(btn) {
  btn.dataset.estado = "carregando"; btn.disabled = true;
  $(".rotulo", btn).replaceChildren(icone("circle-notch"), "Aguardando o login");
  try {
    const d = await (await api("/api/ia/abrir-login", { method: "POST", body: "{}" })).json();
    if (!d.ok) throw new Error(d.erro);
  } catch (e) {
    btn.dataset.estado = ""; btn.disabled = false;
    $(".rotulo", btn).replaceChildren(icone("sign-in"), "Entrar com a conta Claude");
    return aviso("Não abriu o terminal: " + e.message, "warning");
  }
  // confere a cada 3s por até 5 minutos
  const fim = Date.now() + 5 * 60 * 1000;
  clearInterval(sondagem);
  sondagem = setInterval(async () => {
    if (Date.now() > fim || $("#folha-fundo").dataset.aberta !== "1") { clearInterval(sondagem); return; }
    try {
      const d = await (await api("/api/ia/verificar", { method: "POST", body: "{}" })).json();
      if (d.claude && d.claude.logado) {
        clearInterval(sondagem);
        aviso("Login feito. Conferindo a conta...");
        await lerEstado();
        await testarContas("claude");
      }
    } catch { /* tenta de novo */ }
  }, 3000);
}

async function verificar() {
  try { await api("/api/ia/verificar", { method: "POST", body: "{}" }); } catch { /* segue */ }
  await lerEstado();
  await testarContas();
}

// ---------- seção: Groq ----------
function secaoGroq(s) {
  const x = s.saude && s.saude.groq;
  const texto = x && x.ok && x.total > 1 ? `${x.validas} de ${x.total} chaves funcionando, em revezamento.` : x && x.ok ? `Chave funcionando. Conferida ${quando(x.em)}.` : "";
  return el("section", { class: "con-secao" }, [
    el("div", { class: "con-cabeca" }, [
      el("span", { class: "con-icone" }, [icone("waveform", true)]),
      el("div", {}, [el("h3", { texto: "Transcrição do áudio (Groq)" }), el("p", { texto: "Para vídeos sem legenda, como a maioria do Instagram e do TikTok." })]),
      seloSaude("groq", s.groq, "Opcional"),
    ]),
    avisoSaude("groq"),
    s.groq && texto ? el("p", { class: "con-texto", texto }) : null,
    s.groq
      ? el("div", { class: "con-acoes" }, [
        el("button", { class: "btn btn--secundario", onclick: () => testarContas("groq") }, [icone("pulse"), "Testar agora"]),
        el("button", { class: "btn btn--fantasma", onclick: () => { if (confirm("Desconectar a chave da Groq?")) desconectar("groq"); } }, [icone("plug"), "Desconectar"]),
      ])
      : null,
    el("details", { class: "con-alternativa", open: !s.groq || (x && x.ok === false) }, [
      el("summary", { texto: s.groq ? "Trocar por uma chave nova da Groq" : "Conectar a chave da Groq" }),
      el("p", { class: "con-texto" }, ["Crie uma chave grátis em ", el("a", { href: "https://console.groq.com/keys", target: "_blank", rel: "noopener", texto: "console.groq.com/keys" }), " e cole aqui (o app testa antes de salvar):"]),
      campoSegredo("Chave da Groq", "groq", "Cole a chave da Groq"),
    ]),
  ].filter(Boolean));
}

// ---------- seção: Codex / ChatGPT (desenha o infográfico) ----------
function secaoImagem(s) {
  const c = s.codexInfo || { conectado: !!s.codex };
  const filhos = [
    el("div", { class: "con-cabeca" }, [
      el("span", { class: "con-icone" }, [icone("open-ai-logo", true)]),
      el("div", {}, [el("h3", { texto: "Conta ChatGPT (Codex)" }), el("p", { texto: "Desenha o pôster do infográfico com o gerador de imagens do ChatGPT, na sua assinatura." })]),
      c.conectado ? seloSaude("codex", true) : selo(!!s.openai, "Chave da OpenAI", "Não conectada"),
    ]),
  ];
  const caixaLogin = el("div", { class: "codex-login" });
  const problema = c.conectado ? avisoSaude("codex") : null;
  if (problema) filhos.push(problema);
  const x = s.saude && s.saude.codex;

  if (c.conectado) {
    filhos.push(el("p", { class: "con-texto", texto: (c.origem === "app"
      ? "Conectada por aqui, com a sua conta do ChatGPT."
      : s.local ? "Usando o Codex que já está logado neste computador." : "Usando o Codex que já está logado no servidor.") + (x && x.ok ? ` Conferida ${quando(x.em)}.` : "") }));
  } else if (s.codexSemSistema) {
    filhos.push(el("button", { class: "btn btn--secundario", onclick: () => acao(() => postar("/api/ia/codex/usar-sistema"), "Codex do computador em uso de novo.", "codex") }, [icone("arrow-counter-clockwise"), s.local ? "Usar de novo o Codex deste computador" : "Usar de novo o Codex do servidor"]));
  }
  const entrar = el("button", { class: "btn " + (c.conectado && !problema ? "btn--secundario" : "btn--primario") }, [el("span", { class: "rotulo" }, [icone("sign-in"), c.conectado ? "Entrar de novo / outra conta" : "Entrar com a conta do ChatGPT"])]);
  entrar.addEventListener("click", () => entrarNoCodex(entrar, caixaLogin));
  const botoes = el("div", { class: "con-acoes" }, [
    c.conectado ? el("button", { class: "btn btn--secundario", onclick: () => testarContas("codex") }, [icone("pulse"), "Testar agora"]) : null,
    entrar,
    c.conectado ? el("button", { class: "btn btn--fantasma", onclick: sairDoCodex }, [icone("plug"), "Desconectar"]) : null,
  ].filter(Boolean));
  if (!c.conectado) filhos.push(el("p", { class: "con-texto", texto: "Aparece um código. Abra o link em qualquer aparelho (pode ser o celular), entre na sua conta do ChatGPT e digite o código. A conexão aparece aqui sozinha." }));
  filhos.push(botoes, caixaLogin);
  if (c.login && c.login.estado === "aguardando" && c.login.codigo) { entrar.hidden = true; mostrarCodigo(caixaLogin, c.login); }

  filhos.push(el("details", { class: "con-alternativa", open: !!s.openai && !c.conectado }, [
    el("summary", { texto: "Usar uma chave da API da OpenAI em vez da conta" }),
    s.openai
      ? el("button", { class: "btn btn--fantasma", onclick: () => desconectar("openai") }, [icone("plug"), "Desconectar chave da OpenAI"])
      : el("div", {}, [
        el("p", { class: "con-texto" }, ["Cobra por uso. Crie em ", el("a", { href: "https://platform.openai.com/api-keys", target: "_blank", rel: "noopener", texto: "platform.openai.com/api-keys" }), " (precisa de crédito em Billing). Se a conta do ChatGPT estiver conectada, ela tem prioridade."]),
        campoSegredo("Chave da OpenAI", "openai", "Cole a chave da OpenAI"),
      ]),
  ]));
  return el("section", { class: "con-secao" }, filhos);
}

function mostrarCodigo(caixa, l) {
  const copiar = el("button", { class: "btn btn--secundario btn--icone", "aria-label": "Copiar código", title: "Copiar código" }, [icone("copy")]);
  copiar.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(l.codigo); copiar.replaceChildren(icone("check")); setTimeout(() => copiar.replaceChildren(icone("copy")), 1600); }
    catch { aviso("Não deu para copiar. Selecione o código.", "warning"); }
  });
  caixa.replaceChildren(el("div", { class: "codex-codigo" }, [
    el("p", { class: "codex-passo", texto: "1. Abra a página de login da OpenAI:" }),
    el("a", { class: "btn btn--primario btn--bloco", href: l.url, target: "_blank", rel: "noopener" }, [icone("arrow-square-out"), "Abrir auth.openai.com"]),
    el("p", { class: "codex-passo", texto: "2. Entre na sua conta do ChatGPT e digite este código:" }),
    el("div", { class: "codex-linha" }, [el("code", { class: "codex-cod mono", texto: l.codigo }), copiar]),
    el("p", { class: "codex-espera" }, [icone("circle-notch"), "Esperando você confirmar. O código vale 15 minutos."]),
  ]));
}

async function entrarNoCodex(btn, caixa) {
  btn.dataset.estado = "carregando"; btn.disabled = true;
  let l;
  try {
    const d = await (await api("/api/ia/codex/entrar", { method: "POST", body: "{}" })).json();
    if (!d.ok) throw new Error(d.erro || "não iniciou");
    l = d;
  } catch (e) {
    btn.dataset.estado = ""; btn.disabled = false;
    return aviso("Não deu para iniciar o login: " + e.message, "warning");
  }
  btn.hidden = true;
  mostrarCodigo(caixa, l);
  const fim = Date.now() + 15 * 60 * 1000;
  clearInterval(sondagem);
  sondagem = setInterval(async () => {
    if (Date.now() > fim || $("#folha-fundo").dataset.aberta !== "1") { clearInterval(sondagem); return; }
    try {
      const d = await (await api("/api/ia/codex/estado", { method: "POST", body: "{}" })).json();
      const est = d.login && d.login.estado;
      if (est === "conectado") { clearInterval(sondagem); aviso("Conta do ChatGPT conectada. Conferindo..."); await lerEstado(); await testarContas("codex"); }
      else if (est === "erro") { clearInterval(sondagem); aviso("Login não concluído: " + (d.login.erro || ""), "warning"); await lerEstado(); desenhar(); }
    } catch { /* tenta de novo */ }
  }, 3000);
}

async function sairDoCodex() {
  const origem = estado && estado.codexInfo && estado.codexInfo.origem;
  if (!confirm(origem === "app" ? "Desconectar a conta do ChatGPT deste app?" : "Desconectar a conta do ChatGPT deste app? O Codex do computador não é apagado; o app só deixa de usá-lo.")) return;
  try { await api("/api/ia/codex/sair", { method: "POST", body: "{}" }); aviso("Conta do ChatGPT desconectada.", "plug"); }
  catch (e) { aviso("Não deu: " + e.message, "warning"); }
  await lerEstado();
  desenhar();
}

// ---------- seção: API (opcional) ----------
function secaoApi(s) {
  return el("details", { class: "con-secao con-alternativa", open: s.chaveApi }, [
    el("summary", { texto: "Usar uma chave da API Anthropic em vez da assinatura" }),
    s.chaveApi
      ? el("div", {}, [el("p", { class: "con-texto", texto: "Chave da API conectada." }), el("button", { class: "btn btn--fantasma", onclick: () => desconectar("api") }, [icone("plug"), "Desconectar chave"])])
      : el("div", {}, [el("p", { class: "con-texto", texto: "Cobra por uso na sua conta da API (console.anthropic.com). Se a conta Claude também estiver conectada, a assinatura tem prioridade." }), campoSegredo("Chave da API", "api", "Cole a chave da API")]),
  ]);
}

// ---------- assistente de primeiros passos ----------
// Três passos, um por tela: Claude (o cérebro), Groq (o ouvido) e ChatGPT (o ilustrador, opcional).
// Cada passo usa a mesma seção da lista completa, então conectar por aqui ou por lá é igual.
let modo = "lista";
let passo = 0;
const CHAVE_VISTO = "forge-assistente-visto";
const semFalha = (s, c) => !(s && s.saude && s.saude[c] && s.saude[c].ok === false);
const prontoClaude = (s) => !!(s && ((s.claude && s.claude.logado && !s.claudeSemSistema) || s.tokenClaude || s.chaveApi)) && semFalha(s, "claude");
const prontoGroq = (s) => !!(s && s.groq) && semFalha(s, "groq");
const prontoImagem = (s) => !!(s && ((s.codexInfo && s.codexInfo.conectado) || s.codex || s.openai)) && semFalha(s, "codex");
const PASSOS = [
  { id: "claude", titulo: "Conta Claude", papel: "O cérebro", obrigatorio: true, pronto: prontoClaude,
    texto: "Lê o que foi falado no vídeo e cria o resumo, o mapa mental, o organograma, a linha do tempo, as perguntas e o roteiro do infográfico. Usa a sua assinatura Claude (Pro ou Max).",
    dica: "Não tem assinatura Claude? Abra \"Usar uma chave da API Anthropic\" logo abaixo: funciona igual, cobrando por uso.",
    secao: (s) => [secaoClaude(s), secaoApi(s)] },
  { id: "groq", titulo: "Transcrição (Groq)", papel: "O ouvido", obrigatorio: false, pronto: prontoGroq,
    texto: "Transcreve o áudio dos vídeos que não têm legenda: quase todo vídeo do Instagram e do TikTok, e os arquivos que você enviar. É grátis.",
    passos: ["Entre em console.groq.com (dá para entrar com a conta Google).", "No menu, abra API Keys e toque em Create API Key.", "Copie a chave e cole no campo abaixo."],
    secao: (s) => [secaoGroq(s)] },
  { id: "imagem", titulo: "Conta ChatGPT", papel: "O ilustrador", obrigatorio: false, pronto: prontoImagem,
    texto: "Desenha o pôster do infográfico com o gerador de imagens do ChatGPT, na sua assinatura. É opcional: sem ele, todo o resto funciona (inclusive a Apostila Técnica Interativa).",
    secao: (s) => [secaoImagem(s)] },
];

function desenharAssistente() {
  const s = estado;
  const total = PASSOS.length;
  const trilha = el("ol", { class: "ass-trilha", "aria-label": "Passos" }, PASSOS.map((p, i) => el("li", {
    class: (i === passo ? "agora " : "") + (p.pronto(s) ? "feito" : ""),
  }, [el("button", { type: "button", onclick: () => { passo = i; desenhar(); }, "aria-label": `Ir para ${p.titulo}` }, [
    el("span", { class: "ass-bola" }, [p.pronto(s) ? icone("check", true) : el("span", { texto: String(i + 1) })]),
    el("span", { class: "ass-nome", texto: p.papel }),
  ])])));

  // tela final: resumo do que está pronto
  if (passo >= total) {
    const essencial = prontoClaude(s);
    return abrir([
      el("h2", { id: "folha-titulo", texto: essencial ? "Tudo pronto!" : "Quase lá" }),
      trilha,
      el("ul", { class: "ass-resumo" }, PASSOS.map((p) => el("li", { class: p.pronto(s) ? "ok" : "" }, [
        icone(p.pronto(s) ? "check-circle" : p.obrigatorio ? "warning-circle" : "circle-dashed", true),
        el("span", {}, [el("b", { texto: p.titulo }), el("small", { texto: p.pronto(s) ? "Conectado" : p.obrigatorio ? "Falta conectar: sem ele o Estúdio IA não funciona" : "Não conectado (opcional)" })]),
      ]))),
      el("p", { class: "con-texto", texto: essencial
        ? "Agora é só colar o link de um vídeo (ou enviar um arquivo), baixar e tocar em \"Gerar estudo com IA\". Você pode voltar aqui quando quiser em Conectar IA."
        : "Conecte a conta Claude para gerar os estudos. Você também pode fazer isso depois, em Conectar IA." }),
      el("button", { class: "btn btn--primario btn--grande btn--bloco", onclick: () => { localStorage.setItem(CHAVE_VISTO, "1"); modo = "lista"; fecharFolha(); } }, [icone(essencial ? "rocket-launch" : "check", true), essencial ? "Começar a usar" : "Fechar e continuar depois"]),
      essencial ? null : el("button", { class: "btn btn--fantasma btn--bloco", onclick: () => { passo = 0; desenhar(); } }, [icone("arrow-left"), "Voltar para a conta Claude"]),
    ].filter(Boolean), { aoFechar: () => { clearInterval(sondagem); modo = "lista"; localStorage.setItem(CHAVE_VISTO, "1"); } });
  }

  const p = PASSOS[passo];
  const pronto = p.pronto(s);
  const navegar = el("div", { class: "ass-nav" }, [
    passo > 0 ? el("button", { class: "btn btn--fantasma", onclick: () => { passo--; desenhar(); } }, [icone("arrow-left"), "Voltar"]) : el("span"),
    el("button", { class: "btn " + (pronto || !p.obrigatorio ? "btn--primario" : "btn--secundario"), onclick: () => { passo++; desenhar(); } }, [
      pronto ? "Próximo" : p.obrigatorio ? "Fazer depois" : "Pular", icone("arrow-right"),
    ]),
  ]);
  abrir([
    el("p", { class: "ass-topo mono", texto: `Primeiros passos · ${passo + 1} de ${total}` }),
    el("h2", { id: "folha-titulo" }, [p.titulo, el("span", { class: "ass-papel", texto: p.papel })]),
    trilha,
    el("p", { class: "ass-texto", texto: p.texto }),
    pronto ? el("p", { class: "ass-pronto" }, [icone("check-circle", true), "Já está conectado. Pode seguir."]) : null,
    p.passos && !pronto ? el("ol", { class: "ass-como" }, p.passos.map((t) => el("li", { texto: t }))) : null,
    p.dica && !pronto ? el("p", { class: "ass-dica" }, [icone("lightbulb", true), el("span", { texto: p.dica })]) : null,
    el("div", { class: "con-lista ass-secao" }, p.secao(s)),
    navegar,
  ].filter(Boolean), { aoFechar: () => { clearInterval(sondagem); modo = "lista"; localStorage.setItem(CHAVE_VISTO, "1"); } });
}

export async function abrirAssistente() {
  await lerEstado();
  modo = "assistente";
  // começa no primeiro passo que ainda falta
  const i = PASSOS.findIndex((p) => !p.pronto(estado));
  passo = i < 0 ? PASSOS.length : i;
  desenhar();
}

// no primeiro uso, abre sozinho se faltar algo importante (Claude ou Groq)
export async function talvezAbrirAssistente() {
  if (localStorage.getItem(CHAVE_VISTO)) return;
  const s = await lerEstado();
  if (!s || !s.podeConfigurar) return;
  if (!prontoClaude(s) || !prontoGroq(s)) abrirAssistente();
  else localStorage.setItem(CHAVE_VISTO, "1");
}

// Reconectar: aberto pelo próprio Estúdio quando a geração falha por causa de uma conta.
// Mostra o motivo, só a conta com problema e, quando ela voltar a funcionar, o botão para tentar de novo.
let foco = null; // { conta, motivo, aoConectar, rotulo }
const SECAO_DA_CONTA = { claude: (s) => [secaoClaude(s), secaoApi(s)], groq: (s) => [secaoGroq(s)], codex: (s) => [secaoImagem(s)], api: (s) => [secaoClaude(s), secaoApi(s)] };
const NOME_CONTA = { claude: "conta Claude", api: "conta Claude", groq: "chave da Groq", codex: "conta do ChatGPT (Codex)" };
function desenharReconectar() {
  const s = estado;
  const conta = foco.conta === "api" ? "claude" : foco.conta;
  const x = s && s.saude ? s.saude[conta] : null;
  const voltou = x && x.ok === true;
  abrir([
    el("h2", { id: "folha-titulo", texto: voltou ? "Conta funcionando de novo" : `Reconectar a ${NOME_CONTA[foco.conta] || foco.conta}` }),
    voltou
      ? el("p", { class: "ass-pronto" }, [icone("check-circle", true), "Testei agora e está funcionando. Pode gerar de novo."])
      : x && x.ok === false ? null // o motivo já aparece na seção da conta, logo abaixo
        : el("p", { class: "con-problema", role: "alert" }, [icone("warning-circle", true), el("span", { texto: (foco.motivo || "A conta não está funcionando").replace(/^./, (c) => c.toUpperCase()) })]),
    voltou && foco.aoConectar
      ? el("button", { class: "btn btn--primario btn--grande btn--bloco", onclick: () => { const f = foco.aoConectar; foco = null; modo = "lista"; fecharFolha(); f(); } }, [icone("sparkle", true), foco.rotulo || "Gerar de novo"])
      : null,
    s && s.podeConfigurar
      ? el("div", { class: "con-lista" }, (SECAO_DA_CONTA[foco.conta] || SECAO_DA_CONTA.claude)(s))
      : el("p", { class: "con-texto", texto: "Para conectar contas pela rede, o app precisa ter uma senha. Abra o app no próprio computador onde ele está instalado." }),
    el("button", { class: "btn btn--fantasma btn--bloco", onclick: fecharFolha }, ["Fechar"]),
  ].filter(Boolean), { aoFechar: () => { clearInterval(sondagem); foco = null; modo = "lista"; } });
}

export async function abrirReconectar(conta, { motivo = "", aoConectar = null, rotulo = "" } = {}) {
  foco = { conta, motivo, aoConectar, rotulo };
  modo = "reconectar";
  await lerEstado();
  desenhar();
  testarContas(conta === "api" ? "claude" : conta); // mostra o estado real da conta já de cara
}

function desenhar() {
  if (modo === "reconectar" && foco) return desenharReconectar();
  if (modo === "assistente" && estado && estado.podeConfigurar) return desenharAssistente();
  const s = estado;
  if (!s) return abrir([el("h2", { id: "folha-titulo", texto: "Conectar IA" }), el("p", { class: "con-texto", texto: "Não deu para ler o estado das conexões. Tente de novo." })]);
  if (!s.podeConfigurar) {
    return abrir([el("h2", { id: "folha-titulo", texto: "Conectar IA" }), el("p", { class: "con-texto", texto: "Para conectar contas pela rede, o app precisa ter uma senha (SENHA no arquivo .env). Abra o app no próprio computador onde ele está instalado." })]);
  }
  const emUso = s.provedor ? `Em uso agora: ${NOMES[s.provedor] || s.provedor}.` : "Nenhuma IA conectada ainda.";
  abrir([
    el("h2", { id: "folha-titulo", texto: "Conectar IA" }),
    el("p", { class: "meta", texto: emUso }),
    el("button", { class: "btn btn--secundario btn--bloco", disabled: testando, onclick: () => testarContas() }, [icone(testando ? "circle-notch" : "pulse", true), testando ? "Testando as contas de verdade..." : "Testar todas as contas agora"]),
    el("button", { class: "btn btn--fantasma btn--bloco ass-abrir", onclick: abrirAssistente }, [icone("compass", true), "Primeiros passos (guia de 3 etapas)"]),
    el("div", { class: "con-lista" }, [secaoClaude(s), secaoGroq(s), secaoImagem(s), secaoApi(s)]),
    el("button", { class: "btn btn--secundario btn--bloco", onclick: fecharFolha }, ["Fechar"]),
    el("button", { class: "btn btn--fantasma btn--bloco", onclick: verTermo }, [icone("scroll"), "Termo de uso"]),
  ], { aoFechar: () => clearInterval(sondagem) });
}

export async function abrirConexoes() {
  await lerEstado();
  modo = "lista";
  desenhar();
  // ao abrir, confere de verdade as contas que não foram testadas há pouco
  const sa = (estado && estado.saude) || {};
  const velho = (x) => !x || Date.now() - x.em > 2 * 60 * 1000;
  if (estado && estado.podeConfigurar && (velho(sa.claude) || velho(sa.groq) || velho(sa.codex))) testarContas();
}
