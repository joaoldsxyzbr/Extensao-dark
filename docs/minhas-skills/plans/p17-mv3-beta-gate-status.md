# P17 — Gate do beta MV3 sem modelo aprovado

**Status:** preparado para testes em branch experimental; **não é ainda a First AI operacional**.

- Novo `content/ai-first-beta.js` embarcado localmente no manifesto MV3 antes do motor clássico, sem mudar permissões ou CSP. Não coleta DOM, dados pessoais, cookies, URLs nem trafega dados; não pinta CSS.
- A preferência privada/local `aiFirstBeta` tem valor padrão `false`. Pode ser alterada somente em laboratório, mas **mesmo que seja `true`**, enquanto não existir modelo regional aprovado o roteamento permanece no motor clássico 7D; `modelApproved=false` e `promotionEligible=false`.
- `content/content.js` usa o contrato para decidir se pode executar o caminho clássico, sem ligar a P15/P16 em páginas reais. Mantém o comportamento do popup e do modo escuro nativo existente. Uma chave antiga ou malformada nunca habilita o candidato sintético.
- Testes Node verificam ausência de permissão adicional, ordem do carregamento, default-OFF, recusa de pesos sintéticos e nenhuma dependência/requisição externa. O CI Chromium existente exercita o MV3 real na configuração padrão.
- **Falta para um beta útil:** evidências independentes P14/P15, rótulos e treino P16 revisados, vínculo DOM↔região sob proteção, transações P17 integradas ao content script em perfil descartável e benchmarks P18/P19. Não habilitar visualmente a opção no popup nem declarar First AI disponível antes desses gates.

Nenhuma alteração à `main`, release, pesos publicados ou permissões. PR empilhada na P18, experimental.
