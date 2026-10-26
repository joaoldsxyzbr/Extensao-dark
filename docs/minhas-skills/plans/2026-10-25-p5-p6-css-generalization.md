# P5 e P6 — Laboratório de generalização CSS (primeiro ciclo)

## Objetivo
Reduzir correções específicas por site treinando no futuro com padrões de CSS variados, e não listas de domínios. Este ciclo implementa **infraestrutura e geração de dados**, não a implantação de uma nova rede.

## P5 — contrato de características
- `content/colors.js`: `advancedStyleFeatures(computedStyle)` agrega 30 sinais de CSS calculado com 18 atributos P1/P2 existentes por `advancedContextFeatures`, total **48 dimensões**, com nomes ordenados e normalização para [0,1].
- Cobertura: display grid/flex/inline, posicionamento, opacidade, tipografia, bordas, outlines, sombras, filtros, blend modes, overflow, cursor, z-index, dimensões, proporção, gradientes, imagens CSS e color-scheme.
- Os primeiros 18 atributos e o modelo distribuído 7D não são alterados. O extrator é função pura: recebe somente objetos de computed style e cores; não busca texto, valores de formulários nem dados privados.
- Como `getComputedStyle` já resolve muitas custom properties em valores computados, evitamos gravar tokens CSS ou URLs.
- A intenção de 48 dimensões é um contrato inicial, **não tamanho final comprovadamente ótimo**. Serão necessárias ablações e medição de ganho por atributo antes do próximo treinamento.

## P6 — dataset inicial controlado
- `scripts/generate-css-lab.js` expande **2.520 bases sintéticas × 8 perfis** = **20.160 variações CSS sintéticas**.
- Sete perfis usam os splits por **família de componente** de P2: treino (10.584), validação (3.528), holdout (3.528). Um oitavo `css-stress-unseen` (2.520 linhas) fica reservado em separado para desafio de propriedades CSS. Ele **não** deve entrar no treino.
- Perfis mudam layout, bordas, fontes, sombras, scroll e visibilidade. As primeiras 18 dimensões continuam idênticas aos 2.520 exemplos-base.
- A rotulagem continua herdada das 30 famílias curadas no P2; **20.160 variações não significam 20.160 exemplos rotulados independentemente**. Não afirmamos generalização em sites reais com estes dados.
- `verifyDataset` rejeita split/família impróprios, duplicatas, rótulos contraditórios para vetores iguais, números inválidos e perfis de estresse vazados.
- O workflow de treinamento gera `training/css-advanced-features.json` e arquiva o arquivo por 7 dias como **artefato exploratório**, sem criar um candidato 48D nem modificar `data/neural-model.json`.
- A pasta de destino é ignorada pelo Git para evitar commits acidentais de dataset volumoso.

## Comandos para reprodução
```bash
node scripts/export-contextual-features.js
node scripts/generate-css-lab.js --output=training/css-advanced-features.json
node --test tests/p5-advanced-css.test.js tests/p6-css-corpus.test.js
node --test
```
(Estes comandos são instruções de execução; comprovação efetiva consta no GitHub Actions.)

## Critérios deste ciclo
- 48 atributos, prefixo imutável de 18 e vetores finitos.
- 20.160 variações determinísticas e quatro subconjuntos com contagens verificadas.
- CI e Chromium antigos verdes; modelo distribuído 7D e permissões intactos.
- Nenhum dado privado, dependência de terceiros, telemetria ou treinamento no navegador.

## O que ainda falta
1. **P6 — dados reais independentes**: criar protocolo de coleta *consentida ou de páginas públicas*, seleção com respeito a licenças/robots/termos, anonimização e rotulagem humana da **decisão por componente**. Definir conjuntos separados por **domínio e template**; não inserir holdout nas atualizações.
2. **P7**: experimentar diferentes arquiteturas Neural Core e funções de perda; avaliar sob o limiar real e contra modelo distribuído, com foco em falsos positivos, precisão, latência e memória. Um modelo multiclasse só se demonstrar benefício sobre regras atuais.
3. **P8**: benchmarks browser com sites **não vistos**, estados dinâmicos, pseudo-elementos, SVG, Shadow DOM e iframes, comparação por capturas revisadas manualmente.
4. **P9**: gate de promoção manual, PR separado e possibilidade de rollback. Corrigir regressões no holdout legado sem mascarar o resultado por thresholds ou exceções de site.

As amostras exploratórias não devem ser misturadas ao pipeline P2 de 18D por acidente.
