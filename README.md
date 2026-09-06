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

## Voz neural local

O modo conversa oferece Alex, Dora e Santa em português brasileiro pelo
[Kokoro](https://github.com/thewh1teagle/kokoro-onnx), sem API de voz.
O texto é sintetizado no Mac. A geração da resposta do chat continua usando
o provedor já configurado.

O runtime é instalado por usuário em
`~/Library/Application Support/Papinho/voice/`. Essa pasta contém:

- `venv/bin/python`: Python 3.12 com `scripts/voice-requirements.txt` instalado.
- `kokoro-v1.0.onnx` e `voices-v1.0.bin`: arquivos da release
  [model-files-v1.1](https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.1).

O worker `scripts/neural_voice.py` é embutido no binário Rust e mantém o
modelo carregado entre frases. Interromper descarta sínteses pendentes e
para a reprodução. Os WAVs temporários são removidos após reprodução.
As vozes do macOS permanecem selecionáveis. Na primeira abertura após
instalar o modelo, Alex é selecionado com velocidade 1×; escolhas posteriores
são preservadas. O `.app` não inclui o modelo: em outro Mac, instale também
o runtime nessa pasta.

Validação local, com os arquivos instalados:

```bash
"$HOME/Library/Application Support/Papinho/voice/venv/bin/python" scripts/test_neural_voice.py
cargo test --manifest-path src-tauri/Cargo.toml synthesizes_through_persistent_worker -- --ignored
```

O primeiro teste gera amostras das três vozes em uma pasta temporária e
verifica áudio não vazio, taxa de amostragem e ausência de clipping.
O segundo testa a integração Rust/Python e recuperação após erro.

## Arquivos principais

- `src/App.tsx` — o chat inteiro (sidebar de conversas, compositor, skills)
- `src/settings.ts` — preferências (nome, modelo e raciocínio padrão)
- `src-tauri/src/engine/chat.rs` — roda `claude --print` em streaming
- `src-tauri/src/engine/skills.rs` — lê/instala skills em `~/.claude/skills/`
