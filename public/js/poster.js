// Infográfico do vídeo: um pôster único desenhado pelo gerador de imagens da OpenAI
// (roteiro de arte escrito pelo Claude). Na tela: pôster com zoom, arrastar, tela cheia e download.
import { el, icone, api, aviso, barraProgresso } from "./app.js";
import { abrirConexoes, abrirReconectar } from "./conexoes.js";

const urlImagem = (nome, versao) => `/api/quadro?nome=${encodeURIComponent(nome)}&n=1&v=${encodeURIComponent(versao || "")}`;
const EM_ANDAMENTO = ["na-fila", "roteiro", "desenhando"];
const nomeArquivo = (t) => `infografico-${String(t || "video").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50)}.jpg`;

export function montarPoster(nome) {
  const caixa = el("div", { class: "v-ip" }, [el("div", { class: "ip-carregando" }, [icone("circle-notch"), "Carregando o infográfico"])]);
  let timer = null;
  let ultima = "";
  let inicio = 0;
  let estadoAntes = null;
  // conta com problema: reconecta ali mesmo e, quando voltar, cria o infográfico de novo
  const reconectar = (conta, motivo, refazer) => abrirReconectar(conta, { motivo, rotulo: "Criar o infográfico", aoConectar: () => gerar(refazer) });

  async function atualizar() {
    clearTimeout(timer);
    if (!caixa.isConnected && caixa.dataset.montado) return; // saiu da tela: para de consultar
    caixa.dataset.montado = "1";
    let d;
    try { d = await (await api("/api/poster?nome=" + encodeURIComponent(nome))).json(); }
    catch (e) { caixa.replaceChildren(el("p", { class: "est-nota", texto: "Não deu para carregar o infográfico: " + e.message })); return; }
    // falhou agora por causa de uma conta: abre a reconexão na hora
    if (d.estado === "erro" && d.conta && EM_ANDAMENTO.includes(estadoAntes)) reconectar(d.conta, d.erro, false);
    estadoAntes = d.estado;
    const chave = JSON.stringify([d.estado, d.etapa, d.erro, d.progresso, d.poster && d.poster.geradoEm, d.imagemConectada]);
    if (chave !== ultima) { ultima = chave; desenhar(d); }
    if (EM_ANDAMENTO.includes(d.estado)) timer = setTimeout(atualizar, 3000);
  }

  async function gerar(refazer, btn) {
    if (btn) { btn.dataset.estado = "carregando"; btn.disabled = true; }
    try {
      const d = await (await api("/api/poster", { method: "POST", body: JSON.stringify({ nome, refazer }) })).json();
      if (!d.ok && d.conta) {
        if (btn) { btn.dataset.estado = ""; btn.disabled = false; }
        return reconectar(d.conta, d.erro, refazer);
      }
      if (!d.ok) throw new Error(d.erro || "não deu para começar");
      inicio = Date.now();
      ultima = "";
      atualizar();
    } catch (e) {
      if (btn) { btn.dataset.estado = ""; btn.disabled = false; }
      aviso("Não deu: " + e.message, "warning");
    }
  }

  function desenhar(d) {
    const p = d.poster;
    const andamento = EM_ANDAMENTO.includes(d.estado);

    if (andamento) {
      if (!inicio) inicio = Date.now();
      const passo = d.estado === "desenhando" ? 2 : 1;
      caixa.replaceChildren(el("div", { class: "cartao ip-gerando" }, [
        el("div", { class: "ip-gerando-folha" }, [el("span", { class: "ip-gerando-brilho" })]),
        el("div", { class: "ip-gerando-texto" }, [
          el("h3", { texto: "Criando o infográfico" }),
          typeof d.progresso === "number" ? barraProgresso(d.progresso, { estimado: !!d.estimado }) : null,
          el("ol", { class: "ip-passos" }, [
            el("li", { class: passo > 1 ? "feito" : "agora" }, [icone(passo > 1 ? "check-circle" : "circle-notch", passo > 1), "Claude estuda o vídeo e escreve o roteiro do pôster"]),
            el("li", { class: passo === 2 ? "agora" : "" }, [icone(passo === 2 ? "circle-notch" : "circle"), "Codex desenha o pôster com a sua conta do ChatGPT (1 a 4 minutos)"]),
          ]),
          el("p", { class: "ip-relogio mono", "data-inicio": String(inicio) }),
        ]),
      ]));
      relogio(caixa);
      return;
    }

    if (!p || !p.imagem) {
      const btn = el("button", { class: "btn btn--primario btn--grande", disabled: !d.imagemConectada }, [el("span", { class: "rotulo" }, [icone("magic-wand", true), "Criar o infográfico"])]);
      btn.addEventListener("click", () => gerar(false, btn));
      caixa.replaceChildren(el("div", { class: "cartao ip-convite" }, [
        el("div", { class: "ip-convite-ic" }, [icone("image", true)]),
        el("h3", { texto: "O vídeo inteiro em um pôster" }),
        el("p", { texto: "Um infográfico ilustrado de alto detalhe, com etapas, peças em 3D explodido com rótulos, painéis de dados e resumo final, todo em português. O Claude escreve o roteiro e o gerador de imagens do ChatGPT desenha." }),
        d.estado === "erro" ? el("p", { class: "est-erro" }, [icone("warning-circle", true), el("span", { texto: "Da última vez deu erro: " + (d.erro || "") })]) : null,
        d.estado === "erro" && d.conta ? el("button", { class: "btn btn--secundario", onclick: () => reconectar(d.conta, d.erro, false) }, [icone("plugs-connected"), "Reconectar a conta e criar de novo"]) : null,
        d.imagemConectada ? btn : el("div", { class: "ip-sem-chave" }, [
          el("p", { texto: "O desenho usa a sua conta do ChatGPT (Codex) ou uma chave da OpenAI." }),
          el("button", { class: "btn btn--primario", onclick: () => reconectar("codex", "entre com a conta do ChatGPT para desenhar o infográfico", false) }, [icone("plugs-connected"), "Conectar agora"]),
        ]),
      ]));
      return;
    }

    const src = urlImagem(nome, p.geradoEm);
    const imagem = el("img", { class: "ip-img", src, alt: `Infográfico: ${p.titulo || ""}`, decoding: "async" });
    const lupa = el("div", { class: "ip-lupa", "aria-hidden": "true" });
    const quadro = el("button", { class: "ip-quadro", "aria-label": "Abrir o infográfico em tela cheia" }, [imagem, lupa, el("span", { class: "ip-dica" }, [icone("magnifying-glass-plus"), "Clique para ampliar"])]);
    lupaDeAumento(quadro, imagem, lupa, src);
    quadro.addEventListener("click", () => telaCheia(src, imagem.alt));

    const baixar = el("a", { class: "btn btn--secundario", href: src, download: nomeArquivo(p.titulo) }, [icone("download-simple"), "Baixar imagem"]);
    const refazer = el("button", { class: "btn btn--fantasma", onclick: (ev) => { if (confirm("Criar o infográfico de novo? Gera uma imagem nova no ChatGPT.")) gerar(true, ev.currentTarget); } }, [icone("arrow-clockwise"), "Criar outro"]);
    const texto = (p.secoes || []).length ? el("details", { class: "ip-texto" }, [
      el("summary", {}, [icone("text-align-left"), "Texto do infográfico"]),
      ...(p.secoes || []).map((s) => el("div", { class: "ip-texto-sec" }, [el("h4", { texto: s.titulo }), el("ul", {}, (s.itens || []).map((t) => el("li", { texto: t })))])),
    ]) : null;

    caixa.replaceChildren(
      el("div", { class: "ip-barra" }, [
        d.estado === "erro" ? el("p", { class: "est-erro" }, [icone("warning-circle", true), el("span", { texto: d.erro || "deu erro" })]) : null,
        el("button", { class: "btn btn--primario", onclick: () => telaCheia(src, imagem.alt) }, [icone("arrows-out", true), "Tela cheia"]),
        baixar, refazer,
      ]),
      quadro,
      texto,
    );
  }

  atualizar();
  return caixa;
}

// cronômetro do "criando"
function relogio(raiz) {
  const p = raiz.querySelector(".ip-relogio");
  if (!p) return;
  const t0 = Number(p.dataset.inicio) || Date.now();
  const tique = () => {
    if (!p.isConnected) return;
    const s = Math.floor((Date.now() - t0) / 1000);
    p.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    setTimeout(tique, 1000);
  };
  tique();
}

// lupa que acompanha o mouse sobre o pôster (só em telas com mouse)
function lupaDeAumento(quadro, imagem, lupa, src) {
  if (matchMedia("(hover: none)").matches) return;
  lupa.style.backgroundImage = `url("${src}")`;
  quadro.addEventListener("pointermove", (e) => {
    const r = imagem.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) { quadro.classList.remove("ip-quadro--lupa"); return; }
    quadro.classList.add("ip-quadro--lupa");
    const zoom = 2.6;
    lupa.style.left = `${e.clientX - r.left}px`;
    lupa.style.top = `${e.clientY - r.top}px`;
    lupa.style.backgroundSize = `${r.width * zoom}px ${r.height * zoom}px`;
    lupa.style.backgroundPosition = `${-(x * r.width * zoom - lupa.offsetWidth / 2)}px ${-(y * r.height * zoom - lupa.offsetHeight / 2)}px`;
  });
  quadro.addEventListener("pointerleave", () => quadro.classList.remove("ip-quadro--lupa"));
}

// tela cheia: zoom com a roda/pinça/botões, arrastar para navegar, duplo clique alterna zoom
function telaCheia(src, alt) {
  const img = el("img", { src, alt, class: "ip-tc-img", draggable: "false" });
  const palco = el("div", { class: "ip-tc-palco" }, [img]);
  const nivel = el("span", { class: "ip-tc-nivel mono", texto: "100%" });
  const botao = (ic, rot, fn) => el("button", { class: "btn btn--fantasma btn--icone", "aria-label": rot, title: rot, onclick: fn }, [icone(ic)]);
  let z = 1, x = 0, y = 0;
  const aplicar = (animar) => {
    img.style.transition = animar ? "transform .35s cubic-bezier(.16,1,.3,1)" : "none";
    img.style.transform = `translate(${x}px, ${y}px) scale(${z})`;
    nivel.textContent = `${Math.round(z * 100)}%`;
  };
  const zoomEm = (novo, cx, cy, animar) => {
    novo = Math.min(6, Math.max(1, novo));
    const r = palco.getBoundingClientRect();
    const px = cx - r.left - r.width / 2, py = cy - r.top - r.height / 2;
    x = px - ((px - x) * novo) / z; y = py - ((py - y) * novo) / z; z = novo;
    if (z === 1) { x = 0; y = 0; }
    aplicar(animar);
  };
  const centro = () => { const r = palco.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  const barra = el("div", { class: "ip-tc-barra" }, [
    botao("minus", "Diminuir", () => zoomEm(z / 1.5, ...centro(), true)),
    nivel,
    botao("plus", "Aumentar", () => zoomEm(z * 1.5, ...centro(), true)),
    botao("arrows-in", "Encaixar na tela", () => { z = 1; x = 0; y = 0; aplicar(true); }),
    el("a", { class: "btn btn--fantasma btn--icone", href: src, download: nomeArquivo(alt.replace(/^Infográfico:\s*/, "")), "aria-label": "Baixar", title: "Baixar" }, [icone("download-simple")]),
    botao("x", "Fechar", () => sair()),
  ]);
  const camada = el("div", { class: "ip-tc", role: "dialog", "aria-modal": "true", "aria-label": alt }, [palco, barra, el("p", { class: "ip-tc-dica", texto: "Role ou use a pinça para dar zoom. Arraste para navegar." })]);

  palco.addEventListener("wheel", (e) => { e.preventDefault(); zoomEm(z * (e.deltaY < 0 ? 1.18 : 1 / 1.18), e.clientX, e.clientY, false); }, { passive: false });
  palco.addEventListener("dblclick", (e) => zoomEm(z > 1.5 ? 1 : 2.6, e.clientX, e.clientY, true));
  const toques = new Map();
  let distIni = 0, zIni = 1;
  palco.addEventListener("pointerdown", (e) => { palco.setPointerCapture(e.pointerId); toques.set(e.pointerId, [e.clientX, e.clientY]); if (toques.size === 2) { const [a, b] = [...toques.values()]; distIni = Math.hypot(a[0] - b[0], a[1] - b[1]); zIni = z; } });
  palco.addEventListener("pointermove", (e) => {
    if (!toques.has(e.pointerId)) return;
    const ant = toques.get(e.pointerId);
    toques.set(e.pointerId, [e.clientX, e.clientY]);
    if (toques.size === 2) {
      const [a, b] = [...toques.values()];
      zoomEm(zIni * (Math.hypot(a[0] - b[0], a[1] - b[1]) / distIni), (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, false);
    } else if (z > 1) { x += e.clientX - ant[0]; y += e.clientY - ant[1]; aplicar(false); }
  });
  const soltar = (e) => toques.delete(e.pointerId);
  palco.addEventListener("pointerup", soltar);
  palco.addEventListener("pointercancel", soltar);

  const tecla = (e) => {
    if (e.key === "Escape") sair();
    else if (e.key === "+" || e.key === "=") zoomEm(z * 1.5, ...centro(), true);
    else if (e.key === "-") zoomEm(z / 1.5, ...centro(), true);
  };
  function sair() { camada.remove(); document.removeEventListener("keydown", tecla); document.documentElement.style.overflow = ""; }
  document.addEventListener("keydown", tecla);
  document.documentElement.style.overflow = "hidden";
  document.body.append(camada);
  barra.lastChild.focus();
}
