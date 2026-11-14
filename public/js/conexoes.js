// Tela "Conectar IA": conta Claude (login do Claude Code ou token), Groq, conta ChatGPT (Codex) e, opcionalmente, chaves de API.
// Os valores colados vão direto para o servidor, que testa e guarda no .env; eles nunca voltam para a tela.
import { $, el, icone, api, aviso, abrirFolha, fecharFolha } from "./app.js";

let estado = null;
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
      setTimeout(() => (depois ? depois() : desenhar()), 900);
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

// ---------- seção: conta Claude ----------
function secaoClaude(s) {
  const c = s.claude || {};
  const conectado = c.logado || s.tokenClaude;
  const filhos = [
    el("div", { class: "con-cabeca" }, [
      el("span", { class: "con-icone" }, [icone("sparkle", true)]),
      el("div", {}, [el("h3", { texto: "Conta Claude" }), el("p", { texto: "Gera resumo, mapa mental e o resto usando a sua assinatura Claude." })]),
      selo(conectado, "Conectada", "Não conectada"),
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

  if (conectado) {
    filhos.push(el("p", { class: "con-texto", texto: s.tokenClaude ? "Conectada por token. Para usar outra conta, desconecte e conecte de novo." : "Conectada pelo login do Claude Code deste computador." }));
    if (s.tokenClaude) filhos.push(el("button", { class: "btn btn--fantasma", onclick: () => desconectar("claude-token") }, [icone("plug"), "Desconectar token"]));
    return el("section", { class: "con-secao" }, filhos);
  }

  if (s.local) {
    const entrar = el("button", { class: "btn btn--primario btn--grande btn--bloco" }, [el("span", { class: "rotulo" }, [icone("sign-in"), "Entrar com a conta Claude"])]);
    entrar.addEventListener("click", () => loginNoTerminal(entrar));
    filhos.push(
      el("p", { class: "con-texto", texto: "Vai abrir uma janela do terminal com o login do Claude. Entre na sua conta pelo navegador e volte para cá: a conexão aparece sozinha." }),
      entrar,
    );
  }
  filhos.push(el("details", { class: "con-alternativa", open: !s.local }, [
    el("summary", { texto: s.local ? "Prefere colar um token?" : "Conectar com um token" }),
    el("ol", { class: "con-passos" }, [
      el("li", {}, ["Num computador com o Claude Code, rode:", copiavel("claude setup-token")]),
      el("li", { texto: "Entre na sua conta Claude no navegador que abrir." }),
      el("li", { texto: "Copie o token que aparece no terminal e cole aqui:" }),
    ]),
    campoSegredo("Token do Claude", "claude-token", "Cole o token aqui"),
  ]));
  return el("section", { class: "con-secao" }, filhos);
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
        aviso("Conta Claude conectada.");
        await lerEstado();
        desenhar();
      }
    } catch { /* tenta de novo */ }
  }, 3000);
}

async function verificar() {
  try { await api("/api/ia/verificar", { method: "POST", body: "{}" }); } catch { /* segue */ }
  await lerEstado();
  desenhar();
}

// ---------- seção: Groq ----------
function secaoGroq(s) {
  return el("section", { class: "con-secao" }, [
    el("div", { class: "con-cabeca" }, [
      el("span", { class: "con-icone" }, [icone("waveform", true)]),
      el("div", {}, [el("h3", { texto: "Transcrição do áudio (Groq)" }), el("p", { texto: "Para vídeos sem legenda, como a maioria do Instagram e do TikTok." })]),
      selo(s.groq, s.groqChaves > 1 ? `Conectada (${s.groqChaves} chaves em revezamento)` : "Conectada", "Opcional"),
    ]),
    s.groq
      ? el("button", { class: "btn btn--fantasma", onclick: () => desconectar("groq") }, [icone("plug"), "Desconectar Groq"])
      : el("div", {}, [
        el("p", { class: "con-texto" }, ["Crie uma chave grátis em ", el("a", { href: "https://console.groq.com/keys", target: "_blank", rel: "noopener", texto: "console.groq.com/keys" }), " e cole aqui:"]),
        campoSegredo("Chave da Groq", "groq", "Cole a chave da Groq"),
      ]),
  ]);
}

// ---------- seção: Codex / ChatGPT (desenha o infográfico) ----------
function secaoImagem(s) {
  const c = s.codexInfo || { conectado: !!s.codex };
  const filhos = [
    el("div", { class: "con-cabeca" }, [
      el("span", { class: "con-icone" }, [icone("open-ai-logo", true)]),
      el("div", {}, [el("h3", { texto: "Conta ChatGPT (Codex)" }), el("p", { texto: "Desenha o pôster do infográfico com o gerador de imagens do ChatGPT, na sua assinatura." })]),
      selo(c.conectado || s.openai, c.conectado ? "Conectada" : "Chave da OpenAI", "Não conectada"),
    ]),
  ];
  const caixaLogin = el("div", { class: "codex-login" });

  if (c.conectado) {
    filhos.push(el("p", { class: "con-texto", texto: c.origem === "app"
      ? "Conectada por aqui, pelo login do Codex. Para trocar de conta, desconecte e entre de novo."
      : "Usando o Codex que já está logado neste servidor. Para usar outra conta do ChatGPT só neste app, entre abaixo." }));
    if (c.origem === "app") filhos.push(el("button", { class: "btn btn--fantasma", onclick: sairDoCodex }, [icone("plug"), "Desconectar conta ChatGPT"]));
    else {
      const outra = el("button", { class: "btn btn--secundario" }, [el("span", { class: "rotulo" }, [icone("sign-in"), "Entrar com outra conta"])]);
      outra.addEventListener("click", () => entrarNoCodex(outra, caixaLogin));
      filhos.push(outra, caixaLogin);
    }
  } else {
    const entrar = el("button", { class: "btn btn--primario btn--grande btn--bloco" }, [el("span", { class: "rotulo" }, [icone("sign-in"), "Entrar com a conta do ChatGPT"])]);
    entrar.addEventListener("click", () => entrarNoCodex(entrar, caixaLogin));
    filhos.push(el("p", { class: "con-texto", texto: "Aparece um código. Abra o link em qualquer aparelho (pode ser o celular), entre na sua conta do ChatGPT e digite o código. A conexão aparece aqui sozinha." }), entrar, caixaLogin);
  }
  if (c.login && c.login.estado === "aguardando" && c.login.codigo) mostrarCodigo(caixaLogin, c.login);

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
      if (est === "conectado") { clearInterval(sondagem); aviso("Conta do ChatGPT conectada."); await lerEstado(); desenhar(); }
      else if (est === "erro") { clearInterval(sondagem); aviso("Login não concluído: " + (d.login.erro || ""), "warning"); await lerEstado(); desenhar(); }
    } catch { /* tenta de novo */ }
  }, 3000);
}

async function sairDoCodex() {
  if (!confirm("Desconectar a conta do ChatGPT deste app?")) return;
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

function desenhar() {
  const s = estado;
  if (!s) return abrirFolha([el("h2", { id: "folha-titulo", texto: "Conectar IA" }), el("p", { class: "con-texto", texto: "Não deu para ler o estado das conexões. Tente de novo." })]);
  if (!s.podeConfigurar) {
    return abrirFolha([el("h2", { id: "folha-titulo", texto: "Conectar IA" }), el("p", { class: "con-texto", texto: "Para conectar contas pela rede, o app precisa ter uma senha (SENHA no arquivo .env). Abra o app no próprio computador onde ele está instalado." })]);
  }
  const emUso = s.provedor ? `Em uso agora: ${NOMES[s.provedor] || s.provedor}.` : "Nenhuma IA conectada ainda.";
  abrirFolha([
    el("h2", { id: "folha-titulo", texto: "Conectar IA" }),
    el("p", { class: "meta", texto: emUso }),
    el("div", { class: "con-lista" }, [secaoClaude(s), secaoGroq(s), secaoImagem(s), secaoApi(s)]),
    el("button", { class: "btn btn--secundario btn--bloco", onclick: fecharFolha }, ["Fechar"]),
  ], { aoFechar: () => clearInterval(sondagem) });
}

export async function abrirConexoes() {
  await lerEstado();
  desenhar();
}
