// Cartão "Abrir no celular": QR code do endereço do app (no ar: forge.mergeia.com.br).
// Só aparece no computador e quando o app está publicado num endereço (não em "localhost").
import { $, el, icone, aviso } from "./app.js";

let qrPronto = null;
function carregarQR() {
  if (qrPronto) return qrPronto;
  qrPronto = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js";
    s.onload = () => res(window.qrcode);
    s.onerror = () => { qrPronto = null; rej(new Error("sem internet para gerar o QR")); };
    document.head.append(s);
  });
  return qrPronto;
}

export function montarCelular() {
  const cartao = $("#celular");
  if (!cartao) return;
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const celular = matchMedia("(pointer: coarse)").matches;
  if (local || celular) { cartao.hidden = true; return; }
  cartao.hidden = false;

  // endereço antigo aponta para o oficial do Merge Forge; outras instalações usam o próprio endereço
  const OFICIAL = { "baixar.mergeia.com.br": "forge.mergeia.com.br" };
  const host = OFICIAL[location.hostname] || location.host;
  const endereco = `${location.protocol}//${host}/`;
  const caixa = el("div", { class: "qr-grande", role: "img", "aria-label": "QR code para abrir no celular" }, [el("div", { class: "qr-carregando esqueleto" })]);
  carregarQR().then((gerar) => {
    const q = gerar(0, "M");
    q.addData(endereco);
    q.make();
    caixa.innerHTML = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  }).catch(() => caixa.replaceChildren(el("p", { class: "qr-falhou", texto: "Abra o endereço abaixo no celular." })));

  const copiar = el("button", { class: "btn btn--fantasma btn--icone", "aria-label": "Copiar endereço", title: "Copiar" }, [icone("copy")]);
  copiar.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(endereco); copiar.replaceChildren(icone("check")); setTimeout(() => copiar.replaceChildren(icone("copy")), 1500); }
    catch { aviso("Não deu para copiar.", "warning"); }
  });

  $("#celular-corpo").replaceChildren(
    el("div", { class: "qr-linha" }, [
      el("figure", { class: "qr-fig" }, [caixa, el("figcaption", { class: "qr-leg" }, [icone("device-mobile", true), "Escaneie para instalar no celular"])]),
      el("p", { class: "con-texto", texto: "Aponte a câmera do celular. Depois toque em Instalar app para ter o ícone na tela inicial." }),
    ]),
    el("div", { class: "endereco" }, [el("code", { class: "mono", texto: host }), copiar]),
  );
}
