# Extensão Dark — Implementation Plan

> Agentes implementadores: trabalhar em passos pequenos e testar com `node --test` antes de declarar a entrega.

**Goal:** Uma primeira extensão de modo escuro em JavaScript puro, com controle global e por domínio e transformação local de cores.

**Architecture:** Dois content scripts (funções de cor e observador DOM) executados em páginas HTTP(S), com popup independente. O estado persiste em `chrome.storage.local`.

**Tech Stack:** Manifest V3, browser APIs, JavaScript nativo, HTML, CSS, Node `node:test` apenas para testes.

**Spec:** `docs/arquitetura.md`

## Restrições globais

- Sem frameworks, serviços, telemetria ou pacotes externos.
- Nenhuma modificação em mídia como imagens/vídeos/canvas/SVG.
- Evitar filtros CSS de inversão global.

## Tarefas

- [x] Testar e implementar funções puras de conversão RGB, mapeamento de cores e ativação por site.
- [x] Implementar injeção, varredura em lotes do DOM, observação de novos elementos e limpeza ao desativar.
- [x] Implementar popup acessível e integração de preferências.
- [x] Escrever o manifesto, README e instruções de instalação.
- [x] Rodar suíte de testes e verificações de sintaxe/manifesto antes do envio ao GitHub.

## Revisar manualmente antes de publicar

- Site que já possui tema escuro.
- Página grande ou SPA com elementos adicionados dinamicamente.
- Elementos de formulário, SVG, mídias e fundos com gradiente.
- Desativação de domínio e mudança de paleta em abas já abertas.
- Página `chrome://` e demais URLs restritas.
