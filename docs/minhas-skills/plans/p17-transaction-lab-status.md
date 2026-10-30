# P17 — Ensaio de rollback transacional (experimental)

**Estado:** somente laboratório, sem ativação no MV3 ou integração de modelo.

- Novo módulo independente de transação CSS: snapshot, preflight de lote, pintura temporária, auditoria, rollback. Recusa controles, cores de baixo contraste e fundos complexos.
- Rollback verifica propriedade e prioridade antes de restaurar; preserva alterações posteriores do próprio site. Não armazena URL, texto ou valores pessoais.
- Novo ensaio no Chromium descartável contra fixture própria servida em localhost: pinta 2 superfícies, protege input, simula CSS modificado pelo site e confirma rollback seletivo.
- Novos testes Node cobrem lote atômico, regiões protegidas, CSS inseguro, rollback e alterações após snapshot.
- Usa apenas CDP e Node nativos existentes. Sem Playwright, pacotes, rede de inferência, alterações de manifesto, pesos ou permissões.

**Não substitui** rótulos humanos P14–P16, beta MV3 real com opção local desligada por padrão ou benchmarks independentes P18/P19. Este laboratório não autoriza release.

## Integração P15 → P16 → P17 no laboratório

- `scripts/p17-integrated-pipeline.js` liga a vetorização P15, as duas cabeças da P16 via Neural Core real e as transações CSS da P17 em uma **fixture explicitamente autoral** no Chromium descartável.
- Modelo artificial constante de 20 entradas, sem qualquer treinamento ou peso publicado. O P16 propõe duas regiões claras seguras, abstém em região protegida. P17 aplica a paleta em duas regiões, compara CSS no navegador, simula alteração de CSS pelo site e faz rollback seletivo, registrando apenas contagens.
- Mapeamento de índice regional para elemento DOM é **fixo só na fixture sintética**. Não resolve a identidade de regiões reais; não há integração com a extensão instalada nem ativação de AI-first. Sem URLs, texto de usuários, holdout ou serviços externos.
- Novo teste unitário e workflow Chromium; aprovação só confirma interoperabilidade do protótipo. Dados humanos, P17 MV3 opt-in, comparação independente P18 e auditoria P19 permanecem obrigatórios.
