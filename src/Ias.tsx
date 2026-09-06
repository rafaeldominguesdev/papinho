import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Ico } from "./Ico";
import * as providers from "./providers";
import type { Provider } from "./providers";
import * as settings from "./settings";

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

        <VoiceSettings />

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

/** Voz do modo conversa. Mora aqui, e não na tela de conversa: lá a esfera
 *  é a interface inteira — botão de configuração no meio de uma conversa
 *  falada só atrapalha. */
function VoiceSettings() {
  const [voices, setVoices] = useState<Array<{ name: string; locale: string }>>(
    [],
  );
  const voiceName = settings.useSetting("voiceName");
  const rate = settings.useSetting("voiceRate");
  const earphones = settings.useSetting("voiceEarphones");
  const neural = voiceName.includes("IA local");

  useEffect(() => {
    void invoke<Array<{ name: string; locale: string }>>("tts_voices", {
      locale: "pt_BR",
    })
      .then(setVoices)
      .catch(() => {});
  }, []);

  /** troca a voz e já fala uma frase pra pessoa ouvir a diferença */
  function pick(name: string) {
    settings.set("voiceName", name);
    void invoke("tts_stop").catch(() => {});
    void invoke("tts_speak", {
      id: `preview-${Date.now()}`,
      voice: name,
      rate,
      text: "Oi, eu sou o Papinho. É assim que eu vou falar com você.",
    }).catch(() => {});
  }

  return (
    <section className="mt-10" aria-label="Voz do modo conversa">
      <h2 className="chat-serif text-[22px] text-ink">Voz</h2>
      <p className="mt-1 text-[13px] text-ink-dim">
        Como o Papinho fala no modo conversa. Clique numa voz para ouvi-la.
      </p>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {voices.length === 0 && (
          <p className="text-[12px] text-ink-dim">
            nenhuma voz disponível — o motor de voz local não respondeu.
          </p>
        )}
        {voices.map((v) => (
          <button
            key={v.name}
            onClick={() => pick(v.name)}
            aria-pressed={voiceName === v.name}
            className={
              "rounded-full px-3 py-1.5 text-[12px] transition-colors " +
              (voiceName === v.name
                ? "bg-primary/15 text-primary"
                : "pill text-ink-dim hover:text-ink")
            }
          >
            {v.name.replace(/\s*·\s*IA local$/, "")}
          </button>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <label className="flex min-w-[16rem] flex-1 flex-col gap-1.5">
          <span className="text-[11px] uppercase tracking-[0.16em] text-ink-dim">
            velocidade · {neural ? `${(rate / 175).toFixed(2)}×` : `${rate} ppm`}
          </span>
          <input
            aria-label="Velocidade da voz"
            type="range"
            min={120}
            max={300}
            step={5}
            value={rate}
            onChange={(e) =>
              settings.set("voiceRate", Number(e.currentTarget.value))
            }
            className="w-full accent-[var(--color-primary)]"
          />
        </label>

        <button
          onClick={() => settings.set("voiceEarphones", !earphones)}
          aria-pressed={earphones}
          className={
            "rounded-full px-3 py-1.5 text-[12px] transition-colors " +
            (earphones ? "bg-primary/15 text-primary" : "pill text-ink-dim")
          }
          title="de fones não tem eco: o microfone fica aberto enquanto ele fala e dá pra cortar falando por cima"
        >
          usando fones {earphones ? "sim" : "não"}
        </button>
      </div>
      <p className="mt-2 max-w-xl text-[11px] leading-relaxed text-ink-dim">
        Sem fone, o microfone fecha enquanto o Papinho fala — senão ele se
        escuta pelo alto-falante e responde a si mesmo. Com fone ligado aqui,
        dá pra interromper falando por cima.
      </p>
    </section>
  );
}
