# Neural Core — snapshot versionado

Origem: https://github.com/joaoldsxyzbr/Base-rede-neural
Commit fixado: `5dc938747b64d6b5c5a7a8c442062006c51e1532` (25/10/2026, P15).

Os arquivos em `src/` e `training/` são cópias literais do commit indicado, sem customizações da Extensão Dark. O arquivo `LICENSE` acompanha o snapshot.

O pacote MV3 clássico em `neural-core.js` é gerado localmente por `node scripts/build-neural.js` e verificado por `node scripts/build-neural.js --check`. O gerador confere a API pública do upstream e inclui `predictBatch`, `getCapabilities` e `describeModel`; nenhuma biblioteca nem código remoto é carregado no navegador.

O formato JSON `formatVersion: 1` continua compatível com o classificador distribuído de sete entradas. A atualização P15 introduz suporte a ReLU/softmax, inferência em lote, metadados de capacidades e melhorias de treinamento Python (mini-batches, AdamW, validação, early stopping e exportação atômica). **Essas capacidades estão disponíveis, mas não são automaticamente usadas pelo modelo da extensão.** Os arquivos de pesos existentes não foram alterados nem promovidos.

Atualizações posteriores devem ser fixadas por commit, copiadas explicitamente e testadas; o repositório original não deve ser modificado para ajustes da extensão. Não existe sincronização automática, telemetria nem treinamento em páginas do usuário.
