#!/usr/bin/env bash
# Builda, ASSINA e instala o Papinho em /Applications.
#
# O `codesign` no fim não é frescura: o bundle sai do `tauri build` com uma
# assinatura "linker-signed" e o Info.plist FORA dela. Nesse estado o macOS
# ignora NSMicrophoneUsageDescription / NSSpeechRecognitionUsageDescription e
# o modo conversa morre sem nunca pedir permissão. Reassinar ad-hoc o bundle
# inteiro amarra o Info.plist (`codesign -dvv` passa a dizer
# "Info.plist entries=N" em vez de "not bound").
set -euo pipefail
cd "$(dirname "$0")/.."

pnpm exec tauri build --bundles app
APP=src-tauri/target/release/bundle/macos/Papinho.app

rm -rf /Applications/Papinho.app
cp -R "$APP" /Applications/
codesign --force --deep --sign - /Applications/Papinho.app
codesign -dvv /Applications/Papinho.app 2>&1 | grep -i 'info.plist'

killall Papinho 2>/dev/null || true
sleep 1
open -a /Applications/Papinho.app
echo "Papinho no ar. Log de diagnóstico: ~/Library/Logs/Papinho.log"
