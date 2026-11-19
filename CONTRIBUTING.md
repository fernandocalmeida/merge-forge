# Como contribuir com o Merge Forge

Obrigado por querer melhorar o Merge Forge. Este guia explica como sugerir mudanças e o que acontece com elas.

## Como funciona

- Ninguém altera este repositório diretamente. Toda mudança chega como **Pull Request (PR)** e só entra depois de revisada e aprovada pelo mantenedor da Merge IA.
- Você trabalha na sua própria cópia (o **fork**). O que você muda lá não afeta este repositório até virar um PR aprovado.
- Nem toda sugestão é aceita. O mantenedor pode pedir ajustes, aproveitar só uma parte ou recusar, sempre explicando o motivo.

## Antes de começar

- **Correções pequenas** (erro de texto, bug simples): pode abrir o PR direto.
- **Mudanças maiores** (recurso novo, mudança de tela, nova dependência): abra antes uma **Issue** descrevendo a ideia. Assim combinamos o caminho e ninguém perde trabalho.
- **Falha de segurança**: não abra Issue pública. Use a aba **Security → Report a vulnerability** deste repositório, que manda o relato só para o mantenedor.

## Passo a passo

1. Faça um **fork** deste repositório e clone a sua cópia.
2. Crie um ramo com um nome que diga o que você vai fazer, por exemplo `corrige-legenda-tiktok`.
3. Instale e rode o app (veja **Instalação** no README). Para testar a tela sem gastar IA, use `IA_PROVEDOR=demo` no arquivo `.env`.
4. Faça a mudança, focada em **um assunto por PR**.
5. Teste o que você mudou e também o que já funcionava perto dali. Se mexeu em estudo, tradução ou IA, gere um estudo de um vídeo em português e um de outro idioma.
6. Abra o PR explicando **o que** mudou, **por que** e **como testou**. O modelo do PR já traz essas perguntas.

## O que é bem-vindo

- Correção de bugs e de textos.
- Melhorias de acessibilidade, desempenho e compatibilidade (Windows, macOS, Linux, celular).
- Melhorias na tradução, na transcrição e no material de estudo.
- Documentação mais clara.

## O que não é aceito

- Qualquer coisa que contorne proteções das plataformas: DRM, conteúdo pago ou privado, login de terceiros, limites de acesso.
- Download em massa (playlists, canais, perfis inteiros) ou automação que viole os termos das redes sociais.
- Remover ou esconder o aviso de direitos (Required Notice), o termo de uso ou os créditos.
- Recursos para uso comercial do app (a licença não permite).
- Chaves, senhas, tokens ou arquivos `.env` no código. Nunca envie segredos no PR.
- Uso dos nomes e logotipos **Merge Forge** e **Merge IA** em versões modificadas, como se fossem oficiais.

## Licença das contribuições

Ao enviar um PR, você declara que a contribuição é de sua autoria (ou que tem o direito de enviá-la) e concorda que ela seja distribuída sob a mesma licença deste projeto, a **PolyForm Noncommercial 1.0.0**, mantendo o aviso de direitos da Merge IA. Você também autoriza a Merge IA a usar, modificar e distribuir a sua contribuição como parte do Merge Forge e de seus outros produtos.

## Código de conduta

Seja respeitoso nas Issues, nos PRs e nos comentários. Críticas ao código são bem-vindas; ataques a pessoas, não.

---

Dúvidas sobre o projeto ou interesse em uso comercial: [mergeia.com.br](https://mergeia.com.br).
