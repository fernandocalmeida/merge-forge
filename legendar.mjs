// Vídeo com a legenda em português GRAVADA na imagem (ffmpeg + libass).
// Roda em fila (um por vez), com porcentagem real lida do próprio ffmpeg (-progress).
// O resultado fica ao lado do vídeo: <base>.legendado.mp4 (a biblioteca não lista esse arquivo).
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rename, rm } from "node:fs/promises";
import { tmpdir, cpus } from "node:os";
import path from "node:path";
import { legendasSrt } from "./exportar.mjs";

// estilo: letra branca com contorno preto, embaixo, tamanho bom para celular e TV
const ESTILO = "FontName=Arial,FontSize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BackColour=&H64000000,BorderStyle=1,Outline=1.6,Shadow=0.6,MarginV=24,Bold=1";
// com tarja: faixa escura de ponta a ponta no rodapé (drawbox), cobrindo a legenda que o vídeo já traz
// gravada no idioma original, e a nossa legenda dentro dela. Uma caixa só atrás das letras não bastava:
// a legenda original às vezes fica um pouco mais acima (ex.: o vídeo do Big Bang).
const FAIXA = "drawbox=x=0:y=ih*0.74:w=iw:h=ih*0.26:color=black@0.93:t=fill";
// arquivo ao lado do vídeo legendado que diz com qual estilo ele foi gravado
export const fichaLegendado = (destino) => destino.replace(/\.mp4$/i, ".json");

export function criarLegendagem(cfg) {
  const jobs = new Map(); // nome -> { estado, pct, erro }
  const fila = [];
  let rodando = false;

  async function processar({ nome, video, transcricao, duracao, destino, tarja }) {
    const job = { estado: "gravando", pct: 0, erro: null, inicio: Date.now() };
    jobs.set(nome, job);
    // a legenda vai numa pasta temporária e o ffmpeg roda DENTRO dela: assim o filtro recebe só
    // "leg.srt" e não precisamos escapar caminhos do Windows (C:\...) na sintaxe do filtro
    const pasta = await mkdtemp(path.join(tmpdir(), "legendar-"));
    try {
      await writeFile(path.join(pasta, "leg.srt"), legendasSrt(transcricao));
      const temp = destino + ".parcial.mp4";
      await new Promise((ok, falha) => {
        const p = spawn(cfg.ffmpeg, [
          "-y", "-hide_banner", "-loglevel", "error", "-nostats", "-progress", "pipe:1",
          "-i", video,
          "-vf", `${tarja ? FAIXA + "," : ""}subtitles=leg.srt:charenc=UTF-8:force_style='${ESTILO}'`,
          "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p",
          // deixa folga no processador: o computador continua usável enquanto grava
          "-threads", String(Math.max(2, (cpus().length || 4) - 2)),
          "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart",
          temp,
        ], { cwd: pasta, windowsHide: true });
        let erro = "";
        let resto = "";
        // tempo máximo: 3x a duração do vídeo, no mínimo 30 minutos
        const limite = setTimeout(() => p.kill("SIGKILL"), Math.max(30 * 60, (duracao || 0) * 3) * 1000);
        p.stdout.on("data", (d) => {
          resto += d.toString();
          const linhas = resto.split("\n");
          resto = linhas.pop();
          for (const l of linhas) {
            const m = /^out_time_(?:us|ms)=(\d+)/.exec(l.trim());
            if (m && duracao) job.pct = Math.min(99, Math.round((Number(m[1]) / 1e6 / duracao) * 100));
          }
        });
        p.stderr.on("data", (d) => { erro += d.toString(); });
        p.on("error", (e) => { clearTimeout(limite); falha(new Error(e.code === "ENOENT" ? "o ffmpeg não está instalado" : e.message)); });
        p.on("close", (code, sinal) => {
          clearTimeout(limite);
          if (code === 0) ok();
          else falha(new Error(sinal ? "a gravação da legenda demorou demais" : "o ffmpeg falhou: " + erro.trim().split("\n").slice(-2).join(" ").slice(0, 300)));
        });
      });
      await rename(temp, destino);
      await writeFile(fichaLegendado(destino), JSON.stringify({ tarja: !!tarja, data: new Date().toISOString() })).catch(() => {});
      jobs.delete(nome);
    } catch (e) {
      console.error("legendar falhou:", nome, e.message);
      await rm(destino + ".parcial.mp4", { force: true }).catch(() => {});
      jobs.set(nome, { estado: "erro", pct: null, erro: String(e.message || e).slice(0, 300) });
    } finally {
      await rm(pasta, { recursive: true, force: true }).catch(() => {});
    }
  }

  async function bombear() {
    if (rodando) return;
    rodando = true;
    while (fila.length) await processar(fila.shift());
    rodando = false;
  }

  return {
    estado: (nome) => jobs.get(nome) || null,
    emAndamento: (nome) => { const j = jobs.get(nome); return !!j && j.estado !== "erro"; },
    iniciar(job) {
      const j = jobs.get(job.nome);
      if (j && j.estado !== "erro") return;
      jobs.set(job.nome, { estado: "na-fila", pct: 0, erro: null, inicio: Date.now() });
      fila.push(job);
      bombear();
    },
  };
}
