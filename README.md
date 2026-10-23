# Extensão Dark

Extensão leve para transformar páginas claras em uma experiência escura, usando **JavaScript puro, HTML, CSS e Manifest V3**. Sem frameworks, serviços, contas, anúncios ou telemetria.

## Instalação de desenvolvimento

1. Baixe o repositório (ou clone).
2. Abra `chrome://extensions` no Chrome, ou `edge://extensions` no Edge.
3. Ative **Modo do desenvolvedor**.
4. Escolha **Carregar sem compactação** e selecione a pasta que contém `manifest.json`.
5. Abra um site `https://` e clique no ícone **Extensão Dark** para alterar as preferências.

> Atualizações de arquivos no disco requerem clicar em **Atualizar** na página de extensões e recarregar o site aberto.

## Recursos da versão 0.1.0

- Ativação geral e ativação/desativação por domínio.
- Três tons de fundo: Suave, Profundo e Preto.
- Conversão heurística de fundos e textos, sem inverter fotos, vídeos e SVG.
- Preferências em `chrome.storage.local`. Nenhuma chamada a serviços externos.
- Observação de novos elementos adicionados ao DOM (compatibilidade inicial com páginas dinâmicas).

## Limitações

Este é **um motor inicial**, não um clone completo do algoritmo do Dark Reader. Gradientes CSS, sombras DOM, estilos complexos, páginas restritas do navegador e alguns iframes podem não funcionar perfeitamente. É recomendável testar antes de usar em sistemas críticos.

## Testes

```bash
node --test
```

Usa o executor de testes nativo do Node.js, sem instalar pacotes.

## Estrutura

- `content/colors.js`: utilitários de transformação de cores (testáveis).
- `content/content.js`: motor de adaptação e observação do DOM.
- `popup/`: interface local de controles.
- `tests/`: testes automatizados.
- `docs/`: arquitetura, limitações e plano de evolução.

## Privacidade

O navegador solicita acesso a sites HTTP(S) para poder modificar o visual automaticamente. A extensão não envia URL, texto ou dados de formulários para lugar nenhum. A lista de domínios desativados fica no armazenamento local do navegador.

Projeto independente; não afiliado ao Dark Reader.
