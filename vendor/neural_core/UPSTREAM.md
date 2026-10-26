# Motor neural da Extensão Dark — origem histórica

O código em `vendor/neural_core/` **faz parte deste projeto e é mantido aqui**. Não há dependência de um repositório central nem sincronização prevista. A denominação `neural_core` e este nome de arquivo permanecem por compatibilidade com os imports, testes e scripts atuais.

## Proveniência (registro histórico)

- Repositório de onde a implementação foi inicialmente incorporada: https://github.com/joaoldsxyzbr/Base-rede-neural
- Commit de origem: `5dc938747b64d6b5c5a7a8c442062006c51e1532` (25/10/2026, P15).
- Os arquivos inicialmente incorporados em `src/` e `training/` eram cópias daquele commit. A partir desta decisão arquitetural, alterações futuras serão realizadas **neste repositório**, sem depender da existência do original.
- Manter `LICENSE` (MIT) e os avisos de direitos autorais ao editar, redistribuir ou reorganizar esse código.

## Manutenção local

- O bundle clássico para Manifest V3, `neural-core.js`, é gerado por `node scripts/build-neural.js` e conferido por `node scripts/build-neural.js --check`.
- Preservar o contrato JSON `formatVersion: 1` ou realizar migração explícita e testada. O código integrado oferece, entre outras capacidades, `predictBatch`, `getCapabilities`, `describeModel`, ReLU/softmax e rotinas de treinamento Python.
- Ter o motor integrado **não** implica ativar novas capacidades nem substituir pesos automaticamente: o modelo distribuído de sete entradas e os candidatos experimentais seguem processos separados de avaliação e promoção.
- Evoluir o motor conforme as necessidades reais da Extensão Dark, no próprio repositório, com testes de paridade JS/Python, regressão e qualidade visual. Mudanças de estrutura ou de formato precisam atualizar todas as referências e preservar compatibilidade quando possível.
- Nenhuma coleta de navegação, telemetria, execução remota ou treinamento online é autorizada.

A eventual exclusão do repositório histórico de origem não exige remover nem reescrever este motor local. Não apagar a licença ou este registro de proveniência por esse motivo.
