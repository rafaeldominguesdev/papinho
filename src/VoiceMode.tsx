import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import * as settings from "./settings";
import { VoiceOrb } from "./VoiceOrb";

/* ============================= MODO CONVERSA =============================
   Papo falado, no espírito do ChatGPT/Grok — mas montado com peça grátis e
   local: fala → texto pelo Speech.framework do macOS (`voice.rs`), resposta
   pelo `claude --print`, texto → fala pelo Kokoro local ou `say` (`tts.rs`).

   O loop:
     ouvindo  →  pausa natural fecha a fala  →  `voice_utterance`
              →  pergunta vai pro modelo (com as regras de fala)
              →  os deltas viram FRASES e cada frase já é falada
              →  acabou de falar tudo  →  volta a ouvir

   Duas coisas que fazem ou quebram a sensação de conversa:

   1. Falar frase a frase. Esperar a resposta inteira somaria o tempo de
      escrever + o tempo de ler. Assim o Papinho começa a responder enquanto
      o modelo ainda escreve o resto.

   2. Fechar o microfone enquanto ele fala (`voice_mute`). Sem cancelamento
      de eco, o alto-falante volta pelo microfone e ele conversa sozinho.
      Com fone de ouvido isso não acontece — daí o botão "fones", que deixa
      o microfone aberto o tempo todo e permite CORTAR a fala dele falando
      por cima, que é como o ChatGPT se comporta. */

export type VoiceHooks = {
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (message: string) => void;
};

type Phase = "starting" | "listening" | "thinking" | "speaking";

/** tira markdown/emoji: o `say` lê tudo literalmente, inclusive os asteriscos */
function speechText(s: string): string {
  return s
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/\*\*|__|~~|\*|(?<=\s)_|_(?=\s)/g, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Preserva frases completas para o sintetizador manter a entonação. */
function sentenceEnd(s: string): number {
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "\n") return i + 1;
    const strong = c === "." || c === "!" || c === "?" || c === "…";
    const soft = i >= 240 && (c === "," || c === ":" || c === ";");
    if (!strong && !soft) continue;
    const next = s[i + 1];
    if (next === undefined) continue; // pode ser "3." de "3.5" — espera o resto
    if (/\s/.test(next)) return i + 1;
  }
  // frase quilométrica sem pontuação: corta no último espaço pra não travar
  if (s.length > 360) {
    const sp = s.lastIndexOf(" ", 350);
    if (sp > 40) return sp + 1;
  }
  return -1;
}

/** manda pro log em arquivo (~/Library/Logs/Papinho.log) — num app
 *  empacotado não há console, e o erro na tela some junto com a janela */
const diag = (msg: string) =>
  void invoke("diag_log", { tag: "ui", message: msg }).catch(() => {});

/** o `say` lista "Eddy (Português (Brasil))" — na UI basta "Eddy" */
const shortVoice = (n: string) => n.replace(/\s*\(.*\)\s*$/, "");

export function VoiceMode({
  open,
  onClose,
  onAsk,
  hooksRef,
  chatTitle,
}: {
  open: boolean;
  onClose: () => void;
  /** manda a fala pro modelo (o App cuida do chat/stream) */
  onAsk: (text: string) => void;
  /** o App empurra os deltas do `chat://` por aqui */
  hooksRef: React.MutableRefObject<VoiceHooks | null>;
  chatTitle: string;
}) {
  const [phase, setPhase] = useState<Phase>("starting");
  const [level, setLevel] = useState(0);
  const [partial, setPartial] = useState("");
  const [said, setSaid] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [voices, setVoices] = useState<Array<{ name: string; locale: string }>>(
    [],
  );
  const [menu, setMenu] = useState(false);

  const voiceName = settings.useSetting("voiceName");
  const rate = settings.useSetting("voiceRate");
  const earphones = settings.useSetting("voiceEarphones");

  // ---- estado do loop que não pode causar re-render (roda dentro de listeners)
  const buf = useRef(""); // texto do modelo ainda não fatiado em frases
  const queue = useRef<string[]>([]); // frases esperando pra serem faladas
  const speaking = useRef(false);
  const curId = useRef(""); // id da fala em curso ("" = ignorar o tts://done)
  const seq = useRef(0);
  const streamDone = useRef(true);
  const accepting = useRef(false);
  const earRef = useRef(earphones);
  earRef.current = earphones;

  /** os listeners do Tauri são montados uma vez; passam por aqui pra sempre
   *  chamarem a versão atual (voz e velocidade escolhidas agora, não as de
   *  quando o overlay abriu). */
  const fns = useRef({ speakNext: () => {}, interrupt: () => {} });

  const mute = (muted: boolean) => {
    if (earRef.current) muted = false; // de fone, o microfone nunca fecha
    void invoke("voice_mute", { muted }).catch(() => {});
  };

  function backToListening() {
    queue.current = [];
    buf.current = "";
    speaking.current = false;
    curId.current = "";
    setPartial("");
    setLevel(0);
    setPhase("listening");
    mute(false);
  }

  function speakNext() {
    const next = queue.current.shift();
    if (!next) {
      speaking.current = false;
      if (streamDone.current) backToListening();
      else setPhase("thinking"); // acabou o texto, mas o modelo ainda escreve
      return;
    }
    speaking.current = true;
    const id = String(++seq.current);
    curId.current = id;
    setPhase("speaking");
    mute(true);
    void invoke("tts_speak", {
      id,
      text: next,
      voice: voiceName || null,
      rate: rate || null,
    }).catch((e) => {
      if (curId.current !== id) return;
      diag(`tts_speak falhou: ${String(e)}`);
      setErr(String(e));
      accepting.current = false;
      streamDone.current = true;
      backToListening();
    });
  }

  /** fatia o que chegou em frases e mantém a fala andando */
  function pump() {
    for (;;) {
      const cut = sentenceEnd(buf.current);
      if (cut < 0) break;
      const chunk = speechText(buf.current.slice(0, cut));
      buf.current = buf.current.slice(cut);
      if (chunk) queue.current.push(chunk);
    }
    if (!speaking.current && queue.current.length) speakNext();
  }

  function interrupt() {
    accepting.current = false;
    streamDone.current = true;
    curId.current = ""; // o tts://done desta fala não deve emendar a próxima
    queue.current = [];
    speaking.current = false;
    void invoke("tts_stop").catch(() => {});
    backToListening();
  }

  fns.current = { speakNext, interrupt };

  async function previewVoice(name: string) {
    accepting.current = false;
    streamDone.current = true;
    queue.current = [];
    buf.current = "";
    settings.set("voiceName", name);
    const id = `preview-${++seq.current}`;
    curId.current = id;
    speaking.current = true;
    setErr(null);
    setPhase("speaking");
    mute(true);
    try {
      await invoke("tts_stop");
      if (curId.current !== id) return;
      await invoke("tts_speak", { id, voice: name, rate,
        text: "Oi, eu sou o Papinho. Pode falar comigo à vontade. Como foi o seu dia?" });
    } catch (error) {
      if (curId.current !== id) return;
      setErr(String(error));
      backToListening();
    }
  }

  // ---- o App empurra o stream do chat pra cá (atualiza a cada render pra as
  //      closures verem o estado novo)
  useEffect(() => {
    hooksRef.current = open
      ? {
          onDelta: (t) => {
            if (!accepting.current) return;
            buf.current += t;
            pump();
          },
          onDone: () => {
            if (!accepting.current) return;
            streamDone.current = true;
            const rest = speechText(buf.current);
            buf.current = "";
            if (rest) queue.current.push(rest);
            if (!speaking.current) {
              if (queue.current.length) speakNext();
              else backToListening();
            }
          },
          onError: (message) => {
            if (!accepting.current) return;
            accepting.current = false;
            streamDone.current = true;
            buf.current = "";
            queue.current = [];
            diag(`chat falhou: ${message}`);
            setErr(message);
            if (!speaking.current) backToListening();
          },
        }
      : null;
  });

  // ---- ouvir o microfone enquanto o overlay estiver aberto
  const onUtterance = useRef<(text: string) => void>(() => {});
  onUtterance.current = (text: string) => {
    const t = text.trim();
    if (t.length < 2) return; // tosse, "ãh", ruído
    if (speaking.current) fns.current.interrupt(); // falou por cima (de fone)
    setErr(null);
    setSaid(t);
    setPartial("");
    buf.current = "";
    queue.current = [];
    streamDone.current = false;
    accepting.current = true;
    setPhase("thinking");
    mute(true); // enquanto pensa, não capta o barulho da sala
    onAsk(t);
  };

  useEffect(() => {
    if (!open) return;
    let dead = false;
    const uns: Array<() => void> = [];
    const add = (p: Promise<() => void>) =>
      void p.then((u) => (dead ? u() : uns.push(u)));

    add(
      listen<{ text: string }>("voice_partial", (e) => {
        if (!speaking.current) setPartial(e.payload.text);
      }),
    );
    add(
      listen<{ text: string }>("voice_utterance", (e) =>
        onUtterance.current(e.payload.text),
      ),
    );
    add(
      listen<{ level: number }>("voice_level", (e) => {
        if (!speaking.current) setLevel(e.payload.level);
      }),
    );
    add(
      listen<{ message: string }>("voice_error", (e) => {
        diag(`voice_error: ${e.payload.message}`);
        setErr(e.payload.message);
      }),
    );
    add(
      listen<{ id: string }>("tts://done", (e) => {
        if (!curId.current || e.payload.id !== curId.current) return;
        curId.current = "";
        fns.current.speakNext();
      }),
    );
    add(
      listen<{ id: string; message: string }>("tts://error", (e) => {
        if (e.payload.id !== curId.current) return;
        fns.current.interrupt();
        setErr(e.payload.message);
      }),
    );

    diag("modo conversa aberto");
    setPhase("starting");
    setErr(null);
    setSaid("");
    streamDone.current = true;
    void invoke("voice_start", {
      lang: "pt-BR",
      punctuation: true,
      conversation: true,
    })
      .then(() => { if (!dead) setPhase((p) => (p === "starting" ? "listening" : p)); })
      .catch((e) => {
        if (dead) return;
        diag(`voice_start falhou: ${String(e)}`);
        setErr(String(e));
      });

    void invoke<Array<{ name: string; locale: string }>>("tts_voices", {
      locale: "pt_BR",
    })
      .then((vs) => {
        if (dead) return;
        diag(`vozes pt-BR encontradas: ${vs.length}`);
        setVoices(vs);
        if (vs.length && (!settings.get("voiceNeuralConfigured") || !vs.some((v) => v.name === settings.get("voiceName")))) {
          settings.set("voiceName", "Alex · IA local");
          settings.set("voiceRate", 175);
          settings.set("voiceNeuralConfigured", true);
        }
      })
      .catch(() => {});

    return () => {
      dead = true;
      accepting.current = false;
      streamDone.current = true;
      curId.current = "";
      speaking.current = false;
      queue.current = [];
      buf.current = "";
      hooksRef.current = null;
      uns.forEach((u) => u());
      void invoke("tts_stop").catch(() => {});
      void invoke("voice_mute", { muted: false }).catch(() => {});
      void invoke("voice_stop").catch(() => {});
    };
  }, [open]);

  // fone ligado no meio do papo: reabre o microfone na hora
  useEffect(() => {
    if (open) void invoke("voice_mute", {
      muted: !earphones && (speaking.current || !streamDone.current),
    }).catch(() => {});
  }, [open, earphones]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.code === "Space" && speaking.current &&
        !(e.target instanceof HTMLElement && e.target.closest("button, input, select, textarea"))) {
        e.preventDefault();
        interrupt();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;


  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-bg/92 backdrop-blur-xl">
      {/* o overlay vive ABAIXO da faixa de arrastar do app, então aqui é só
          um cabeçalho normal — os botões do macOS ficam lá em cima. */}
      <div className="flex h-11 shrink-0 items-center gap-2 px-4">
        <span className="truncate text-[11px] uppercase tracking-[0.16em] text-ink-dim">
          conversa · {chatTitle}
        </span>
        <button
          onClick={onClose}
          className="ml-auto pill px-3 py-1 text-[11px] text-ink-dim hover:text-ink"
          title="sair do modo conversa (esc)"
        >
          encerrar
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-8 px-8">
        <button
          onClick={() => (phase === "speaking" ? interrupt() : undefined)}
          className="relative grid max-w-full place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-primary"
          aria-label={phase === "speaking" ? "Interromper resposta" : "Esfera de voz"}
          title={phase === "speaking" ? "interromper (espaço)" : "esfera de voz"}
        >
          <VoiceOrb phase={phase} level={level} size={420} />
        </button>

        <div className="flex flex-col items-center gap-2 text-center">
          <p className="chat-serif min-h-[3.5rem] max-w-2xl text-[17px] leading-relaxed text-ink">
            {partial || said}
          </p>
          {err && (
            <p role="alert" className="max-w-xl text-[12px] text-danger">{err}</p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 px-6 pb-8">
        <button
          onClick={() => settings.set("voiceEarphones", !earphones)}
          aria-pressed={earphones}
          className={
            "pill px-3 py-1.5 text-[11px] " +
            (earphones ? "border-primary/50 text-primary" : "text-ink-dim")
          }
          title={
            earphones
              ? "microfone aberto o tempo todo — dá pra interromper falando"
              : "de fones, o microfone fica aberto enquanto ele fala e você pode cortar falando por cima"
          }
        >
          fones {earphones ? "on" : "off"}
        </button>

        <div className="relative">
          <button
            onClick={() => setMenu((m) => !m)}
            aria-expanded={menu}
            className="pill px-3 py-1.5 text-[11px] text-ink-dim"
            title="voz e velocidade"
          >
            voz: {shortVoice(voiceName) || "padrão do sistema"}
          </button>
          {menu && (
            <div className="absolute bottom-10 left-1/2 z-30 w-[300px] -translate-x-1/2 pop p-3">
              <p className="mb-2 px-1 text-[10px] uppercase tracking-[0.16em] text-ink-dim">
                vozes em português
              </p>
              <div className="flex max-h-52 flex-col gap-0.5 overflow-y-auto">
                {voices.length === 0 && (
                  <p className="px-1 py-2 text-[11px] leading-relaxed text-ink-dim">
                    nenhuma voz pt-BR instalada. Ajustes do Sistema ›
                    Acessibilidade › Conteúdo falado › Voz do sistema ›
                    Gerenciar vozes → Português (Brasil).
                  </p>
                )}
                {voices.map((v) => (
                  <button
                    key={v.name}
                    onClick={() => void previewVoice(v.name)}
                    aria-pressed={voiceName === v.name}
                    className={
                      "rounded px-2 py-1.5 text-left text-[12px] hover:bg-white/[0.06] " +
                      (voiceName === v.name ? "text-primary" : "text-ink")
                    }
                  >
                    {shortVoice(v.name)}
                  </button>
                ))}
              </div>
              <p className="mb-1 mt-3 px-1 text-[10px] uppercase tracking-[0.16em] text-ink-dim">
                velocidade · {voiceName.includes("IA local") ? `${(rate / 175).toFixed(2)}×` : `${rate} ppm`}
              </p>
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
            </div>
          )}
        </div>

        <button
          onClick={interrupt}
          disabled={phase !== "speaking"}
          className="pill px-3 py-1.5 text-[11px] text-ink-dim disabled:opacity-30"
          title="parar de falar (espaço)"
        >
          interromper
        </button>
      </div>
    </div>
  );
}
