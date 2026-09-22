# Papinho

Chat de desktop com **todos os seus agentes de IA juntos** — Claude, Codex, Grok e outros, na mesma janela.

Usa o login que você já tem em cada CLI (`claude`, `codex`...). Sem conta nova, sem chave de API própria do app.

| Arquivo | Sistema | |
|---|---|---|
| `Papinho.dmg` | macOS · Apple Silicon (M1 ou mais novo) | [**Baixar**](https://github.com/rafaeldominguesdev/papinho/releases/latest/download/Papinho.dmg) |

## O que dá pra fazer

- Escolher o modelo e o nível de raciocínio por mensagem
- Mandar imagem no chat
- Guardar o histórico de conversas
- Conversar por voz (transcrição + resposta falada, com vozes em português)
- Instalar skills direto pelo app

## Instalar

1. Baixe o `.dmg` no botão acima e arraste o Papinho para Aplicativos.
2. Na primeira abertura, o macOS vai bloquear porque o app é assinado localmente (sem conta Apple Developer paga). Clique com o botão direito no ícone → **Abrir** → confirme. Só precisa fazer isso uma vez.
3. Abra o Papinho — ele usa o login que a CLI (`claude`, por exemplo) já tem na sua máquina.

## Rodar a partir do código

```bash
pnpm install
pnpm tauri dev
```

Buildar seu próprio `.dmg`:

```bash
pnpm tauri build
```

## Stack

Tauri v2 (Rust) + React 19 + TypeScript + Tailwind v4.

## Voz neural local

O modo conversa oferece vozes em português brasileiro (Alex, Dora, Santa) via [Kokoro](https://github.com/thewh1teagle/kokoro-onnx), sintetizadas no próprio Mac — sem API de voz. O runtime é baixado por usuário na primeira vez que a voz neural é usada; sem ele, o app usa as vozes do sistema.

## Estrutura do projeto

- `src/App.tsx` — o chat inteiro (sidebar de conversas, compositor, skills)
- `src/settings.ts` — preferências (nome, modelo e raciocínio padrão)
- `src-tauri/src/engine/chat.rs` — roda `claude --print` em streaming
- `src-tauri/src/engine/skills.rs` — lê/instala skills em `~/.claude/skills/`
