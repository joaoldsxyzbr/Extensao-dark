# P17 — Ensaio de rollback transacional (experimental)

**Estado:** somente laboratório, sem ativação no MV3 ou integração de modelo.

- Novo módulo independente de transação CSS: snapshot, preflight de lote, pintura temporária, auditoria, rollback. Recusa controles, cores de baixo contraste e fundos complexos.
- Rollback verifica propriedade e prioridade antes de restaurar; preserva alterações posteriores do próprio site. Não armazena URL, texto ou valores pessoais.
- Novo ensaio no Chromium descartável contra fixture própria servida em localhost: pinta 2 superfícies, protege input, simula CSS modificado pelo site e confirma rollback seletivo.
- Novos testes Node cobrem lote atômico, regiões protegidas, CSS inseguro, rollback e alterações após snapshot.
- Usa apenas CDP e Node nativos existentes. Sem Playwright, pacotes, rede de inferência, alterações de manifesto, pesos ou permissões.

**Não substitui** rótulos humanos P14–P16, beta MV3 real com opção local desligada por padrão ou benchmarks independentes P18/P19. Este laboratório não autoriza release.
