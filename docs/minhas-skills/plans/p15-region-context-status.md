# P15 — Extração regional contextual (primeiro incremento isolado)

**Estado:** somente instrumentação e regressões experimentais, sem integração à extensão instalada ou mudança da `main`. Branch `feat/p15-region-context` baseada na P14 (`feat/p14-dataset-benchmark`); PR empilhada. A P14 ainda não cumpriu seus gates de corpus público e benchmark comparável; este incremento P15 não substitui esses requisitos.

## Implementado neste incremento

- `content/region-graph.js`: `captureRegionGraph()` extrai, a partir do Chromium descartável, **até 80 regiões e 1600 candidatos examinados** por captura (sem conteúdo textual). Aceita regiões visíveis em viewport, calcula aproximações normalizadas de geometria, luminância CSS própria e efetiva em transparências simples, classe visual do bloco e índice efêmero do pai. As amostras em si permanecem em memória do navegador/laboratório.
- `content/region-features.js`: `buildRegionFeatures()` valida rigorosamente esquema e limites, produz contagens de **filhos, irmãos, filhos/irmãos claros, ancestral claro e presença estrutural de texto direto** (sem ler nós de texto), além de flags de foco, descendentes protegidos e tema escuro declarado. Saída de `complex` ou `transparent`, foco, proteção ou tema escuro é **incerta**; nenhuma classificação significa permissão de pintar.
- Integração **somente diagnóstica** na bancada de 12 fixtures exploratórias P14: `p15RegionContext` contém apenas códigos, contagens e IDs autorais das fixtures. Dados completos de CSS, DOM, URL e valores de formulário não são persistidos no relatório. O fingerprint e os cenários comparativos P13 não são alterados pelo extrator.
- `tests/region-context.test.js`: contratos de privacidade e geometria, parentesco/irmãos, inclusão de texto direto sem conteúdo, transparências simples, gradientes, DOM reparented, entradas inválidas e recusa a medições parciais acima do limite.

## Limites explícitos / trabalho pendente

- É uma **amostra de retângulos e CSS computado**, não cobertura em pixels e não um mapa completo de stacking/oclusões. Presença de nó de texto direto inclui nós com espaços e não comprova texto visível.
- A composição só reconhece cor RGB opaca ou transparência zero com ancestral opaco simples. **Gradientes, máscaras, filtros, misturas, opacidade parcial e cores complexas** são inconclusivos. `color-scheme: dark` marca incerteza, não promoção.
- Ainda não percorre Shadow DOM aberto e iframes na instrumentação P15; não captura pseudo-elementos nem estados hover, nem aplica mudanças. Não cobre roots fechadas, CSSOM complexo ou todos os padrões de layout. A lista de região é finita, logo cortes retornam inconclusivo sem aproveitar amostras parciais.
- Nenhuma nova permissão, dependência, telemetria, leitura de texto de usuário, histórico, navegação ou treino em sites reais. O holdout sintético e domínios públicos reservados da P14 continuam intocados.
- **`promotionEligible=false` e `applied=false`**. Este incremento não resolve as áreas brancas da extensão publicada, nem valida qualidade visual humana.

## Próxima sequência

1. Completar a captura de pais e filhos com composição CSS verificável, proteção contra oclusões/pseudo-elementos, Shadow DOM aberto e mudanças de layout; preservar limites e abstenção.
2. Acrescentar regressões de controles selecionados e estados de foco, cargas DOM e medição de latência no Chromium, sem abrir holdout.
3. Retomar a comparação P14 em páginas públicas autorizadas e pareadas. Só depois treinar a P16, mantendo os pesos separados da distribuição.

**Validação aplicável:** `node --test tests/region-context.test.js`, `node --test`, `node scripts/p14-benchmark-browser.js --p11-candidate=data/p11-descendant-ci-candidate.json` no GitHub Actions após treino P11. O teste de navegador pode levar mais tempo que o teste unitário e deve ser confirmado no commit final.
