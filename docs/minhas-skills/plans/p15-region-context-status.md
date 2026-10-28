# P15 — Extração regional contextual (primeiro incremento isolado)

**Estado:** somente instrumentação e regressões experimentais, sem integração à extensão instalada ou mudança da `main`. Branch `feat/p15-region-context` baseada na P14 (`feat/p14-dataset-benchmark`); PR empilhada. A P14 ainda não cumpriu seus gates de corpus público e benchmark comparável; este incremento P15 não substitui esses requisitos.

## Implementado neste incremento

- `content/region-graph.js`: `captureRegionGraph()` extrai, a partir do Chromium descartável, **até 80 regiões e 1600 candidatos examinados** por captura (sem conteúdo textual). Aceita regiões visíveis em viewport, calcula aproximações normalizadas de geometria, luminância CSS própria e efetiva em transparências simples, classe visual do bloco e índice efêmero do pai. As amostras em si permanecem em memória do navegador/laboratório.
- `content/region-features.js`: `buildRegionFeatures()` valida rigorosamente esquema e limites, produz contagens de **filhos, irmãos, filhos/irmãos claros, ancestral claro e presença estrutural de texto direto** (sem ler nós de texto), além de flags de foco, descendentes protegidos e tema escuro declarado. Saída de `complex` ou `transparent`, foco, proteção ou tema escuro é **incerta**; nenhuma classificação significa permissão de pintar.
- Integração **somente diagnóstica** na bancada de 12 fixtures exploratórias P14: `p15RegionContext` contém apenas códigos, contagens e IDs autorais das fixtures. Dados completos de CSS, DOM, URL e valores de formulário não são persistidos no relatório. O fingerprint e os cenários comparativos P13 não são alterados pelo extrator. A contagem de regiões claras embutidas só considera filho claro com pai não claro e não incerto; ela não equivale a área em pixels nem comprova que toda a ilha branca foi identificada.
- `tests/region-context.test.js`: contratos de privacidade e geometria, parentesco/irmãos, inclusão de texto direto sem conteúdo, transparências simples, gradientes, DOM reparented, entradas inválidas e recusa a medições parciais acima do limite.

## Limites explícitos / trabalho pendente

- É uma **amostra de retângulos e CSS computado**, não cobertura em pixels e não um mapa completo de stacking/oclusões. Presença de nó de texto direto inclui nós com espaços e não comprova texto visível.
- A composição só reconhece cor RGB opaca ou transparência zero com ancestral opaco simples. **Gradientes, máscaras, filtros, misturas, opacidade parcial e cores complexas** são inconclusivos. `color-scheme: dark` marca incerteza, não promoção.
- Agora percorre Shadow DOM aberto e faz observação **conservadora** de iframes acessíveis com limites, mas não autoriza ilhas de iframe para pintura; frames inacessíveis e raízes fechadas permanecem limites explícitos. Detecta presença de pseudo-elementos gerados, sem estimar sua área de pintura; não captura hover nem aplica mudanças. Não cobre roots fechadas, CSSOM complexo ou todos os padrões de layout. A lista de região é finita, logo cortes retornam inconclusivo sem aproveitar amostras parciais.
- Nenhuma nova permissão, dependência, telemetria, leitura de texto de usuário, histórico, navegação ou treino em sites reais. O holdout sintético e domínios públicos reservados da P14 continuam intocados.
- **`promotionEligible=false` e `applied=false`**. Este incremento não resolve as áreas brancas da extensão publicada, nem valida qualidade visual humana.

## Próxima sequência

1. Completar a captura de pais e filhos com composição CSS verificável, proteção contra oclusões/pseudo-elementos, Shadow DOM aberto e mudanças de layout; preservar limites e abstenção.
2. Acrescentar regressões de controles selecionados e estados de foco, cargas DOM e medição de latência no Chromium, sem abrir holdout.
3. Retomar a comparação P14 em páginas públicas autorizadas e pareadas. Só depois treinar a P16, mantendo os pesos separados da distribuição.

**Validação aplicável:** `node --test tests/region-context.test.js`, `node --test`, `node scripts/p14-benchmark-browser.js --p11-candidate=data/p11-descendant-ci-candidate.json` no GitHub Actions após treino P11. O teste de navegador pode levar mais tempo que o teste unitário e deve ser confirmado no commit final.

## Incremento P15 — pseudo-elementos e controles selecionados (28/10/2026)

- A extração agora consulta **somente a presença** de `::before` / `::after` com `content` gerado. Caso presentes, a região recebe `hasPseudoPaint=true` e **`uncertain=true`**, mesmo que sua cor de fundo computada seja clara. O valor de `content` não é retornado ou persistido; um estilo de pseudo-elemento não mensurável invalida a amostragem. Não se afirma detectar toda a área de sobreposições CSS.
- A barreira para descendentes protegidos inclui estados `aria-pressed`, `aria-checked`, `role=checkbox`, `role=switch`, `:checked` e `:focus-visible`, além das proteções existentes. Eles só sinalizam incerteza na análise, **sem recolorir controles**.
- Regressões adicionais em `tests/region-context.test.js` cobrem geração de pseudo-elementos, estado interativo e falta de metadados. O registro continua limitado a CSS/geométricos, sem texto, URLs, formulário nem permissões novas; relatórios P14 mostram apenas contagens.
- O campo `confirmedLightIsland` só marca uma região como ilha clara observável quando seu CSS é opaco/seguro e seu pai imediato é não claro e também confiável. A métrica do Chromium usa esse campo e **não** conta regiões claras com pseudo-elemento, controles protegidos ou estados incertos. A contagem permanece estrutural/amostral, nunca área real de pixels.
- Pendente: raízes fechadas, frames acessíveis, pseudo-elementos com pintura independente de `content` gerado, stacking/oclusões e cobertura real das áreas brancas. Shadow DOM aberto foi adicionado no incremento seguinte. Nenhum modelo treinado/promovido e nenhuma integração ao MV3.

## Incremento: Shadow DOM aberto (28/10/2026)

A captura P15 agora atravessa raízes Shadow DOM abertas, inclusive quando o host não é região visual. Conserva limites de 24 escopos, 8 níveis, 1600 candidatos, 8000 elementos examinados e 80 regiões. A hierarquia usa o host como elo, inclusive para fundos herdados e proteção de controles. Excesso retorna inconclusivo sem linhas parciais.

O teste Node cobre raízes aninhadas, hosts não-regionais, ancestrais protegidos, privacidade e limites. Um teste independente e autoral no Chromium verifica a superfície clara dentro de shadow root e o bloqueio de controle protegido; não utiliza o conjunto reservado da P14.

A limpeza do perfil temporário de Chromium recebeu retries nativos após falha ENOTEMPTY observada no CI. Continuam pendentes raízes fechadas, iframes, sobreposições, CSS complexo e validação visual. Nenhuma mudança na extensão instalada, manifesto ou pesos.

## Incremento P15 — iframe acessível somente como diagnóstico (28/10/2026)

- A descoberta contextual agora encontra elementos `iframe` sem consultar `src`, `href`, `location` nem qualquer URL. Em `contentDocument` acessível no mesmo contexto de segurança, inspeciona apenas regiões CSS/geométricas do subdocumento, com composição de ancestral até o elemento iframe do documento hospedeiro.
- O contrato adiciona `inFrame:boolean`; **toda região em iframe permanece `uncertain=true`, mesmo com cor de fundo opaca**, logo `confirmedLightIsland=false`. Métricas geométricas internas são frações do viewport do próprio iframe; não podem ser somadas a pixels da janela principal.
- Um iframe inacessível, opaco ou com DOM indisponível torna a captura da página `inconclusive` **sem retornar linhas parciais**. Limites: até **8 documentos iframe**, até 24 escopos totais, 8 níveis de profundidade, 80 regiões, 1600 candidatos e 8000 nós de descoberta. Raízes Shadow DOM abertas dentro de frames seguem o mesmo limite.
- Os testes Node cobrem iframe acessível e bloqueado, dados inválidos, herança do pai e abstenção. A bancada Chromium autoral foi ampliada com um iframe `srcdoc` local, sem rede e sem abrir o holdout P14, para validar que não vira ilha segura.
- Continua sendo instrumentação de bancada: **não altera a extensão MV3, cores ou pesos neurais**, e não comprova cobertura visual, estabilidade de todos os iframes ou integração à First AI. Continuam pendentes oclusões, frames inacessíveis, raízes fechadas e composição CSS avançada.

## Incremento P15 — risco de oclusão e CSS ancestral (28/10/2026)

- `content/region-graph.js` identifica **somente riscos visuais**: `hasOcclusionRisk` por transformações, clipping, posicionamento fixo/sticky/absoluto, isolamento ou até **três hit-tests** com `elementFromPoint` na região. Um hit fora da hierarquia composta do elemento impede a confirmação; um descendente visível não é confundido com oclusão externa. As sondagens são diagnósticas, não segmentação de pixels ou garantia completa de visibilidade.
- `hasComplexAncestorPaint` detecta efeitos CSS computados complexos em até 12 ancestrais compostos (por exemplo, gradientes, filtros, blend ou opacidade). Uma cadeia além do limite também é incerta. As duas flags são booleanas e sem dados de página, URLs, seletores ou valores de CSS persistidos.
- `content/region-features.js` valida essas flags e marca regiões de risco como `uncertain=true`, proibindo `confirmedLightIsland=true`. Não aplica cor nem faz inferência neural.
- Regressões Node testam overlay entre irmãos, hit em descendente legítimo, transformação e gradiente ancestral, limites e privacidade. O smoke Chromium autoral foi ampliado para testar sobreposição real e gradiente em uma página sintética isolada, **sem usar o holdout P14**.
- Limites: três amostras não capturam toda oclusão, stacking, pseudo-elementos com pintura independente, animações, clip-path complexo ou CSS composto. O diagnóstico **não mede a área real branca**. A extensão MV3, os pesos publicados e a `main` permanecem intocados.

## Incremento P15 — estabilidade de CSS e DOM em duas capturas (28/10/2026)

- `scripts/p15-dynamic-stability.js` compara dois grafos estritos P15 coletados independentemente. Qualquer alteração em cor computada, geometria, hierarquia, foco, controles, oclusão, estado de iframe ou quantidade de regiões invalida a comparabilidade. Alteração de cobertura de descoberta, amostragem parcial ou esquema incorreto também **não é aprovada**.
- A saída inclui apenas estado, motivo genérico e contagens numéricas; nenhuma região, string CSS, texto, URL, seletor ou dado de formulário é exportado. `stable-in-sample` significa **somente identidade de dois instantâneos limitados**, não desempenho, resistência a interações, garantia visual nem autorização para pintar. `applied=false`, `trained=false` e `promotionEligible=false`.
- A bancada P14 agora faz duas capturas P15 com intervalo nominal de 60 ms **antes de qualquer pintura**, registra `p15RegionContext.stabilityDiagnostic` em separado e não altera os critérios de P13 ou 7D/P11. Mantém as 12 fixtures exploratórias treino/validação; holdout segue selado.
- `tests/p15-dynamic-stability.test.js` verifica CSS, geometria, controles, mudanças estruturais, privacidade e falhas de esquema. O smoke em Chromium descartável também modifica `background-color` e insere um bloco autoral no DOM entre capturas para comprovar abstenção diante de mudanças reais.
- Pendem avaliação temporal em diversas etapas de interação, animações/transições, resize e medição de custo total. O verificador em duas capturas não substitui o benchmark P14 completo ou julgamento visual humano, nem integra o motor da extensão.

## Incremento P15 — animações, foco e redimensionamento (28/10/2026)

- `content/region-graph.js` agora sinaliza `hasMotionRisk` para animações CSS com duração efetiva, transições com duração não zero e animações Web Animations em andamento, analisando também ancestrais compostos até o limite. Duração `0s` e `0ms` não é movimento. Dados de animação, nomes, CSS e texto não são armazenados: o grafo guarda somente um booleano.
- `content/region-features.js` valida estritamente o novo booleano e exige `uncertain=true` quando presente; nenhuma região com animação/transição observada é classificada como ilha clara confirmada.
- `scripts/p15-dynamic-stability.js` aceita metadados numéricos opcionais do viewport antes/depois, com esquema limitado a largura/altura inteiras de 1–8192. Mesmo que proporções CSS permaneçam iguais, dimensões alteradas retornam `inconclusive / viewport-changed`. Entrada inválida é recusada, sem valores de viewport no relatório.
- A bancada P14 observa dimensões do viewport em duas capturas P15 separadas por ~60 ms, antes de pintar. Mantém o holdout selado e não altera P13, 7D ou candidatos P11.
- Testes Node verificam duração zero (regressão), animações/transições em ancestrais, risco de foco, redimensionamento e privacidade. A bancada Chromium independente usa keyframes, foco real e `Emulation.setDeviceMetricsOverride` em perfil descartável, para invalidar a estabilidade. O novo método de resize só existe no utilitário de teste CDP.
- Mesmo quando os dois instantâneos são numericamente idênticos, a presença de `hasMotionRisk=true` faz a comparação retornar `inconclusive / motion-risk-present`: não se assume estabilidade durante uma animação só porque os pontos amostrados coincidiram.
- **Limites:** não promete identificar todas as transições ou animações disparadas após a captura, media queries com estilos equivalentes, mudanças ocultas entre dois pontos, pixels reais ou desempenho universal. `stable-in-sample` continua sem valor de autorização de pintura. Nenhuma mudança no manifesto, CSS de produção, pesos neurais ou `main`; P14/P15 e avaliação humana seguem pendentes.

## Incremento P15 — custo de captura e agregação (28/10/2026)

- `scripts/p15-performance-contract.js` recebe somente durações numéricas agregáveis dos **12 cenários sintéticos exploratórios**, entre 0 e 120000 ms por medida, e rejeita esquema inesperado, dados privados ou medições parciais. Calcula p50 (percentil 50 de posto mais próximo), p95 e máximo de captura 1, captura 2, comparação Node e tempo total de parede/CDP; as saídas são arredondadas a três casas decimais. Registra também contagens medidas/incompletas, sem inferir tempos inexistentes.
- A bancada `scripts/p14-benchmark-browser.js` cronometra cada captura dentro do próprio Chromium via `performance.now()`; cronometra a comparação no Node e o tempo total incluindo as chamadas CDP e a pausa deliberada de **60 ms**. O relatório `p15RegionContext.performanceDiagnostic` guarda **apenas métricas agregadas**, sem valores por região/site, URLs, textos, CSS bruto ou dados de formulário. A medição é anterior a qualquer pintura da P13.
- `tests/p15-performance-contract.test.js` valida percentis/contagens, ausência de medidas falsamente zeradas, rejeição de entradas inválidas e `promotionEligible=false`. A comparação entre tempos de captura e tempo total não é uma medida de CPU isolada nem demonstra custo em dispositivos de usuários.
- **Limite explícito:** latência de laboratório em Chromium descartável, sem limite de aprovação automática nem critério de publicação. Para a P15 ser concluída ainda faltam análise dos resultados reais da CI, testes em carga/resize/interações, critérios futuros de orçamento justificados e revisão visual. Nunca treinar ou promover modelo P16 em função dessas métricas isoladas; a P14 ainda não cumpriu o corpus público/manual e holdout.

## Revisão P15 — resultados reais do CI no commit d7305a4 (28/10/2026)

Evidência: [CI navegador #40687325522](https://github.com/joaoldsxyzbr/Extensao-dark/actions/runs/40687325522) e [CI qualidade #40687325544](https://github.com/joaoldsxyzbr/Extensao-dark/actions/runs/40687325544), ambos concluídos em **success** nesse SHA. O passo `Medir baseline P13 nas fixtures P14 sem executar holdout` também concluiu em success.

- Relatório sintético P14 impresso no workflow: **12 fixtures exploratórias**, **11 casos P15 observados** (outro inconclusivo), **11 estáveis apenas nas duas capturas amostradas**; percentil 95 do **primeiro tempo de captura P15: 6,3 ms**. Este p95 é calculado sobre capturas medidas, não tempo da página inteira, hardware de usuário ou execução de MV3.
- Smoke independente em Chromium descartável: uma captura autoral com p95 de **0,8 ms** e tempo total de **65,926 ms**, que inclui explicitamente a pausa de 60 ms, overhead CDP e comparação. Uma única fixture não é uma distribuição representativa.
- O benchmark de pintura P13, distinto do P15: 10 casos sintéticos seguros, dois inconclusivos; 11 pares candidatos e 10 pares medidos. Estes números **não** são prova de qualidade visual independente nem comparação completa de First AI 7D/P11/P13.
- Nenhuma amostra do holdout selado foi usada. Métricas `promotionEligible=false`; **P14/P15 não são concluídas** e continuam sem corpus público validado, avaliação visual independente e medição de carga. Não inferir um limite de desempenho aprovado a partir de 6,3 ms.

## Incremento P15 — carga DOM e critérios de continuidade (28/10/2026)

### Proteção implementada
- A captura `content/region-graph.js` passou a usar `TreeWalker` incremental nos navegadores, tanto para localizar regiões quanto para descobrir hosts de Shadow DOM e iframes. Isso evita construir um `NodeList` gigante com `querySelectorAll('*')` antes de aplicar os limites.
- Limites conservadores de laboratório: no máximo **8.000 elementos examinados na procura de regiões**, **1.600 candidatos correspondentes**, **8.000 elementos na descoberta de hosts**, **80 regiões retornadas**, **24 escopos**, **8 níveis** e **8 iframes**. Ao ultrapassar um limite, retorna `inconclusive` com `nodes:[]`, sem exportar parcial ou autorizar pintura. Fallback `querySelectorAll` existe apenas para doubles mínimos sem API `TreeWalker`.
- Regressões Node simulam 8.100 elementos e 1.700 candidatos regionais com `querySelectorAll` indisponível, confirmando interrupção incremental. O smoke Chromium gera **8.300 `span`** e **1.700 `section`** autorais, validando o bloqueio dos limites sem tocar o holdout ou carregar páginas de usuários.
- Como proteção adicional, o escopo continua apenas experimental: nenhum listener de produção, coleta persistente, permissão nova ou rede para capturar páginas foi adicionado. A medição de desempenho deve ser observada novamente após essa mudança; **não presumir** que o p95 anterior permaneceu igual.

### Condições para uma futura conclusão da P15
- Confirmar CI de qualidade, teste real Chromium sob carga e benchmark P14 **no mesmo SHA final**. Aprovado em outra revisão não substitui execução da revisão atual.
- Ler os p50/p95 e contagens do relatório atualizado; diferenciar a latência de uma captura do tempo total CDP, que inclui pausa de 60 ms. Nenhum limite automático de aprovação foi estabelecido; se houver regressão, investigar e comparar no mesmo ambiente.
- Manter `applied=false`, `promotionEligible=false`, holdout P14 selado e ausência de dados pessoais, mesmo quando os testes dão `success`.
- P15 só pode ser tratada como finalizada após cobertura suficiente de cenários reais autorizados, revisão visual independente, limites conhecidos documentados e critérios de segurança definidos. Não iniciar promoção de pesos nem P19 com base nos testes sintéticos.

## Incremento P15 — proteção dinâmica e confirmação pós-carga (28/10/2026)

- Após a troca anterior para `TreeWalker`, os workflows [qualidade #40689099881](https://github.com/joaoldsxyzbr/Extensao-dark/actions/runs/40689099881) e [navegador #40689099861](https://github.com/joaoldsxyzbr/Extensao-dark/actions/runs/40689099861) passaram no SHA `b2ec555`. O smoke confirmou **8.300 hosts e 1.700 candidatos**, ambos inconclusivos com `applied=false`. A bancada P14 completou as 12 fixtures sintéticas e indicou 11 casos P15 observados, p95 de **8,1 ms para a primeira captura** e nenhum modelo elegível para promoção. A rodada anterior com outra revisão marcou 6,3 ms; a diferença **não é prova de regressão** sem repetição controlada e medição de hardware equivalente.
- **Falha fechada:** durante a extração, se o DOM desconectar, a geometria/computed style não puder ser lida ou a procura de hosts falhar, a função retorna `inconclusive` com `nodes:[]` e a contagem de candidatos observados. Nunca retorna prefixo parcial classificado como seguro. Regressões Node simulam exceção após o primeiro elemento e falha no segundo percurso.
- **Proteção adicional:** áreas `contenteditable` (exceto `false`), `role=textbox/searchbox` e anúncios `aria-live` (exceto `off`) são tratados como conteúdo interativo sensível. Não se captura o texto, valor ou atributos desses controles; um pai com esses descendentes fica incerto. Testes Node e fixture própria Chromium verificam abstenção e ausência de strings privadas no grafo.
- **Sem novas permissões, dependências, rede de telemetria, pintura, treinamento, promoção, merge ou alteração de produção**. Os novos testes e gates exigem verificação no SHA final. P15/P14 seguem incompletas por ausência de corpus público anotado, revisão visual e comparação completa dos motores.

## Incremento P15 — explicabilidade de riscos e segurança de listas filhas (28/10/2026)

- `scripts/p15-risk-coverage.js` sumariza somente **contagens de motivos de incerteza** obtidas de grafos P15 que passaram pelo validador estrito. Categorias: descendente protegido, foco, tema escuro nativo, pseudo-elemento, iframe, oclusão amostrada, CSS ancestral complexo, animação e pintura desconhecida. Motivos podem coincidir na mesma região, logo sua soma **não** corresponde a regiões únicas nem a percentual de pixels.
- `scripts/p14-benchmark-browser.js` inclui `p15RegionContext.riskCoverage` com totais agregados apenas das fixtures sintéticas de exploração; mantém `applied=false`, `promotionEligible=false` e `independentVisualReview=false`. Nenhuma classe por URL, CSS privado, texto de página ou screenshot é enviada ao contrato.
- `tests/p15-risk-coverage.test.js` cobre categorias sobrepostas, incerteza sem números falsamente zerados, esquema inválido e privacidade. O smoke Chromium confirma correspondência da contagem de ilhas com o contexto e que existem riscos protegidos e de iframe numa fixture autoral.
- `docs/minhas-skills/plans/p15-visual-validation-protocol.md` define como comparar observações CSS com área realmente clara, revisões cegas e controles/contraste, sem tocar o holdout. **É um roteiro para futura revisão independente, não evidência de que essa revisão ocorreu.**
- Em `content/region-graph.js` a detecção de texto direto deixou de executar `Array.from(childNodes)`: inspeciona somente `nodeType` em até **256 filhos diretos**. Acima desse limite ou em lista inválida, toda a amostra se torna inconclusiva, sem dados parciais. Os testes Node e o Chromium incluem cenário com 257 filhos. Nenhum conteúdo de texto, valor ou URL é lido.
- O CI do SHA anterior `50c2cba` passou em qualidade e navegador, mas **o CI da revisão atual precisa ser observado separadamente**. P15 ainda não consegue medir área pixel a pixel, cobrir todos os sites, autorizar pintura nem concluir P14/P16.

### Diagnóstico e correção da fixture de carga (28/10/2026)

- No commit `0ec7389`, o workflow de navegador `#40691289188` falhou no smoke P15 ao esperar `scanned=1601` e obter `scanned=1`. Causa identificada: a própria fixture inseria 1.700 seções diretamente em `body`; o novo gate de no máximo 256 filhos diretos já impedia a primeira região, antes que a contagem de 1600 candidatos fosse testada.
- A fixture passou a criar grupos com no máximo **170 filhos por wrapper** não regional, preservando os 1.700 candidatos regionais e os 8.300 elementos não regionais. Assim, os gates independentes são exercitados sem depender da ordem de bloqueio incidental. Nenhuma lógica de proteção foi enfraquecida.
- Este registro distingue o CI anterior aprovado da rodada com fixture corrigida; **só o CI correspondente ao SHA mais recente valida a correção**. Continua proibida a promoção automática de pesos ou pintura com base nessas métricas.

## Incremento P15 — CSS de ancestrais e composição de camadas (28/10/2026)

- O SHA anterior `82fb940` passou no CI de qualidade `#40691505273` e de navegador `#40691505293`, incluindo o teste de carga com grupos menores que 256 filhos. A revisão presente foi criada **depois** dessa aprovação e exige verificação própria.
- `complexAncestor` agora recusa classificar como seguramente convertível uma região clara cujo ancestral use `transform`, `perspective`, `clip-path`, `contain: paint/content/strict`, `isolation:isolate` ou `will-change` de propriedades de composição visual. O motivo permanece o booleano `hasComplexAncestorPaint`: não são exportadas declarações CSS nem identificadores de elemento.
- Essa mudança protege contra falsos positivos da observação de superfícies quando o contêiner visualmente composto não é a própria região clara. É intencionalmente conservadora; não afirma ter detectado toda a área coberta por sobreposições e não substitui auditoria visual.
- Regressões Node cobrem transform, clip-path, perspective, containment, isolation e will-change, além do cenário limpo que **deve continuar detectável**. Smoke Chromium autoral compara filho claro sob ancestral transformado/recortado contra filho claro sob ancestral sem composição especial.
- O fluxo continua laboratório puro: `applied=false`, `promotionEligible=false`, corpus público/holdout P14 pendentes e nenhum treinamento P16, merge ou alteração da extensão distribuída.

## Incremento P15 — riscos de composição ancestral e color-scheme nativo (28/10/2026)

- O último SHA da etapa anterior `82fb940` concluiu em **success** os workflows de qualidade `#40691505273` e navegador `#40691505293`, incluindo a fixture de carga corrigida.
- `content/region-graph.js` passou a considerar como **incerteza de composição de ancestral** o uso de `transform`, `clip-path`, `perspective`, isolamento, `contain:paint/content/strict` e `will-change` de composição, mesmo que o fundo do ancestral seja opaco. Isso sinaliza `hasComplexAncestorPaint=true`; o contrato de features não promove ilhas nessa condição.
- `color-scheme` agora é interpretado como lista de tokens: `light dark`, `dark light`, `only dark` e `dark` levam a `nativeDark=true` (abstenção). A simples presença de `light` sem `dark` não bloqueia uma superfície opaca limpa. É uma precaução, não a detecção da preferência ativa do usuário.
- Regressões Node cobrem variantes de composição e color-scheme; o smoke Chromium autoral inclui contêiner transformado/recortado, contêiner limpo e `color-scheme:light dark`. Os testes são novos e só estarão validados após o CI da revisão atual.
- Esta etapa ainda não mede pixels, contraste visual final, telas de usuários nem corrige a extensão instalada. `applied=false`, `trained=false`, `promotionEligible=false`; `main` intacta, sem merge nem release.

## Incremento P15 — landmarks visuais em screenshot e controles de navegação (28/10/2026)

- Verificado antes desta revisão: ambos os workflows do commit `9eb5475` concluíram com `success` (qualidade `#40695755731`, navegador `#40695756207`). As alterações seguintes exigem **novos testes no SHA correspondente**.
- Novo `scripts/p15-authored-pixel-oracle.js` usa **exclusivamente screenshots de fixtures HTML autorais no Chromium descartável**. Captura um PNG temporário com CDP, decodifica no canvas do próprio Chromium e compara até oito landmarks de cor luminosa/escura com limites estritos. Retorna apenas contagens de acertos/erros, nunca pixels brutos, imagens, texto, seletor ou navegação. Arquivo temporário removido após a avaliação. O script não é importado pela extensão distribuída.
- A fixture de sobreposição compara um landmark escuro **realmente encoberto por overlay** com outro ainda claro no mesmo `main` com fundo computado claro. A fixture de editor contrasta área clara visível e fundo escuro, embora a região clara permaneça protegida para qualquer decisão automática. Isso diferencia um teste de CSS computado de **evidência limitada de cor renderizada**.
- Novas regressões Node limitam coordenadas, quantidade de pontos e proíbem payloads arbitrários no verificador; smoke Chromium exige `matched`, `imageExported=false`, `promotionEligible=false` e nenhum conteúdo privado exportado. **Não são screenshots de páginas reais**, nem revisão visual cega independente ou medida total de cobertura de pixels.
- `content/region-graph.js` agora trata `a[href]`, `summary`, links/abas/menus/combobox/listbox ARIA como descendentes interativos protegidos. Um pai claro com essas ações não vira ilha segura; URL e texto de âncoras nunca são lidos. Regressão Node e fixture Chrome autoral verificam bloqueio e privacidade.
- P15 segue laboratório sem CSS aplicado, sem treinamento, sem promoção, sem merge e com `main` preservada. A validação humana e o corpus real/holdout P14 continuam obrigatórios antes de P16–P19.

## Incremento P15 — oráculo visual com prova negativa (28/10/2026)

- A revisão anterior `0154945` passou nos dois workflows: qualidade `#40701363700` e navegador `#40701363671`. Esses resultados **não** certificam automaticamente commits posteriores.
- `validateLandmarks` agora rejeita coordenadas duplicadas, mesmo com expectativas opostas. Cada ponto precisa representar uma posição independente; oito repetições do mesmo pixel não podem inflar a contagem de evidência. Testes Node verificam duplicatas iguais/opostas e pontos distintos.
- A fixture Chromium de overlay passa por **três estados comparáveis**: (1) pixel escuro sob overlay; (2) overlay oculto com o mesmo pixel claro; (3) expectativa deliberadamente incorreta de pixel escuro, que deve retornar `mismatch`. A captura do grafo P15 após a remoção da sobreposição deve permanecer em estado `ready` e identificar fundo claro não ocluído; a comparação temporal com o estado original deve ser `inconclusive`. Após restaurar o overlay, as duas observações CSS devem ser equivalentes somente na amostra.
- **Isso é uma prova negativa limitada do teste autoral, não a detecção geral de pixels brancos de sites reais.** O oráculo de screenshot continua somente em scripts de laboratório, sem exportar pixels, sem conteúdo de página, sem URLs e sem dados de usuários. `imageExported=false`, `applied=false`, `trained=false`, `promotionEligible=false`.
- CI final e benchmark exploratório devem corresponder ao **novo SHA**, sem polling, e a P14/holdout e revisão visual humana continuam pendentes.

## Incremento P15 — varredura limitada de controles protegidos (28/10/2026)

- Verificado antes da alteração: no commit `afadaa5`, os workflows [qualidade #40744372983](https://github.com/joaoldsxyzbr/Extensao-dark/actions/runs/40744372983) e [navegador #40744373026](https://github.com/joaoldsxyzbr/Extensao-dark/actions/runs/40744373026) concluíram em `success`. Isso não constitui aprovação da revisão atual.
- Anteriormente, `hasProtectedDescendants` usava `querySelector(protectedSelector)` e podia atravessar subárvores muito grandes sem limite antes de retornar. Agora usa `TreeWalker` de elementos com orçamento explícito de **512 descendentes por escopo** (raiz normal e Shadow DOM aberto). Se o orçamento se esgota sem comprovar a ausência de controle, retorna **protegido/incerto** — nunca libera uma ilha branca.
- O fallback `querySelector` permanece apenas para doubles/ambientes sem `createTreeWalker`; navegadores Chrome/Edge atuais possuem a API nativa. A captura mantém `applied=false` e `promotionEligible=false`, sem ler conteúdo, URLs, valores de campos nem criar telemetria.
- Novo teste Node simula três casos: 510 descendentes limpos; controle encontrado no limite; 513 descendentes sem controles (abstenção). Teste Chromium com HTML autoral insere 480 nós aninhados e depois mais 60; o grafo deve permanecer `ready`, mas a região clara passa de observável a incerta, e a comparação temporal se abstém.
- A medida é **conservadora**, pode aumentar falsos negativos em páginas grandes e ainda exige medição real de desempenho/qualidade. P14, holdout e revisão visual independente seguem pendentes; nenhuma mudança no `main`, MV3 distribuído, treino ou release.

## Incremento P15 — controles escondidos em Shadow DOM descendente (28/10/2026)

- **Marco validado anterior:** no SHA `f6a0793`, [qualidade #40747043343](https://github.com/joaoldsxyzbr/Extensao-dark/actions/runs/40747043343) e [navegador #40747043523](https://github.com/joaoldsxyzbr/Extensao-dark/actions/runs/40747043523) concluíram com `success`. Essa validação não cobre automaticamente a mudança presente.
- Investigação: `protectedDescendants` percorria a subárvore light DOM com `TreeWalker`, depois `el.shadowRoot` diretamente. **Se um componente filho tivesse `shadowRoot` próprio**, um controle protegido ali podia ficar invisível para a região clara ancestral, gerando falso `confirmedLightIsland`.
- Correção: o percurso abre somente `shadowRoot.mode==='open'` de hosts descendentes, com **orçamento total compartilhado de 512 elementos e até 24 escopos** por região. A busca é puramente estrutural por seletor/estado interativo, sem texto, URL, formulário ou objeto DOM nos resultados. Ao exceder qualquer limite, a área fica protegida/incerta; leitura anormal do DOM invalida o grafo inteiro. Não há permissão ou dependência nova.
- Regressões Node testam o mesmo pai claro com botão em Shadow DOM **versus** Shadow DOM aberto sem controles, e uma raiz interna com 513 nós sem controles (abstenção). Fixture Chromium autoral usa `<span>` com sombra aberta e botão: verifica bloqueio antes, ausência de bloqueio após remoção e comparação temporal inconclusiva.
- **Limites:** Shadow DOM fechado não é diretamente observável e permanece restrição expressa do projeto. Esta análise não autoriza pintura e não mede área real de pixels nem substitui corpus público/holdout e revisão visual independente. `applied=false`, `trained=false`, `promotionEligible=false`; `main` e versão distribuída preservadas. CI do novo SHA ainda deve ser confirmado.

## Incremento P15 — controles irmãos não invalidam superfícies independentes (28/10/2026)

- **Último marco verificado:** o SHA anterior `8476e6f` concluiu com sucesso os dois workflows de [qualidade #40747869461](https://github.com/joaoldsxyzbr/Extensao-dark/actions/runs/40747869461) e [Chromium #40747869492](https://github.com/joaoldsxyzbr/Extensao-dark/actions/runs/40747869492). A validação desta mudança requer CI próprio.
- **Falso negativo identificado na P15:** `confirmedLightIsland` exigia `!parent.uncertain`. Como `hasProtectedDescendants` é agregado a toda a subárvore, a simples existência de um botão num filho do `body` impedia reconhecer a superfície clara de um **irmão independente**, ainda que o próprio irmão não tivesse riscos.
- **Correção experimental:** separar segurança visual **local do pai** (fundo opaco escuro, sem foco, dark nativo, pseudo, iframe, oclusão, composição complexa ou animação) da mera existência de descendentes protegidos em outra ramificação. A região candidata **continua exigindo `!row.uncertain`**, incluindo varredura dos seus próprios descendentes, Shadow DOM aberto e controles. Se o pai tem qualquer outro risco de pintura, continua bloqueado.
- **Regressões:** Node verifica pai escuro com dois filhos claros (um limpo, outro com controle) e seis riscos locais de pai que continuam bloqueando a confirmação. Smoke Chromium autoral verifica os dois irmãos e move o botão entre eles: a classificação precisa acompanhar o novo componente e o diagnóstico temporal retorna inconclusivo. Não se captura texto/URL nem se usa holdout.
- **Limite:** é apenas melhoria de diagnóstico dos falsos negativos; não converte ou pinta qualquer área. `applied=false`, `trained=false`, `promotionEligible=false`. P14/avaliação cega continuam pré-requisitos de First AI e publicação.
