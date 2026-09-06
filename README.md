# Papinho

Chat com **todos os seus agentes de IA juntos**, num app de desktop.

Roda por cima do `claude` que você já tem instalado e logado — sem chave de
API nova, sem conta separada. Escolhe modelo e nível de raciocínio por
mensagem, manda imagem, guarda o histórico e instala skills.

Irmão do [DevTerm](https://github.com/rafaeldominguesdev/devcrew) (o modo
CODE, com terminais e equipe de agentes). O Papinho é a parte de conversa,
separada num app próprio.

## Stack

Tauri v2 (Rust) + React 19 + TypeScript + Tailwind v4.

## Rodar

```bash
pnpm install
pnpm tauri dev
```

## Buildar

```bash
pnpm tauri build --debug   # .app em src-tauri/target/debug/bundle/macos/
```

## Estrutura

- `src/App.tsx` — o chat inteiro (sidebar de conversas, compositor, skills)
- `src/settings.ts` — preferências (nome, modelo e raciocínio padrão)
- `src-tauri/src/engine/chat.rs` — roda `claude --print` em streaming
- `src-tauri/src/engine/skills.rs` — lê/instala skills em `~/.claude/skills/`
