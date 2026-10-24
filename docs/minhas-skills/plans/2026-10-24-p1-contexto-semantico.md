# P1 — Contexto semântico para a Extensão Dark

## Objetivo
Identificar a função de componentes web antes de modificar cores, sem substituir pesos já validados.

## Implementação
- content/colors.js: visualContext classifica graphic/control/text/surface e escolhe preserve/contrast/convert.
- Detecta mask-image, background-image, clip-path, ARIA role img, SVG, wrappers gráficos compactos, pseudo-elementos e estados selecionado/desabilitado.
- contextFeatures fornece 18 valores normalizados. Os sete primeiros são o contrato neural existente; os onze adicionais representam contexto gráfico, controle, transparência, contraste, estado e dimensão.
- content/content.js aplica ações conservadoras antes de chamar rede neural ou mapeamento clássico. O modelo publicado ainda utiliza sete entradas.
- tests/p1-semantic-context.test.js e tests/engine-smart.test.js cobrem semântica e comportamento integrado.
- Manifesto versão 0.6.0.

## Validação e limites
- P0: 3.240 combinações sintéticas ainda sem rótulos de treino real, não são acurácia.
- P1 NÃO publica modelo de 18 dimensões; futuro P2 deve treinar e avaliar pesos novos antes de ativá-los.
- Pistas como classes 'icon' podem gerar falsos positivos; nesses casos preservar gráficos é mais seguro do que escurecê-los.
- A inferência não lê campos, texto digitado nem envia conteúdo. Pseudo-elementos são consultados apenas em candidatos compactos.
- Executar node --test, scripts/verify-neural-model.js, visual-corpus-report.js --check e scripts/browser-e2e.js em CI.

## Próximo passo
P2 cria rótulos supervisionados independentes e testa um modelo contextual maior contra o baseline atual.
