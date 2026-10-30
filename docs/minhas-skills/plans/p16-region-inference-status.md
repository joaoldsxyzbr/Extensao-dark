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

## P16 — preparar revisão humana local segura (30/10/2026)

- Adicionado `scripts/p16-review-intake.js` e template **vazio** `training/datasets/p16-review-template.json`. O CI valida somente o template, sem dados reais. O comando `node scripts/p16-review-intake.js --local` permite validar posteriormente `training/reviews/p16-local-labels.json` sem enviar os rótulos ao Git; esse caminho é ignorado em `.gitignore`.
- O registro aceita apenas IDs opacos, domínio raiz público **já reservado** para treino/validação P14 (nunca holdout), índice regional (0–79), os 20 atributos P16 normalizados, duas respostas sem identidades pessoais e paleta RGB apenas se os dois pareceres concordarem com transformação **e** os gates de segurança aceitarem.
- Campos extras (URL, conteúdo, cookies, nomes de avaliadores, texto), duplicatas de vetor, abuso de split e conversão insegura são rejeitados. Relatório imprime só contagens agregadas, sem vetores, domínios ou amostras.
- Nenhum parecer foi coletado nesta etapa. Mesmo quando duas respostas concordam, o programa **não consegue autenticar avaliadores ou comprovar independência**, então retorna sempre `verifiedIndependentReviews:0`, `trainingAuthorized:false`, `promotionEligible:false`. Nenhuma amostra do holdout foi aberta, nenhum treinamento humano foi feito e nenhuma extensão foi modificada.

## Lote — captura local de regiões públicas para revisão humana (30/10/2026)

Este incremento permite sair dos exemplos exclusivamente sintéticos sem inventar labels. O comando offline `node scripts/p16-public-capture.js --plan` verifica a reserva P14: 15 domínios de treino e 5 de validação; 10 domínios de holdout ficam selados.

Para capturar um site já reservado em um PC com Chromium/Chrome (Node 22; opcional `CHROME_BIN`), executar manualmente `node scripts/p16-public-capture.js --domain=go.dev --case=case-go-home-01`. O programa abre apenas a raiz pública congelada em perfil Chromium descartável, recusa redirecionamentos para outro host e descarta a sessão ao final. Nunca recebe URL arbitrária. Não é executado pelo CI ou por agendamento.

O extrator P15 entrega unicamente vetores de 20 características CSS/geométricas por região e o identificador opaco informado; não guarda texto, URL da página, DOM bruto, conteúdo de formulário, cookies ou screenshots. A captura só cria rótulos `pending` em `training/reviews/p16-local-labels.json`, que é privado e ignorado pelo Git, com limite de 256 entradas, arquivo protegido, gravação atômica e rejeição de casos repetidos.

As pessoas devem revisar as regiões de modo independente, fora desta coleta, e preencher as duas avaliações e a paleta segura apenas quando houver evidência suficiente. `node scripts/p16-review-intake.js --local` valida o arquivo, mas não autentica revisores nem comprova sua independência. Nenhum rótulo humano foi coletado ou verificado nesta etapa. `trainingAuthorized:false` e `promotionEligible:false` permanecem obrigatórios.

O CI executa apenas `--plan` e testes Node sem rede. Antes de treinar o P16 supervisionado real, ainda faltam diversidade de páginas/layouts, revisão por pessoas, auditoria de privacidade e seleção/calibração somente em validação. O holdout não foi aberto.

## Lote de prontidão para revisão humana e navegação segura (30/10/2026)

- `scripts/p16-public-capture.js` reforça a navegação: a checagem ocorre DENTRO do Chromium, devolvendo apenas um booleano, sem exportar caminho ou query. Exige HTTPS e host exato do registro congelado, sem query/hash, e bloqueia redirecionamentos a rotas comuns de login/conta/pagamento e páginas que contenham campos sensíveis de senha/cartão/OTP. Em qualquer caso duvidoso, falha sem salvar. O perfil descartável sempre é fechado.
- `scripts/p16-review-audit.js --template` audita somente o template vazio no CI; `--local` pode ser executado manualmente no PC após capturas e revisões. O relatório contém apenas totais de regiões/casos pendentes, declarações coincidentes e conflitos por split (treino ou validação), sem exibir IDs, hosts, vetores, nomes ou imagens.
- Duas declarações `convert/preserve` não provam revisores independentes. Os sinalizadores permanecem `verifiedIndependentReviews:0`, `trainingAuthorized:false`, `promotionEligible:false` em TODOS os resultados, inclusive com 100% das entradas preenchidas. A associação de índices de regiões às superfícies visuais e a comprovação externa de revisão independente seguem pendentes antes de treinamento regional real.
- Testes Node validam splits, filas, discrepâncias, privacidade, estados de falha e bloqueio de aprovações falsas. O CI executa apenas auditoria offline e não faz coleta pública.
