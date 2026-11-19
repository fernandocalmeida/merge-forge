# Merge Forge

**Transforme vídeos em material de estudo com IA.** Cole um link ou envie um arquivo, e o Merge Forge gera resumo, mapa mental, organograma, linha do tempo, perguntas de revisão, transcrição, um infográfico ilustrado e uma apostila em PDF com cara de curso.

Criado pela **[Merge IA](https://mergeia.com.br)**, engenharia de IA, automação e integrações.

---

## O que ele faz

- **Capta o vídeo:** por link (YouTube, Instagram, TikTok, Facebook, X e outros sites suportados pelo yt-dlp) ou enviando o arquivo do computador (até 2 GB), com porcentagem real do andamento.
- **Lê o que foi falado:** usa as legendas do vídeo ou transcreve o áudio com a Groq (Whisper).
- **Gera o estudo com IA (Claude), de uma vez:**
  - Resumo com a ideia central e os pontos-chave
  - Mapa mental interativo
  - Organograma do conteúdo
  - Linha do tempo com atalhos para o minuto do vídeo
  - Perguntas de revisão
  - Transcrição com busca
- **Infográfico ilustrado:** um pôster completo desenhado pelo gerador de imagens do ChatGPT (via Codex na sua conta).
- **Apostila de estudo em PDF:** capa, sumário clicável, aulas com cenas do próprio vídeo, diagramas, exercícios com gabarito e links que abrem o vídeo no minuto certo. Sem custo extra de IA.
- **Baixar tudo:** cada material em arquivo aberto (PDF, Markdown, CSV para o Anki, SRT, TXT, PNG) ou tudo num ZIP.
- **Roda no seu computador (Windows):** com atalho na área de trabalho, visual escuro premium e seus vídeos guardados só na sua máquina. Não há versão para celular: baixar vídeos e rodar a IA exigem um computador.

## Como funciona o custo

**Cada pessoa usa as próprias contas.** O Merge Forge não inclui chaves, créditos nem servidores da Merge IA.

| Serviço | Para que serve | Como conectar |
|---|---|---|
| **Claude** (assinatura) | Gerar o estudo e o roteiro do infográfico | Login do Claude Code pela tela "Conectar IA" |
| **Groq** (grátis) | Transcrever vídeos sem legenda | Chave grátis em console.groq.com/keys |
| **ChatGPT** (assinatura, opcional) | Desenhar o infográfico | Login do Codex por código, pela tela "Conectar IA" |

Alternativas pagas por uso: chave da API da Anthropic e chave da API da OpenAI.

## Requisitos

- **Node.js 20 ou mais novo**
- **yt-dlp**, **Deno** (o YouTube exige para liberar os vídeos) e **ffmpeg**
- **Claude Code** (`npm install -g @anthropic-ai/claude-code`) logado na sua conta Claude
- **Google Chrome** (para gerar a apostila em PDF)
- Opcional: **Codex** (`npm install -g @openai/codex`) para o infográfico

No Windows, o instalador confere e instala tudo isso sozinho.

## Instalação

### Windows (recomendado)

1. Baixe o **MergeForgeSetup.exe** na página [Releases](../../releases/latest) deste repositório.
2. Clique duas vezes nele, aceite o termo de uso e clique em **Instalar**. Não precisa abrir terminal.

   O instalador baixa sozinho o que faltar (Node, yt-dlp, Deno, ffmpeg, Google Chrome, Claude Code e Codex). Tenha internet ligada; se o Windows perguntar se permite instalar alguma dessas ferramentas, clique em **Sim**. No fim ele cria o atalho **Merge Forge** na área de trabalho e no menu Iniciar, coloca o app no início do Windows e abre no navegador em `http://localhost:8798`.

   Na primeira vez o Windows pode mostrar "O Windows protegeu o computador": clique em **Mais informações → Executar assim mesmo**.
3. No app, aceite o termo de uso e siga o assistente **Conectar IA** para conectar as suas contas.

Para desinstalar: **Configurações → Aplicativos → Merge Forge → Desinstalar**. Ele pergunta se apaga também os vídeos e as configurações (o padrão é manter).

Prefere rodar pelo terminal? Na pasta do projeto: `powershell -ExecutionPolicy Bypass -File .instalar-windows.ps1` (opções `-SemInicializacao` e `-Porta 8799`).

### Manual (qualquer sistema)

```bash
git clone https://github.com/fernandocalmeida/merge-forge.git
cd merge-forge
npm install
cp .env.example .env
npm start
```

Abra `http://localhost:8798`. Para usar no celular pela rede, defina uma `SENHA` no `.env` e `HOST=0.0.0.0`.

## Estrutura do projeto

```text
merge-forge/
├── server.mjs              # Servidor: rotas, senha, downloads, biblioteca, envio de arquivos
├── ia.mjs                  # Transcrição, estudo com Claude, infográfico (Claude + Codex)
├── apostila.mjs            # Apostila de estudo em PDF (Chrome sem janela)
├── exportar.mjs            # Arquivos exportados e ZIP em streaming
├── config.mjs              # Leitura e gravação segura do .env
├── public/                 # Interface (HTML, CSS e JavaScript, sem etapa de build) e app do celular
├── abrir.vbs               # O que o atalho "Merge Forge" executa (liga o app e abre no navegador)
├── instalar-windows.ps1    # Instalador para Windows (o MergeForgeSetup.exe roda este script escondido)
├── desinstalar-windows.ps1 # Desinstalador
├── .env.example            # Modelo de configuração (sem chaves)
└── LICENSE                 # PolyForm Noncommercial 1.0.0
```

## Uso responsável

O Merge Forge é uma ferramenta de **estudo**. No primeiro acesso, o app pede o aceite do **[Termo de uso](TERMOS-DE-USO.md)**. Use com conteúdo próprio, gravações de aula ou conteúdo que você tenha direito de usar. Baixar conteúdo de terceiros pode violar os termos de uso das plataformas e direitos autorais: **a responsabilidade pelo uso é de quem usa.** O download depende de ferramentas de terceiros (yt-dlp) e pode parar de funcionar quando as plataformas mudam; não há garantia de funcionamento.

## Como contribuir

Melhorias são bem-vindas, mas nada entra direto: você trabalha na sua cópia (fork) e envia um **Pull Request**, que só é incluído depois de revisado e aprovado pela Merge IA. Antes de começar, leia o **[guia de contribuição](CONTRIBUTING.md)**: ele explica o passo a passo, o que é aceito e como relatar falhas de segurança em particular.

## Licença

Este projeto é licenciado sob a **[PolyForm Noncommercial License 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0/)**. Veja o arquivo `LICENSE`.

**Você pode:** usar, estudar, modificar e compartilhar para uso pessoal, estudo, pesquisa, ensino e em organizações sem fins lucrativos.

**Você não pode:** vender, revender, sublicenciar, oferecer como serviço pago ou usar este software (ou versões modificadas) para fins comerciais.

**Créditos obrigatórios:** qualquer cópia ou versão modificada deve manter o aviso:

> Required Notice: Copyright © 2026 Merge IA (https://mergeia.com.br)

**Uso comercial:** fale com a Merge IA em [mergeia.com.br](https://mergeia.com.br) para uma licença comercial.

## Marca

Os nomes **Merge Forge** e **Merge IA**, e os respectivos logotipos, são marcas da Merge IA e **não estão incluídos na licença do software**. Versões modificadas não podem usar esses nomes ou logotipos de forma que sugira serem produtos oficiais da Merge IA.

## Créditos de terceiros

O Merge Forge usa, sem incluir no repositório, estas ferramentas e bibliotecas, cada uma com a sua licença:

| Projeto | Licença |
|---|---|
| [yt-dlp](https://github.com/yt-dlp/yt-dlp) | Unlicense |
| [FFmpeg](https://ffmpeg.org) | LGPL / GPL |
| [Markmap](https://markmap.js.org) | MIT |
| [Phosphor Icons](https://phosphoricons.com) | MIT |
| [html-to-image](https://github.com/bubkoo/html-to-image) | MIT |
| [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) | MIT |
| [Geist](https://vercel.com/font) | SIL Open Font License |
| [Anthropic SDK](https://github.com/anthropics/anthropic-sdk-typescript) | MIT |

---

**Quer uma solução de IA assim na sua empresa?** Conheça a Merge IA em **[mergeia.com.br](https://mergeia.com.br)**.
