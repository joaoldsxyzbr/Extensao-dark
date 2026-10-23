# P5 — Segurança do CI e revisão geral

## Escopo executado

- SHA imutável verificado nas referências oficiais do GitHub para checkout, setup-node e upload-artifact.
- GITHUB_TOKEN reduzido a `contents: read`, sem persistir credenciais de checkout.
- Chrome for Testing 156.0.8078.47 (URL versionada, identidade de executável verificada), Dark Reader 4.9.133 (SHA-256 verificado).
- Extração ZIP com bloqueio de caminhos inseguros, symlinks, arquivos especiais, duplicados, criptografia e limites de tamanho.
- Testes nativos Node + unittest Python integrados aos dois workflows; treino neural continua reproduzível.
- Nenhuma mudança de permissões da extensão, do motor ou dos pesos neurais.

## Achados de auditoria geral (não alterados fora do P5)

1. **Tema escuro parcial:** a detecção de `html[dark]` suspende todo o motor; alguns widgets claros podem permanecer claros. Preservar a correção do YouTube, mas testar componentes mistos futuramente.
2. **Cobertura CSS:** alterações diretas na CSSOM, pseudo-elementos, gradientes e Shadow DOM fechado não têm suporte completo.
3. **Desempenho:** a varredura de DOM e leituras `getComputedStyle` ainda precisam de medição de CPU/memória em sites reais grandes; os tempos P3 incluem carregamento.
4. **IA:** a avaliação usa 14 cenários sintéticos reservados, não comprova qualidade generalista nem superioridade ao Dark Reader.
5. **Risco do CDP:** `--no-sandbox` é usado somente no GitHub runner efêmero e não deve ser levado a navegação cotidiana.
6. **Superfície de páginas:** `content_scripts.matches` cobre todo HTTP(S), exigido pela função automática, sem chamadas remotas no código da extensão inspecionado.

## Verificação

```sh
node scripts/train-neural.js
git diff --exit-code -- content/neural.js
node scripts/evaluate-neural.js
node --test
python3 -m unittest discover -s tests -p 'test_*.py'
```

A API pública de Chrome for Testing não inclui checksum SHA-256 do ZIP em seu catálogo. Registramos o SHA-256 de `156.0.8078.47` a partir do download oficial na execução do [GitHub Actions 40001062606](https://github.com/joaoldsxyzbr/Extensao-dark/actions/runs/40001062606), e o congelamos no código: `e6c94490f0b6b337225aeb2d2a5034858516b7017356980ba94f5176d8774a50`. Essa fixação protege contra mudanças posteriores do conteúdo, mas parte da confiança inicial no download oficial registrado no CI (TOFU) e não substitui assinatura do fornecedor.
