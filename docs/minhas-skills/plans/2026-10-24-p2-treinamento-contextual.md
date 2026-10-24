# P2 — Treinamento contextual supervisionado

## Objetivo e decisões
Construir e auditar candidato de 18 entradas, a partir do P0 e P1, preservando os pesos atuais até haver evidência externa da melhoria.

## Entrega
- Fonte `data/contextual-labels.json`: políticas manuais de converter/preservar/contraste por 30 famílias.
- Separação **por família**, com 18 treino, 6 validação e 6 holdout. Nenhuma família aparece em dois splits.
- `scripts/export-contextual-features.js`: gera 2.520 variações sintéticas determinísticas (7 paletas × 4 estados × 3 tamanhos × 30 famílias), usando `colors.contextFeatures` do runtime.
- As variações são relacionadas, não 2.520 exemplos independentes. O código rejeita IDs duplicados, rótulos contraditórios em vetores iguais e políticas inválidas.
- `training/train_contextual.py`: treino offline com SGD, dimensão 18→14→1, seed fixa; balanceamento de positivos apenas no treino.
- `scripts/evaluate-contextual.js`: validação de scores em JS, comparação de modelo novo/antigo, paridade Python/JS e relatório da mudança no dataset legado.
- CI: gera dataset temporário, treina candidato sem alterar `data/neural-model.json`, exige limites e disponibiliza pesos/relatórios em artefato.

## Critérios e evidência
- Critérios de aceitação sintética: accuracy ≥ 90%, precision ≥ 90%, recall ≥ 80%, falso positivo não superior ao baseline, accuracy não inferior ao baseline, em validation e holdout.
- Todas as amostras da família translucent ficam exclusivamente no holdout; uma regressão inicial revelou 36 falsos positivos. Para corrigir a lacuna, o treino inclui **cartões/alertas em hover translúcido**, sem mover a família do holdout.
- O conjunto legado de sete entradas é medido separadamente como diagnóstico, pois não possui os novos sinais semânticos.
- Ausência de telemetria, novos pacotes, rastreamento ou upload de sites.

## Limitações importantes
Rótulos são políticas de design sintéticas, e podem ficar longe do CSS real. Amostras correlacionadas e vetores de famílias distintas podem ser idênticos; a separação por família reduz um tipo de vazamento, mas NÃO demonstra generalização para sites.
O candidato pode acertar todos os casos sintéticos e ainda falhar no Roblox, GitHub ou YouTube. Portanto os pesos ficam **fora da extensão publicada** e P3 deve avaliar DOM real, screenshots, contraste, recursos carregados e regressões de UX.

## Verificação
```bash
node scripts/export-contextual-features.js
python3 -m training.train_contextual --output data/contextual-ci-candidate.json --metrics data/contextual-ci-metrics.json
node scripts/evaluate-contextual.js
node --test
python3 -m unittest discover -s training_tests -v
```
Os resultados são encontrados no workflow `Treinamento e qualidade da extensão`, artefato `contextual-neural-candidate-not-deployed`.

## Próximo passo
P3: testar cenário real diverso em Chromium, anotar falhas de tela e combinar qualidade de imagem, contraste, performance e estabilidade antes de discutir promoção.
