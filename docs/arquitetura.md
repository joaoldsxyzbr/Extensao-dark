# Extensão Dark — desenho inicial

**Objetivo.** Criar uma extensão de navegador independente para deixar páginas claras mais confortáveis sem aplicar uma inversão global de imagens e vídeos.

**Plataforma.** Chrome/Edge (Chromium) com Manifest V3. JavaScript, HTML e CSS nativos, sem frameworks, build, servidores, bibliotecas externas ou telemetria.

## Abordagens consideradas

1. **Filtro de inversão do documento.** É simples, mas inverte mídia e partes já escuras, então não será o modo padrão.
2. **Folha estática de estilos.** Leve, mas tende a destruir a identidade visual e legibilidade de sites complexos.
3. **Análise dinâmica local das cores computadas.** Recomendada para a primeira versão. Converte fundos claros e textos escuros com heurísticas conservadoras, mantendo fotos, vídeos, canvas e SVG intocados. Não equivale ao motor completo do Dark Reader.

## Escopo da V1

- Ligar/desligar para todos os sites e para o domínio atual.
- Escolher fundo Suave, Profundo ou Preto.
- Salvar preferências apenas em `chrome.storage.local` e refletir mudanças nas páginas abertas.
- Transformação de cores no navegador, sem tráfego de dados; reversão ao desligar.
- Popup em português brasileiro, acessível e sem dependências.
- Testes automatizados de transformação de cores e regras de ativação, usando `node:test` nativo.

## Limites conhecidos

- Chrome/Edge inicialmente, com testes reais necessários antes de declarar compatibilidade universal.
- Páginas internas do navegador e Chrome Web Store não permitem injeção.
- Fundos em imagens, CSS gradients, Shadow DOM fechado, estilos muito dinâmicos e alguns iframes podem exigir exceções ou ajustes futuros.
- A primeira versão não reescreve folhas de estilo CSSOM nem cobre todas as regras especiais e correções do Dark Reader.

## Privacidade e segurança

A permissão de acesso a páginas `http(s)` é necessária para ajustar sites automaticamente. A extensão não faz chamadas à rede, não lê formulários para armazenamento, não envia dados e não coleta navegação. Guarda apenas as preferências e domínios desativados pelo usuário.

## Adição 0.2.0: rede neural experimental

A classificação neural pequena e offline decide somente se fundos opacos de luminosidade intermediária com texto escuro podem ser tratados como superfícies claras. Entrada: luminância do fundo, luminância do texto e opacidade (normalizadas 0–1); saída: probabilidade. Modelo 3–8–1 treinado com dados sintéticos gerados por `scripts/train-neural.js`, reprodutível e sem telemetria.

A rede não é autorizada a reverter uma página já escura, mexer em imagens/gradientes, alterar páginas restritas ou dispensar verificações de contraste. Há cache limitado por combinações de cores. `smartEnabled` é armazenado apenas no navegador, habilitado por padrão, desligável no popup. A avaliação do modelo em dados sintéticos não prova compatibilidade em sites reais; precisa de testes práticos e amostras diversas antes de ampliar a autonomia.
