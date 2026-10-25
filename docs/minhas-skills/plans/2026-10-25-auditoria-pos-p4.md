# Auditoria pós-P4 — correções verificáveis

## Escopo
Branch `fix/auditoria-pos-p4` sobre a versão 0.6.1. Atualização para v0.6.2.

### Semântica visual
`role="none"` e `role="presentation"` não significam ícone nem imagem. Os componentes que só usam esses papéis voltam a poder receber transformação. Máscaras CSS, SVG e `role="img"` continuam preservados.

### Limiar e verdade dos relatórios
O runtime de 7 entradas usa 0.80, o candidato de 18 entradas usa 0.90. Um arquivo de contrato `data/neural-thresholds.json` é usado nos treinamentos/avaliações; testes exigem paridade com a política do runtime. Como o candidato não atingiu todos os critérios do legado na primeira reavaliação, o CI deve registrar **não elegível** sem publicar pesos. Este é o estado seguro esperado; falhas estruturais e divergências Python/JS ainda falham o CI.

### Tema nativo
O laboratório registra `expected-native-dark-skip` apenas quando ambas as versões permaneceram inativas e o DOM do site fornece evidência de tema nativo escuro. Uma versão inativa sem essa evidência segue inconclusiva. O gate aceita skip esperado somente no modo automático; o modo global precisa executar a extensão.

### Iframes
O Manifest V3 declara `all_frames: true`. A injeção se limita a URLs HTTP(S) dos matches originais; não inclui `about:blank` nem `srcdoc`. Em frames de terceiro domínio, a extensão respeita as regras por hostname do frame **e dos ancestrais** recuperados via `location.ancestorOrigins` no Chromium. Desabilitar a aba superior também desabilita esses iframes. A extensão não adicionou novas permissões.

### Validação de carga
`scripts/browser-e2e.js` abre um iframe HTTP e confirma a transformação de um cartão no frame. Adiciona 800 elementos em uma mesma atualização, verifica o processamento e registra a duração total (inclui agendamento de tarefas do navegador). Tempo medido em CI não equivale a benchmark universal.

## Verificação
- `node --test`
- `python3 -m unittest discover -s training_tests -v`
- `node scripts/export-contextual-features.js`
- `python3 -m training.train_contextual --output data/contextual-ci-candidate.json --metrics data/contextual-ci-metrics.json`
- `node scripts/evaluate-contextual.js` (status de candidato reprovado é relatório e gate bloqueado; divergência de inferência continua erro)
- `node scripts/browser-e2e.js` com Chrome for Testing

## Limitações remanescentes
Nenhum dos pesos do candidato foi promovido; amostras de treino seguem predominantemente sintéticas. Avaliação real de fontes de ícones, pseudo-elementos, performance em páginas extensas autenticadas e estados visuais exige trabalho posterior. A rede não se treina automaticamente e não há coleta de dados do usuário.
