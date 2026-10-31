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

## Lote fechado — correspondência visual para revisão manual P16

Em um PC com Node 22, terminal interativo e Chromium/Chrome gráfico, executar `node scripts/p16-public-capture.js --domain=go.dev --case=case-go-visible-01 --review`. O comando aceita apenas host P14 congelado de treino/validação, valida HTTPS e superfície não sensível, abre um perfil Chrome *descartável e visível* e calcula **uma** captura P15. A captura chama um hook opcional que guarda elementos somente na memória temporária da aba; depois que o grafo é validado, desenha marcadores `R0`, `R1` etc. O índice do marcador é o `regionIndex` dos registros locais pendentes.

Após inspeção, pressione ENTER no terminal para encerrar o navegador. O arquivo `training/reviews/p16-local-labels.json` permanece ignorado pelo Git e recebe apenas características CSS/geométricas e votos `pending`; nenhuma etiqueta é automaticamente convertida em parecer humano. Alguns índices terão marcador mas não registro, pois vetores repetidos são descartados. Se a página mudar ou rolar, a posição pode ficar desatualizada; recapture um novo caso e não reutilize o índice antigo como evidência. Nenhum screenshot/DOM bruto/texto pessoal é persistido pelo modo de revisão.

Modo padrão sem `--review` permanece headless. O CI valida o mapeamento na própria fixture HTML **autoral** em Chromium e testa ausência de rótulos humanos verificados; nunca navega por páginas públicas P14, não toca o holdout, não ativa o modelo regional nem libera treinamento ou promoção (`trainingAuthorized:false`, `promotionEligible:false`).

## Lote P16 — transcrição segura de votos e quarentena supervisionada (30/10/2026)

**Sem avaliação humana independente verificada, não há autorização para treinamento, mesmo com dois pareceres iguais.**

Fluxo local e manual, após capturar um caso com `--review`:

1. O primeiro avaliador, de forma independente, registra uma resposta numérica/qualitativa da região visual `R1`, por exemplo `node scripts/p16-review-vote.js --case=case-go-visible-01 --region=1 --slot=first --vote=preserve`. Um segundo avaliador independente usa `--slot=second`. Votos possíveis: `convert`, `preserve`, `uncertain`. O programa não exporta conteúdos, URLs de navegação, nomes de pessoas ou votos nos logs. A independência dos avaliadores **não é autenticada pelo programa**; deve ser atestada em processo humano externo.
2. Para dois votos `convert`, o segundo registro precisa trazer uma paleta RGB normalizada segura com seis canais, como `--palette=0.06,0.07,0.08,0.95,0.96,0.97`. Essa paleta deve ser deliberada e revisada, não copiada cegamente. Se houver desacordo, dúvida ou voto pendente, a paleta é proibida. Nenhum voto preenchido pode ser sobrescrito pelo comando.
3. `node scripts/p16-review-audit.js --local` exibe contagens e `node scripts/p16-supervised-quarantine.js --local` distingue exemplos de acordo **declarado**, pendências e desacordos, separados por domínio e split em memória. Apenas a soma de casos/domínios/regiões por split é impressa; as linhas ficam no processo local e **não são exportadas ao Git, CI ou arquivo de candidato**.
4. Captura pública e registro de votos compartilham escrita atômica sob lock local e comparação com a versão observada. Se um operador alterar o arquivo durante a navegação, a captura antiga falha em vez de substituir os votos. Conflitos ou locks existentes exigem revisão manual; não há tratamento de segundo plano nem sobrescrita automática.

Segurança e limites: o `training/reviews/` continua ignorado pelo Git; o CI usa somente o template vazio e os testes sintéticos, não acessa `--local`, sites públicos ou holdout. O estado sempre apresenta `verifiedIndependentReviews:0`, `trainingAuthorized:false`, `promotionEligible:false`. Criptografia de origem de rótulos e comprovação de independência, inspeção real de regiões, cobertura diversa, qualidade de paletas, pipeline supervisionado Python, avaliação pareada P18 e auditoria P19 seguem pendentes.

## Lote P16 — gate preliminar de prontidão para treino supervisionado

- `node scripts/p16-training-readiness.js --template` é o teste estritamente offline no CI; `--local` avalia **somente** o ledger privado no PC. Não aceita `--train`, `--export`, paths arbitrários nem inspeciona domínios públicos. Sempre relata `trainingAuthorized:false`, `modelTrained:false` e `promotionEligible:false`.
- O gate verifica cobertura planejada mínima de 8 domínios de treino e 3 de validação, 24/8 casos, 48/16 regiões, equilíbrio básico entre conversão e preservação e ausência de exemplos quase idênticos entre splits (20 atributos P16, tolerância 0,005 nas dimensões contínuas). Esses limiares são **regras conservadoras de planejamento**, NÃO são prova estatística nem autorização de lançamento.
- Regiões com votos pendentes, discordância ou incerteza permanecem excluídas; o relatório imprime apenas totais e motivos pré-definidos. Mesmo que os alvos mínimos sejam atingidos, a verificação de identidade/independência dos revisores e a prova visual das regiões ainda faltam: o gate permanece bloqueado. A captura e a quarentena P16 anteriores continuam privadas.
- Cinco testes Node exercitam template vazio, rótulos autorais declarados, colisões próximas entre treino/validação, tentativa de falsificar verificação e parâmetros CLI proibidos. O ensaio não treina novos pesos nem exporta candidato. Próximo incremento depende de processo de revisão externa com evidências auditáveis e critérios de autorização próprios antes de implementar treino sobre dados humanos.

## Lote P16 — evidência de integridade do ledger privado (31/10/2026)

O contrato do ledger local subiu para `schemaVersion:2` (`p16-local-region-reviews-v2`). Cada entrada ganhou `regionDigest`: SHA-256 hex calculado na captura sobre `caseId`, domínio congelado, split, índice de região e o vetor de 20 atributos CSS/geometria. Registros antigos no formato v1 são rejeitados com falha fechada; não existem capturas reais registradas até agora, portanto não há migração a fazer.

- `p16-review-intake.js` recomputa o digest de cada linha em toda validação: edição manual de qualquer campo coberto após a captura invalida o registro e bloqueia intake, quarentena e gate de prontidão. Isso fecha a possibilidade de ajustar features à mão para contornar a detecção de quase-duplicatas ou o gate de conversão segura.
- A quarentena carrega `regionDigest` por linha e publica nos relatórios `regionDigestVerified:true` e um `evidenceDigest` agregado (SHA-256 dos digests ordenados; `null` com fila vazia). O gate de prontidão repassa ambos, permitindo que um futuro artefato de candidato cite exatamente quais evidências capturadas o originaram.
- O digest é prova estrutural de integridade de arquivo, **não** atestado humano: `verifiedIndependentReviews:0`, `trainingAuthorized:false`, `promotionEligible:false` seguem inalterados e obrigatórios. Nenhum dado pessoal entra no digest — apenas identificadores de caso e números normalizados já presentes no ledger.
- Cobertura de teste: `tests/p16-region-digest.test.js` verifica carimbo determinístico na captura, rejeição de adulteração de features/identidade/digest, transporte pela quarentena/prontidão e preservação do digest pelos votos.
