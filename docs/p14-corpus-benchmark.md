# P14 — fundação do corpus e benchmark AI-first

**Status:** primeiro incremento experimental. O P14 completo **não terminou**; a avaliação de sites novos ainda está pendente.

## Arquivos

- `training/datasets/p14-baseline-v1.json`: 24 registros de CSS **autorais e sintéticos**, separados em 8 famílias não sobrepostas (`train`, `validation`, `diagnostic`). Cada registro tem apenas números, cores, metadados semânticos e decisão esperada **manual**. Não contém texto do site, URLs, dados de formulários, capturas privadas ou telemetria.
- `scripts/p14-common-benchmark.js`: contrato estrito de corpus, cálculo de métricas e relatório reproduzível sob `browser-results/p14-benchmark/report.json`. Compara comportamento do classificador **7D** (decisão de superfície), do P13 determinístico (cobertura de superfícies) e do P11 (sugestão de texto somente após uma superfície P13 convertida). São **papéis diferentes**; não criar ranking direto dos três.
- `tests/p14-corpus-benchmark.test.js`: bloqueia sobreposição de famílias, vetores duplicados, dados privados e tentativa de chamar dados previamente vistos de `blind holdout`.
- `.github/workflows/model-ci.yml`: gera candidato P11 somente em CI, executa o benchmark e arquiva relatório temporário por sete dias; não altera os pesos ou o manifesto distribuídos.

## Inventário de evidências anteriores

Os doze hosts listados no corpus como `known-not-blind` participaram de laboratórios antigos (P3/P9/P12/P13): example.com, Wikipedia, MDN, GitHub, Roblox, YouTube, Python Docs, W3C, GNU, RFC Editor, IANA e PostgreSQL. São **dados diagnósticos conhecidos**, nunca holdout final. Documentos existentes contêm mais de um caminho/URL por host; o agrupamento deve considerar domínio e família de layout na coleta externa.

## Como interpretar o relatório

- `model7D`: taxa de conversão e falsos positivos sintéticos do modelo atual, combinada com as proteções e mapeamento de fundo descritos no teste. **Não reproduz toda a aplicação de DOM de `content/content.js`**.
- `p13`: elegibilidade, por CSS sintético, à conversão determinística de superfícies claras. Não é execução do P13 no DOM.
- `p11`: número de sugestões de texto seguras versus fallback; P11 não decide se a região deve ser escurecida.
- `eligibleSyntheticAreaFraction`: fração da **área geométrica artificial** que o respectivo decisor aceitou. Não é cobertura real do viewport.
- `diagnosticTimingMs`: duração aproximada de uma passagem Node pelo corpus; não é p95 de CPU/UX em Chromium.
- `promotionEligible=false`, `readyForRelease=false`, `realWebsitesTested=0`, `blindFinalPagesTested=0` são condições invariantes desta etapa.

## P14 que ainda falta

1. Construir ferramenta de aquisição controlada e consentida de **páginas públicas**, com domínios curados e apropriadamente acessíveis, sem URLs pessoais ou dados privados. Verificar disponibilidade e licenças/termos.
2. Atingir a meta **proposta**, não contabilizada como entregue: pelo menos 120 páginas de 30 domínios, **além** de ao menos 30 páginas de 10 domínios exclusivamente finais. Selecionar, congelar e registrar esses domínios antes de visitar as páginas finais; bloquear duplicações de domínio/família e impedir que o conjunto final seja usado para escolher modelos.
3. Implementar avaliações **reais em Chromium** comparando versão MV3 atual, P11+fallback e P13 em perfis isolados e configurações equivalentes; para cada cenário medir texto, ícones, controles, cobertura clara, rollback e estados dinâmicos; registrar `inconclusive` sem transformar ausência de amostra em sucesso.
4. Capturar metadados de execução e métricas de memória/CPU com **p50/p95** e processo de comparação visual humana cega. Não capturar navegação do usuário. Testar SPA, Shadow DOM aberto, componentes com fundo próprio, iframe e estado nativo sem declarar suporte ao Shadow DOM fechado.
5. Antes de permitir treinamento P15/P16, obter rótulos visuais independentes e revisar o desenho das classes/contexto. Professor matemático sintético **não é** substituto de avaliação humana.

## Executar localmente após treinar candidato P11

```sh
node --test tests/p14-corpus-benchmark.test.js
node scripts/p11-generate-descendant-data.js
python3 -m training.train_p11_descendant --epochs 12
node scripts/p14-common-benchmark.js
```

Resultados dos comandos precisam ser verificados no CI; este documento não atesta execução. Nenhuma alteração na extensão instalada, na `main` ou no modelo publicado.
