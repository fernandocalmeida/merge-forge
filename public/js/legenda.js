// Legenda em português no player: liga/desliga na hora, sem gravar nada no vídeo.
// A legenda vem da transcrição traduzida do estudo (GET /api/legenda-pt, WebVTT).
// "Tarja escura": fundo preto atrás da nossa legenda, para cobrir a legenda que o vídeo
// original já traz escrita na imagem. As duas escolhas ficam lembradas neste aparelho.
import { el, icone, api } from "./app.js";

const CHAVE_LIGADA = "forge-legenda-pt";
const CHAVE_TARJA = "forge-legenda-tarja";
const ler = (k, padrao) => { try { const v = localStorage.getItem(k); return v === null ? padrao : v === "1"; } catch { return padrao; } };
const gravar = (k, v) => { try { localStorage.setItem(k, v ? "1" : "0"); } catch {} };

// Põe a legenda no <video> e a barrinha com as duas chaves logo abaixo (null se não houver legenda em português).
export async function legendaPortugues(midia, nome) {
  if (!midia || midia.tagName !== "VIDEO" || midia.dataset.legendaPt) return null;
  let texto;
  try {
    const r = await api("/api/legenda-pt?nome=" + encodeURIComponent(nome));
    if (!r.ok) return null; // sem estudo ou sem tradução: não oferece
    texto = await r.text();
  } catch { return null; }
  if (!midia.isConnected || midia.dataset.legendaPt) return null;
  midia.dataset.legendaPt = "1";

  const trilha = el("track", { kind: "subtitles", srclang: "pt-BR", label: "Português", src: URL.createObjectURL(new Blob([texto], { type: "text/vtt" })) });
  midia.append(trilha);

  let ligada = ler(CHAVE_LIGADA, true);
  let tarja = ler(CHAVE_TARJA, true);
  const bLegenda = el("button", { class: "filtro leg-chave", type: "button", onclick: () => { ligada = !ligada; gravar(CHAVE_LIGADA, ligada); aplicar(); } }, [icone("subtitles"), el("span", { texto: "Legenda em português" })]);
  const bTarja = el("button", { class: "filtro leg-chave", type: "button", title: "Fundo escuro atrás da legenda: cobre a legenda que o vídeo já tiver", onclick: () => { tarja = !tarja; gravar(CHAVE_TARJA, tarja); aplicar(); } }, [icone("rectangle"), el("span", { texto: "Tarja escura" })]);
  // Tarja: faixa escura de largura total na parte de baixo do vídeo, com a tradução dentro. Ela cobre a
  // legenda que o vídeo original já traz escrita (o texto nativo do player só teria fundo atrás das letras).
  // Só aparece enquanto há fala; com o mouse em cima, sobe para não esconder os controles do player.
  const envolve = el("div", { class: "leg-envolve" });
  midia.replaceWith(envolve);
  envolve.append(midia);
  const faixa = el("div", { class: "leg-faixa", "aria-hidden": "true" }, [el("span")]);
  envolve.append(faixa);
  const trilhaPt = () => [...midia.textTracks].find((t) => t.language === "pt-BR");
  function mostrarFala() {
    const t = trilhaPt();
    const fala = t && t.activeCues && t.activeCues.length ? [...t.activeCues].map((c) => c.text).join("\n") : "";
    faixa.firstChild.textContent = fala;
    faixa.classList.toggle("leg-faixa--on", ligada && tarja && !!fala);
  }
  function aplicar() {
    // com tarja, o texto é desenhado na faixa (trilha "hidden" continua avisando cada fala);
    // sem tarja, o próprio player desenha a legenda com contorno
    const t = trilhaPt();
    if (t) { t.mode = ligada && !tarja ? "showing" : "hidden"; t.oncuechange = mostrarFala; }
    mostrarFala();
    bLegenda.setAttribute("aria-pressed", String(ligada));
    bTarja.setAttribute("aria-pressed", String(ligada && tarja));
    bTarja.disabled = !ligada;
  }
  trilha.addEventListener("load", aplicar);
  midia.addEventListener("seeked", mostrarFala);
  aplicar();
  const barra = el("div", { class: "leg-barra", role: "group", "aria-label": "Legenda do vídeo" }, [bLegenda, bTarja]);
  envolve.after(barra);
  return barra;
}
