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
- **Limites:** não promete identificar todas as transições ou animações disparadas após a captura, media queries com estilos equivalentes, mudanças ocultas entre dois pontos, pixels reais ou desempenho universal. `stable-in-sample` continua sem valor de autorização de pintura. Nenhuma mudança no manifesto, CSS de produção, pesos neurais ou `main`; P14/P15 e avaliação humana seguem pendentes.
