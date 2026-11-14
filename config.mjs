// Lê e grava o arquivo .env do app (fica ao lado do server.mjs, fora do git).
// É aqui que as contas conectadas pela tela "Conectar Claude" ficam guardadas:
// o arquivo tem permissão só do dono e os valores nunca voltam para o navegador.

import { readFile, writeFile, rename, chmod } from "node:fs/promises";

export function criarConfig(caminho) {
  async function ler() {
    try { return (await readFile(caminho, "utf8")).split(/\r?\n/); } catch { return []; }
  }

  // Troca (ou remove, se valor for null) as chaves pedidas, preservando o resto do arquivo.
  async function gravar(mudancas) {
    const linhas = await ler();
    const pendentes = new Map(Object.entries(mudancas));
    const saida = [];
    for (const linha of linhas) {
      const m = /^\s*([A-Z0-9_]+)\s*=/.exec(linha);
      if (m && pendentes.has(m[1])) {
        const valor = pendentes.get(m[1]);
        pendentes.delete(m[1]);
        if (valor !== null && valor !== undefined) saida.push(`${m[1]}=${valor}`);
        continue;
      }
      saida.push(linha);
    }
    for (const [k, v] of pendentes) if (v !== null && v !== undefined) saida.push(`${k}=${v}`);
    while (saida.length && saida[saida.length - 1] === "") saida.pop();
    const tmp = caminho + ".tmp";
    await writeFile(tmp, saida.join("\n") + "\n", { mode: 0o600 });
    await rename(tmp, caminho);
    await chmod(caminho, 0o600).catch(() => {});
    for (const [k, v] of Object.entries(mudancas)) {
      if (v === null || v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }

  return { gravar };
}
