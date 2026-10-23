# Extensão Dark — motor híbrido 0.2.0

**Objetivo:** adicionar classificação neural local de superfícies ambíguas sem afetar a estabilidade das regras determinísticas e preservando modo escuro nativo.

**Restrições:** JavaScript/HTML/CSS puros no navegador, JavaScript nativo de Node no treinamento e nos testes. Nenhuma dependência, rede, telemetria, permissão ou serviço adicional. Manter instalação via ZIP da `main`, ícones e popup.

## Decisões e escopo

1. Implementar classificador feed-forward pequeno **offline** (`content/neural.js`) com treinamento reprodutível (`scripts/train-neural.js`); dataset inicial sintético/curado, sem dados de usuários e sem alegar generalização universal.
2. Usar inferência apenas em fundos **opacos e ambíguos**. As regras de preservação de mídia/tema escuro e de contraste mínimo permanecem determinísticas.
3. Adicionar cache finito para entradas equivalentes. Manter varredura DOM em lotes, sem chamadas à rede.
4. Expor controle opcional no popup: análise inteligente (experimental), ligada por padrão e desligável a qualquer momento.
5. Verificar regressões, formato do manifesto, peso real e benchmark local; testes de navegador real precisam de confirmação separada.

## Tarefas e verificação

- [x] **Rede neural reprodutível:** criar amostras curadas e treinamento determinístico em `scripts/train-neural.js`; gerar `content/neural.js`, com testes em `tests/neural.test.js` (`node --test`).
- [x] **Integração conservadora:** testar `content/content.js` com fundo cinza de texto escuro, texto claro em fundo escuro e site já escuro; implementar classificação apenas para casos ambíguos e contraste seguro.
- [x] **Controle no popup e manifesto:** atualizar `popup/`, `manifest.json`, adicionar teste das referências e preferência.
- [x] **Documentação:** limites, explicação do modelo sintético, teste e instalação; versão `0.2.0`.
- [x] **Revisão:** `node --test`, `node --check`, verificação de ícones/manifesto/ZIP e benchmark com Node; confirmar mudanças no GitHub após publicar na `main`.

**Rollback:** voltar ao commit anterior na GitHub UI ou desativar o modo inteligente no popup, sem perda de preferências.
