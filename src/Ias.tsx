import { useEffect, useState } from "react";
import { Ico } from "./Ico";
import * as providers from "./providers";
import type { Provider } from "./providers";

/* ================================= IAs =================================
   Quais IAs o Papinho consegue usar nesta máquina.

   Não há campo de chave de API de propósito: cada CLI já guarda o login de
   quem a instalou (a assinatura do Claude, o ChatGPT no Codex, a conta Google
   no Gemini…). Conectar = instalar a CLI e logar; esta tela mostra o estado e
   dá o comando pra copiar. */

export function Ias() {
  const [list, setList] = useState<Provider[]>(providers.get());
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => providers.subscribe(setList), []);

  async function recheck() {
    setBusy(true);
    try {
      setList(await providers.refresh());
    } finally {
      setBusy(false);
    }
  }

  function copy(id: string, cmd: string) {
    void navigator.clipboard.writeText(cmd).then(() => {
      setCopied(id);
      window.setTimeout(() => setCopied((c) => (c === id ? null : c)), 1400);
    });
  }

  const on = list.filter((p) => p.installed);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[62rem] px-8 py-10">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="chat-serif text-[34px] leading-tight tracking-[-0.01em] text-ink">
              IAs conectadas
            </h1>
            <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-ink-dim">
              O Papinho conversa pela CLI de cada empresa e reaproveita o login
              que você já fez nela — nenhuma chave de API é guardada aqui.
            </p>
          </div>
          <button
            onClick={() => void recheck()}
            disabled={busy}
            className="mt-1.5 h-9 shrink-0 rounded-full bg-surface px-4 text-[12px] text-ink-dim transition-colors hover:text-ink disabled:opacity-40"
          >
            {busy ? "procurando…" : "procurar de novo"}
          </button>
        </div>

        <p className="mt-6 text-[11px] uppercase tracking-[0.16em] text-ink-dim">
          {on.length} de {list.length} prontas
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          {list.map((p) => (
            <div
              key={p.id}
              className={
                "flex flex-col rounded-xl border p-4 transition-colors " +
                (p.installed
                  ? "border-hairline bg-surface/60"
                  : "border-hairline/60 bg-transparent")
              }
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{
                    background: p.installed
                      ? providers.BRAND[p.id] ?? "var(--color-ink-dim)"
                      : "var(--color-hairline-strong)",
                  }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] text-ink">
                    {p.company}
                  </span>
                  <span className="block text-[11px] text-ink-dim">
                    {p.product} · {p.bin}
                  </span>
                </span>
                <span
                  className={
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] " +
                    (p.installed
                      ? "bg-success/15 text-success"
                      : "bg-white/[0.05] text-ink-dim")
                  }
                >
                  {p.installed ? "pronta" : "não instalada"}
                </span>
              </div>

              {p.installed ? (
                <>
                  <p className="mt-3 text-[12px] text-ink-dim">
                    {p.models.length === 1 && p.models[0].arg === ""
                      ? "modelo escolhido pela própria CLI"
                      : p.models.map((m) => m.label).join(" · ")}
                  </p>
                  <p className="mt-1 truncate text-[11px] text-ink-dim/70">
                    {p.path}
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-3 text-[12px] leading-relaxed text-ink-dim">
                    Instale a CLI e faça login uma vez — depois ela aparece no
                    seletor do compositor.
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded bg-bg-soft px-2 py-1.5 text-[11px] text-ink">
                      {p.install}
                    </code>
                    <button
                      onClick={() => copy(p.id, p.install)}
                      className="pill shrink-0 px-2.5 py-1 text-[11px] text-ink-dim hover:text-ink"
                    >
                      {copied === p.id ? "copiado" : "copiar"}
                    </button>
                  </div>
                  <p className="mt-2 text-[11px] text-ink-dim">
                    depois: <span className="text-ink">{p.login}</span>
                  </p>
                </>
              )}
            </div>
          ))}
        </div>

        <div className="mt-8 flex items-start gap-2.5 rounded-xl border border-hairline p-4">
          <span className="mt-0.5 shrink-0 text-ink-dim">
            <Ico n="bulb" className="h-4 w-4" />
          </span>
          <p className="text-[12px] leading-relaxed text-ink-dim">
            Só o Claude guarda a conversa por sessão aqui — nas outras IAs o
            Papinho manda o histórico junto da pergunta, então papos muito
            longos ficam mais lentos. Imagem, por enquanto, só no Claude.
          </p>
        </div>
      </div>
    </div>
  );
}
