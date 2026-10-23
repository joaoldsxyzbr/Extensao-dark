# P3 — correções visuais após comparação com Dark Reader

Base: comparação de outubro de 2026 com Chrome for Testing (v0.4.1), na mesma página de teste.

## Problemas reproduzidos

- Fundo do cartão escurecido, mas texto clareado só até ≈4,56:1 (cinza pouco confortável em vez de texto claro).
- Bloco com `rgba(255,255,255,0.75)` não era convertido porque a rede neural exige alpha >= 0,82; aparecia uma faixa branca com texto preto.

## Correções da v0.4.2

- Em superfícies realmente escuras, textos que eram muito escuros na página clara recebem o mapeamento claro nativo, mesmo quando já cumpriam marginalmente 4,5:1. Texto de badges saturados permanece sob a proteção de contraste habitual.
- A superfície semitransparente clara com texto escuro sobre fundo escuro conhecido recebe cor escura adaptada, preservando a transparência original. Não modifica overlays discretos, cores saturadas ou fundos cujo contexto é desconhecido.
- O comparativo automatizado em Chromium agora rejeita cartões/títulos apagados (limite de teste 8:1) e faixas de fundo muito claras, verificando o alpha e o contraste visível do painel. É critério interno de qualidade, não norma geral WCAG.

## Evidência e limites

O CI executa testes unitários e Chrome for Testing com a extensão instalada, em perfis separados do Dark Reader. A comparação usa cenário local sintético; não prova superioridade em sites reais nem mede consumo de CPU isoladamente. O modelo neural 3-8-1, o treino e as permissões permanecem intactos.
