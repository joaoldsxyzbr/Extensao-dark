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

## Incremento seguinte — candidatos públicos reservados (27/10/2026)

- Registro **somente de planejamento** em `training/datasets/p14-public-domain-candidates.json`: 30 domínios-raiz distintos, dos quais 15 atribuídos ao treino, 5 à validação e **10 reservados ao holdout**. São propostas não verificadas; a existência de um domínio no arquivo não comprova acessibilidade, estabilidade, licença, permissão de coleta ou cobertura visual.
- `scripts/p14-public-domains.js` valida hosts e domínios-raiz, impede mistura de subdomínios entre grupos, exclui sites diagnósticos conhecidos, rejeita URLs pessoais/caminhos/textos e congela a atribuição dos três splits. Os 10 domínios de avaliação não são expostos pela função de exploração.
- Não existe crawler nem coletor ativado: **0 requisições de rede, 0 permissões revisadas, 0 páginas públicas verificadas, 0 rótulos humanos e 0 testes cegos**. O registro não autoriza acessar o holdout, treinar, promover pesos ou publicar.
- Os testes JavaScript e Python verificam o contrato; o CI executa somente a validação offline. Antes de qualquer futura coleta, revisar acesso/termos/robots, diversidade além de páginas de documentação e privacidade, e definir páginas públicas específicas permitidas. A reserva de 30 domínios não satisfaz a meta de 120 páginas válidas.

## Diagnóstico de proposta 7D × P13 e correção de rollback (27/10/2026)

- O Chromium P14 usa as **mesmas amostras de CSS computado** das 12 fixtures exploratórias para registrar contagens de proposta P13 e votos do classificador distribuído 7D com limiar real 0,80. O vetor 7D usa ancestral **desconhecido, assumido claro**: é uma comparação de *decisões de componentes*, não dos dois motores completos.
- O 7D **não modifica o DOM** neste ensaio, e o P11 **não é avaliado** nos mesmos cenários. Por isso `matchedModelComparisonAvailable` permanece falso; tempos/p95 continuam referentes apenas ao planejamento P13. O relatório possui `proposalGateDiagnostic` separado de `records` e não atribui métricas de contraste, pintura ou desempenho ao 7D.
- A reversão P13 agora exige confirmação de CSS inline **e igualdade do CSS computado nos textos auditados e das 96 posições da grade da viewport** com a linha de base. Qualquer divergência interrompe o ensaio; isso não equivale a uma prova de restauração de todos os elementos da página.
- Testes nativos abrangem entrada inválida, ausência de P13, rejeição de previsão 7D não finita, payload privado, amostras alteradas e diferenças de CSS/restauração. Nada muda no MV3 ou nos pesos distribuídos.
- Próximo gate: comparar **pintura e reparo de texto de cada alternativa** com condições idênticas, e validar páginas públicas realmente permitidas antes de coletá-las; avaliação cega e revisão humana seguem ausentes.

## Ensaio pareado de pintura P13 × P13 filtrado pelo 7D (27/10/2026)

- As **mesmas 12 fixtures de treino/validação** agora são processadas em dois perfis Chromium independentes, com dimensões/configurações de bancada idênticas: (a) P13 determinístico; (b) P13 usando somente as superfícies que o modelo distribuído 7D aceitaria no vetor parcial (ancestral desconhecido assumido claro). **Ambos aplicam as cores e reparos de texto do P13**, portanto esta NÃO é a execução integral do motor 7D do MV3.
- Em ambos os perfis há auditoria de contraste dos textos amostrados, índice aproximado da grade de 96 pontos e rollback auditado. Os estilos originais, as amostras CSS e a grade anterior ao ensaio são usados para gerar uma impressão SHA-256 que deve coincidir entre os perfis.
- A consolidação `scripts/p14-pairing.js` rejeita duplicatas, splits divergentes e impressões CSS diferentes. Só calcula delta de cobertura quando **ambos** os testes retornam `safe-in-sample`, rollback confirmado e frações válidas; bloqueios/inconclusivos ficam como `null` sem contarem como sucesso.
- **Gate de controles protegidos (novo):** cada pintura sintética no Chromium mede CSS computado dos controles visíveis (botões, inputs, seleções e papéis acessíveis) sem ler valores, textos ou links. Alteração identificada marca o cenário `blocked`; amostragem ausente, truncada ou com quantidade instável impede `safe-in-sample`. O rollback também exige equivalência do CSS dos controles amostrados. `controlsChanged: 0` é obrigatório para aprovação dos cenários P14, mas não representa revisão visual integral, cobertura de controles invisíveis nem avaliação em sites públicos.
- O relatório `browser-results/p14-first-ai/p14-benchmark.json` contém `gatedLabAggregate` e `pairedSyntheticPaint` separados. Continua `matchedModelComparisonAvailable=false`, pois nem o runtime 7D completo nem o P11 foram executados em condições iguais, e a grade não mede área real de pixels.
- Testes em `tests/p14-matched-paint.test.js` verificam filtragem, ausência de mutação, rejeição de previsões inválidas, isolamento dos pares e a proibição de falsa equivalência. O conjunto cego de holdout sintético e os domínios públicos reservados não são acessados.
- Próximo gate: ampliar casos públicos com permissão e revisão de privacidade, validar a mesma instrumentação com o MV3 clássico e preparar uma avaliação P11 compatível. Não publicar nem promover pesos com base neste laboratório.

## Diagnóstico experimental P11 sobre CSS pareado do P13 (27/10/2026)

- O workflow de Chromium treina primeiro o candidato **P11 isolado do CI** e fornece explicitamente `--p11-candidate=data/p11-descendant-ci-candidate.json` à bancada P14. Sem essa opção, a bancada continua executável e marca P11 como não solicitado; não carrega pesos de produção nem promove modelos.
- Nas 12 fixtures exploratórias de treino/validação, depois da pintura P13 e **antes do reparo determinístico**, o laboratório passa os pares de CSS já medidos (`before` / `after`) ao P11 **somente para gerar sugestões**, sem aplicar sua saída ao DOM. Compara apenas propostas para textos cuja correção já foi exigida pelo P13; bloqueios/inconclusões e ausência de oportunidades são contabilizados separadamente.
- O P11 mantém sua barreira de contraste; sugestões inválidas não são contabilizadas como sucesso. O relatório `p11TextShadowDiagnostic` contém **somente contagens agregadas e códigos**, sem RGB de páginas, texto, URLs ou valores de formulários. Os cálculos originais de escurecimento, contraste, controles protegidos e rollback permanecem exclusivos do P13.
- **Contexto P11 observado (incremento seguinte):** `scripts/p14-p11-context.js` examina **somente os nós de texto já selecionados pelo P13**, antes da pintura. Captura `isLink` pela presença de ancestral `a[href]` ou `role="link"` (sem ler o endereço) e marca `explicitColor=true` somente se houver declaração `color` inline ou cor computada diferente da cor do ancestral imediato. Quando a cor é igual ao ancestral sem declaração inline, a origem CSS pode ser herança ou regra equivalente, portanto `explicitColor=null` e a comparação correspondente fica **inconclusiva**, nunca presumidamente correta. O tamanho de texto continua derivado de CSS computado. A captura não produz textos, URLs, atributos, seletores ou valores de formulários no relatório. O ensaio não constitui renderização P11, latência equiparável, comparação completa 7D/P11/P13 nem aprovação visual de sites reais.
- Ficam pendentes: coleta pública autorizada, avaliação cega humana e benchmark em condições completas 7D/P11/P13 no Chromium. **`matchedModelComparisonAvailable=false` e `promotionEligible=false` permanecem obrigatórios**; holdout selado não é aberto.

## Incremento — protocolo de revisão visual independente com gate offline (29/10/2026)

- `training/datasets/p14-public-manual-review.json` começa **sem observações**. Nenhum rótulo visual, página ou screenshot foi inventado.
- `scripts/p14-independent-reviews.js` valida declarações estruturadas de revisão humana apenas para os 20 domínios de **treino/validação** já congelados; o holdout de 10 domínios não pode ingressar nem ser contado na exploração. Não acessa a rede, captura, treina, avalia modelos ou lê conteúdo do navegador.
- Cada registro contém somente um ID de caso genérico, domínio público previamente listado, split, classe de cenário, viewport, estado de revisão, riscos de ilha branca/contraste/interação e declaração de anotação cega. URLs, texto de página, cookies, screenshots, campos extras, registros duplicados e resultados falsamente completos são rejeitados.
- `tests/p14-independent-reviews.test.js` cobre divisão de domínios, entradas inválidas, revisões inconclusivas, duplicações e dados privados. `model-ci.yml` executa o novo contrato, e `node --test` inclui as regressões.
- **A validação de esquema não verifica a veracidade humana de uma anotação.** Contagens do ledger são declarações, não provas de qualidade ou de acesso permitido. O relatório mantém `screenshotsIndependentlyVerified=false`, `matchedModelComparisonAvailable=false` e `promotionEligible=false`.
- Para avançar de fato, revisar acesso e permissão para páginas públicas específicas, registrar avaliação humana reproduzível e revisar capturas privadas apenas em artefatos efêmeros. Nenhum holdout pode ser explorado ou usado para calibrar. O pipeline precisa ser verificado no SHA final antes de considerar este incremento validado.

## Incremento — observar motor 7D real em Chromium isolado (29/10/2026)

- `scripts/p14-mv3-synthetic.js` carrega **a extensão MV3 7D distribuída de verdade** em perfil efêmero do Chrome, junto a um perfil sem extensão. Executa apenas seis fixtures autorais de treino, incluindo formulário, texto direto, cartões e tema escuro nativo; não abre websites externos e não acessa o holdout.
- O relatório `browser-results/p14-mv3-synthetic/report.json` registra apenas status agregados, contagens de amostragem de 96 posições do CSS computado e diferenças de CSS de controles protegidos; valores CSS brutos ficam na memória descartável. A coleta não lê texto, formulários, URLs de navegação nem conteúdo pessoal.
- `scripts/p14-mv3-assessment.js` impede contabilizar tema nativo preservado como conversão. Amostras ausentes/truncadas, motor inativo ou controles incomparáveis são inconclusivos; controles modificados exigem revisão e não são aprovados automaticamente. Testes Node em `tests/p14-mv3-assessment.test.js`.
- O workflow de Chromium passa a executar a observação separadamente do benchmark existente. **Não é comparação completa em condição igual de 7D × P11 × P13**, não mede latência de inferência, área real em pixels, acessibilidade completa nem qualidade estética. Nenhuma rede ou CSS experimental é promovido.
- Antes de concluir: conferir CI no SHA final, analisar as observações de risco e depois validar pages públicas e revisão humana independente com permissão. Os 10 domínios de holdout continuam selados; `promotionEligible=false` sempre.

### Evidência visual do diagnóstico MV3

O laboratório adicional agora grava **somente screenshots das seis páginas sintéticas autorais** em `browser-results/p14-mv3-synthetic/`: um `*-original.png` e um `*-legacy-mv3.png` por fixture. O artefato efêmero do workflow permite análise humana posterior sem expor páginas ou dados de usuários; não contém nenhum domínio de holdout.

A ausência do marcador `data-extensao-dark="on"` em página de tema nativo é registrada como `native-dark-inactive-observed`, e **não** como prova de fidelidade visual. Mesmo com screenshots disponíveis, revisão humana, métricas de contraste completo e comparação justa com P13/P11 permanecem pendentes. Confirmar o CI do commit mais novo.

## Diagnóstico direcionado — formulário MV3 (29/10/2026)

- Nos logs do workflow bem-sucedido [#40885863008](https://github.com/joaoldsxyzbr/Extensao-dark/actions/runs/40885863008), o ensaio MV3 marcou **form-toolbar = needs-review / protected-controls-css-difference**. Isso comprova diferenças CSS amostradas em controles, **não comprova perda de contraste ou defeito visual**. Os outros quatro cenários claros ficaram como `observed-only`, e o nativo escuro apenas apresentou motor inativo.
- Adicionado `scripts/p14-form-control-audit.js`: captura exclusivamente cores computadas de fundo, texto e borda dos dois controles **autorais** do formulário. Compara legibilidade de texto pelo contraste 4,5:1 entre original e MV3; valores brutos de CSS ficam somente em memória, sem conteúdo/valor de formulário, identificadores de usuário ou URLs. Registra apenas contagem de mudanças, menor contraste e status no relatório.
- Uma nova queda abaixo de 4,5:1 vira `contrast-regression` e `needs-review`. Opacidade desconhecida, dados ausentes ou contraste já ruim no original são `inconclusive`. Alterações intencionais de CSS com contraste legível permanecem **apenas observadas**, e não uma liberação da extensão.
- Incluídas regressões em `tests/p14-form-control-audit.test.js` e execução no Chromium existente. Foco/hover, estado selecionado, controles não visíveis, contraste de bordas e integridade funcional **ainda não foram medidos**. Esta inspeção não altera `content/content.js`, a `main`, o manifesto ou pesos.
- Validar ambos os workflows no **SHA final** para confirmar este incremento. Revisão humana das capturas, sites públicos permitidos e holdout externo continuam pendentes. Não usar esse teste de formulário como prova de segurança universal.

## Evidências do artefato e gate de preservação nativa (29/10/2026)

- Na execução real [#40886985155](https://github.com/joaoldsxyzbr/Extensao-dark/actions/runs/40886985155), os dois workflows do SHA `7020067c` foram aprovados. O artefato `browser-e2e-comparacao` contém os seis pares de screenshots e o relatório JSON P14.
- **Formulário**: `protectedControlsChanged=2`, refletindo mudanças de CSS dos controles. A auditoria automática encontrou contraste mínimo de texto **11,97:1 antes** e **12,81:1 depois** nos dois controles autorais, com `legible-in-sample`. Nenhuma perda de contraste de texto foi demonstrada nessa amostra; foco, hover, bordas e uso funcional ainda requerem revisão.
- **Página já escura**: as duas capturas PNG extraídas desse workflow apresentaram pixels idênticos no ensaio local. Isso sustenta apenas a preservação da viewport dessa fixture, não a preservação de qualquer site nativo em produção.
- Para não depender de inspeção casual, `p14-mv3-synthetic.js` agora calcula SHA-256 dos PNG originais e MV3 **somente na memória do navegador de laboratório**. `p14-mv3-assessment.js` aceita `native-dark-screenshot-identical-in-sample` apenas com hashes válidos e iguais, marca mudanças como `needs-review` e capturas ausentes como `inconclusive`. O relatório persiste só o resultado booleano, sem hashes, CSS, texto ou URL. A comparação de bytes é mais estrita que igualdade de pixels; diferenças por codificação devem ser revisadas e nunca aprovadas automaticamente.
- A alteração de hash está no SHA posterior ao workflow acima; seus testes e CI precisam ser comprovados separadamente. Não existe ainda avaliação independente de sites públicos, julgamento humano cego ou autorização de promoção de pesos. `promotionEligible=false` continua obrigatório.

## Pacote de revisão visual offline — 29/10/2026

- `scripts/p14-review-gallery.js` gera `browser-results/p14-mv3-synthetic/review.html` com as 12 capturas originais/7D de seis fixtures autorais, lado a lado, sem dependências, scripts, rede, conteúdo pessoal ou páginas de holdout. A página usa CSP restritiva e não equivale a julgamento independente.
- O laboratório só escreve a galeria após gerar **todos** os pares; capturas faltantes interrompem a geração, sem mascarar evidência ausente. `tests/p14-review-gallery.test.js` protege a lista fixa e a ausência de acesso remoto.
- O workflow de Chromium já arquiva `browser-results/`; o arquivo HTML poderá ser aberto localmente a partir do ZIP de artefatos GitHub Actions para facilitar inspeção humana.
- A auditoria do formulário anterior comprovou contraste mínimo de **11,97:1 original** e **12,81:1 com 7D** nesse ensaio. Isso não substitui testes de foco, hover, uso real, revisões humanas independentes ou avaliação de sites públicos.
- Próximo gate: comprovar CI do SHA mais recente, auditar as observações e iniciar corpus público com permissão, mantendo os domínios de holdout selados. Modelos, manifestos e `main` permanecem inalterados.

## Robustez do Chromium e indicador de foco do formulário (29/10/2026)

- Em um commit intermediário da P14, o navegador falhou com `ENOTEMPTY: directory not empty, rmdir .../Default` no [workflow #40934452699](https://github.com/joaoldsxyzbr/Extensao-dark/actions/runs/40934452699): o encerramento do Chrome ainda gravava o perfil temporário quando `fs.rmSync` foi chamado. Não era evidência de erro de pintura da extensão. O workflow do último SHA anterior `3d808f07` permanecia em andamento na verificação inicial deste incremento, e seu teste de qualidade passou.
- Corrigido `scripts/browser-e2e.js`: aguarda término do processo após `SIGTERM`, escala a `SIGKILL` após espera limitada, e remove o perfil com tentativas apenas para erros transitórios do sistema de arquivos. `tests/browser-profile-cleanup.test.js` cobre gravação tardia, encerramento forçado e processo já finalizado. O limite de espera não garante que todos os subprocessos de um navegador defeituoso terminem; falhas persistentes de limpeza continuam explícitas.
- `scripts/p14-form-focus-audit.js` examina `input` e `button` da fixture autoral em foco, sem ler valores de formulário ou texto. O resumo registra somente quantidade de controles, menor contraste da borda do foco contra a superfície adjacente e `visible-in-sample`, `needs-review` ou `inconclusive`. Considera 3:1 mínimo para o indicador e bloqueia piora visível do contraste. O ensaio faz `element.focus()`, portanto **não confirma navegação de teclado/Tab, foco-visível por modalidade ou interação real**.
- `scripts/p14-mv3-synthetic.js` produz esse diagnóstico separado de contraste de texto e CSS dos controles; `tests/p14-form-focus-audit.test.js` verifica riscos de contorno invisível, cor sem contraste, dados incompletos e impossibilidade de promover a extensão.
- **P14 ainda não tem páginas públicas inéditas revisadas nem avaliação cega**. O conjunto de holdout não foi executado e `promotionEligible=false`. A alteração não tocou manifesto, pesos, permissões ou `main`. Validar qualidade e Chromium no SHA final antes de declarar este incremento aprovado.
