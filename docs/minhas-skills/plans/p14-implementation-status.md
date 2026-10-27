# P14 — Corpus e benchmark para a First AI

**Situação:** fundação experimental no GitHub, não um dataset supervisionado nem um modelo aprovado.

## O que já existe

- Catálogo autoral e sintético: 15 famílias distintas; 9 fixtures de treino, 3 de validação e **3 de holdout selado**, que não podem ser renderizados pelo CI exploratório.
- Inventário de 12 domínios já utilizados em experimentos anteriores. São diagnósticos conhecidos, nunca um conjunto cego.
- Renderizador de fixtures locais HTML/CSS sem dependências de rede, textos pessoais ou formulários preenchidos.
- Schema P14 que rejeita URLs, conteúdo pessoal, duplicações, contaminação entre splits e mudança silenciosa de famílias.
- Benchmark inicial em Chromium que executa somente treino e validação, medindo: número de superfícies planejadas, textos auditados, novas violações de contraste, correções de texto, rollback e índice de escurecimento por 96 pontos amostrados na viewport. Este índice não equivale à cobertura real de pixels nem substitui revisão visual.
- Comparações 7D x P11 x P13 ainda NÃO disponíveis nos mesmos cenários. O contrato marca os modelos ausentes como não medidos. O P13 roda isoladamente como linha de base exploratória.

## Limites e metas não cumpridas

| Métrica | Fundação atual | Meta de longo prazo |
|---|---:|---:|
| Famílias sintéticas autorais | 15 | Expandir cobertura |
| Fixtures de treino/validação | 12 | Aumentar diversidade |
| Holdout sintético selado | 3 | Preservar e expandir antes de treinamento |
| Páginas públicas verificadas para novo P14 | **0** | ≥120 |
| Domínios públicos novos verificados para novo P14 | **0** | ≥30 |
| Páginas públicas realmente cegas reservadas | **0** | ≥30 |
| Domínios públicos de holdout cego | **0** | ≥10 |
| Rótulos humanos de qualidade visual | **0** | Coletar em etapa posterior |

Não usar os dados sintéticos isoladamente como evidência de generalização ou aprovação do P16. Não coletar navegação de usuário nem inserir exemplos pessoais.

## Comandos de desenvolvimento

1. node scripts/p14-dataset-contract.js
2. node scripts/p14-benchmark-contract.js
3. node --test tests/p14-dataset-benchmark.test.js
4. node scripts/p14-benchmark-browser.js (somente com Chromium instalado)

O workflow model-ci valida contratos e testes. O browser-e2e executa a bancada em Chromium efêmero e guarda os dados em browser-results/. O workflow nunca executa o holdout selado.

## Próximos incrementos, nesta ordem

1. Ampliar famílias e variantes independentes com revisão de privacidade e da qualidade da rotulagem.
2. Definir lista de páginas públicas permitidas/estáveis e obter amostras válidas sem conteúdo textual; separar primeiro os domínios a reservar como holdout e não executar auditoria sobre eles durante o desenvolvimento.
3. Rodar 7D, P11 e P13 sobre a mesma página/mesma configuração, capturando separadamente indicadores de erro e custo. Não inferir comparabilidade entre runs heterogêneos.
4. Revisar screenshots e anotações de qualidade visual manualmente. Contraste automático é mínimo, não aprovação estética.
5. Somente depois iniciar a extração contextual P15 e treinar a nova rede P16.

**Privacidade e integridade:** nenhum dataset inclui URL de usuário, cookie, conteúdo de formulário, HTML da página ou elementos identificáveis da navegação. Publicar apenas métricas agregadas e fixtures criadas para teste. Os candidatos continuam fora do MV3 de produção, e a main não deve receber alterações até autorização posterior.
