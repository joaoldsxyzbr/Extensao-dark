# P16 — Contrato de inferência regional (início experimental)

**Estado:** apenas biblioteca isolada e testes da First AI; PR empilhada sobre P15, não é o modelo treinado P16 nem uma versão utilizável da extensão.

## O que foi implementado

- `content/region-ai.js` recebe o grafo **P15 validado**, transforma somente CSS/geometria e flags estruturais em **20 atributos numéricos limitados [0,1]**. Não consulta texto, URLs, valores de formulário, cookies ou redes externas.
- Contrato versionado `p16-region-ai-candidate-v1`, com duas cabeças pequenas (decisão sigmoide 1 saída e proposta de paleta RGB sigmoide 6 saídas), executáveis pelo Neural Core local já empacotado. Rejeita versões, dimensões, número de parâmetros ou envelopes desconhecidos. **Nenhum peso foi treinado ou salvo nesta etapa**.
- A inferência **se abstém por padrão**. Só considera proposta se o P15 confirmar ilha clara com pintura confiável, confiança >=98%, fundo proposto escuro, texto claro e contraste >=7:1. O resultado é somente em memória, `applied:false` e `promotionEligible:false`. Não existe integração com `manifest.json` ou `content/content.js`.
- Testes Node usam modelos artificiais constantes apenas para comprovar contrato e execução do Neural Core local. Eles não representam generalização, rótulos ou ganho visual e não podem ser usados para liberar modelo.

## Próximo passo prioritário

1. Criar **rótulos revisados por pessoas**, independentes das heurísticas e do holdout selado, de função/ação/paleta por região; garantir separação por família/domínio e proibir amostras pessoais.
2. Treinar cabeças regionais em Python offline (P16) somente no split de treino e selecionar limiares pela validação; conferir paridade Python/JS, segurança de contraste e desempenho.
3. Integrar apenas um beta reversível desligado por padrão (P17) após as evidências P14/P15 e comparar com o 7D e P13 sem tocar em pesos publicados.

Nenhuma mudança em permissões, motor principal, pesos distribuídos, sites de holdout, `main`, merge ou release.

## P16 — experimento sintético de duas cabeças e paridade (30/10/2026)

- Gerador isolado de **32 exemplos sintéticos**, usando a vetorização P15/P16: 24 de treino (6 famílias) e 8 de validação (2 famílias), sem holdout. Corrigido o risco de vetores duplicados variando geometria explicitamente; rótulos são autorais, não independentes.
- Treinamento Python local (BCE e MSE) com redes pequenas e 8 épocas, somente no treino. O CI salva modelo e métricas exclusivamente em `data/p16-demo-ci-*.json`, ignorados pelo Git; nenhum peso de produção é alterado.
- Um verificador usa o Neural Core JS real para comparar decisões e RGB entre Python/JS na validação com tolerância de 1e-4. Testes de regressão cobrem splits, vetores duplicados, campos privados e ausência de promoção.
- **Este é somente um smoke test da infraestrutura**, não um modelo aprovado: falta anotação humana, generalização em sites independentes, avaliação P14/P15 e P17–P19. Nenhum holdout foi aberto nem existe alteração do MV3 publicado.
