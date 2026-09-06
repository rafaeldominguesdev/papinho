import { useEffect, useRef, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { HomeSky } from "./HomeSky";
import { MODELS } from "./models";
import { SKILLS, SKILL_SOURCES, skillSource, teamLogo } from "./skills";
import * as settings from "./settings";
// mascote do Papinho — sprite de 24 frames (scripts/make_logo_sheet.py)
import logoSheet from "./assets/logo-sheet.png";

/* ================================ Papinho ================================
   Chat com todos os agentes juntos. Roda `claude --print` por baixo (comando
   Rust `chat_send`), reaproveitando o login do `claude`. */

type ChatMsg = {
  role: "user" | "assistant";
  content: string;
  error?: boolean;
  /** data: URLs das imagens anexadas (só nas mensagens do usuário) */
  images?: string[];
};
type Chat = {
  id: string; // = session_id do claude (UUID)
  title: string;
  model: string; // api id (claude-sonnet-5 etc)
  effort: string; // "" = padrão do modelo, senão low|medium|high|xhigh|max
  msgs: ChatMsg[];
  turns: number; // respostas já recebidas — >0 usa --resume
  createdAt: number;
};

/** imagem escolhida mas ainda não enviada */
type PendingImg = {
  name: string;
  dataUrl: string; // preview
  mediaType: string;
  data: string; // base64 puro (sem prefixo data:)
};

const EFFORTS = ["", "low", "medium", "high", "xhigh", "max"] as const;
const EFFORT_LABEL: Record<string, string> = {
  "": "pensar: padrão",
  low: "pensar: baixo",
  medium: "pensar: médio",
  high: "pensar: alto",
  xhigh: "pensar: muito alto",
  max: "pensar: máximo",
};

const CHATS_KEY = "papinho.chats";
const CHAT_MODEL_KEY = "papinho.chat.model";
const CHAT_EFFORT_KEY = "papinho.chat.effort";

function uuid(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID)
      return crypto.randomUUID();
  } catch {
    /* ignora */
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function loadChats(): Chat[] {
  try {
    const arr = JSON.parse(localStorage.getItem(CHATS_KEY) || "[]");
    if (!Array.isArray(arr)) return [];
    return (arr as Chat[]).map((c) => ({ ...c, effort: c.effort ?? "" }));
  } catch {
    return [];
  }
}

/** ícones do chat — um só componente, path por nome. 24×24, stroke. */
function Ico({ n, className }: { n: string; className?: string }) {
  const P: Record<string, string> = {
    search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20 20l-4-4",
    sidebar: "M4 5h16v14H4zM9 5v14",
    plus: "M12 5v14M5 12h14",
    home: "M4 11l8-7 8 7M6 10v10h12V10",
    code: "M9 8l-4 4 4 4M15 8l4 4-4 4",
    folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z",
    shapes: "M8 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM13 13h7v7h-7z",
    clock: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16ZM12 8v4l3 2",
    wrench: "M15 5a4 4 0 0 0-5.5 4.7L4 15l3 3 5.3-5.3A4 4 0 0 0 17 7l-2.3 2.3-1.7-.3-.3-1.7L15 5Z",
    sliders: "M4 8h9M17 8h3M4 16h3M11 16h9",
    palette: "M12 4a8 8 0 1 0 0 16c1.2 0 1.5-1 1-1.7-.6-.9 0-2.3 1.2-2.3H17a3 3 0 0 0 3-3c0-4.4-3.6-9-8-9Z",
    chevron: "M7 10l5 5 5-5",
    download: "M12 4v11M8 11l4 4 4-4M5 20h14",
    waves: "M6 10v4M10 6v12M14 9v6M18 11v2",
    help: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16ZM9.8 9a2.3 2.3 0 1 1 3.3 2.1c-.8.4-1.1 1-1.1 1.9M12 16h.01",
    pencil: "M4 20l1-4L16 5l3 3L8 19l-4 1Z",
    cap: "M3 9l9-4 9 4-9 4-9-4ZM7 11v4c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5v-4",
    chat: "M4 5h16v10H9l-4 4V5Z",
    mail: "M4 6h16v12H4zM4 7l8 6 8-6",
    spark: "M12 3v6M12 15v6M3 12h6M15 12h6M6.2 6.2l3.5 3.5M14.3 14.3l3.5 3.5M17.8 6.2l-3.5 3.5M9.7 14.3l-3.5 3.5",
    trash: "M5 7h14M10 7V5h4v2M8 7l1 12h6l1-12",
    bulb: "M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3Z",
    book: "M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4ZM5 17a3 3 0 0 1 3-3h11",
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className ?? "h-[18px] w-[18px]"}
    >
      <path d={P[n] ?? ""} />
    </svg>
  );
}

type ChatSection = "inicio" | "projetos" | "skills" | "programado";

export default function App() {
  const [chats, setChats] = useState<Chat[]>(() => loadChats());
  const [activeId, setActiveId] = useState<string | null>(
    () => loadChats()[0]?.id ?? null,
  );
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [defaultModel, setDefaultModel] = useState<string>(() => {
    try {
      return localStorage.getItem(CHAT_MODEL_KEY) || settings.get("chatModel");
    } catch {
      return settings.get("chatModel");
    }
  });
  const [defaultEffort, setDefaultEffort] = useState<string>(() => {
    try {
      return localStorage.getItem(CHAT_EFFORT_KEY) ?? settings.get("chatEffort");
    } catch {
      return settings.get("chatEffort");
    }
  });
  const [pending, setPending] = useState<PendingImg[]>([]);
  const [copied, setCopied] = useState<number | null>(null);

  // como a pessoa quer ser chamada — definido na Config (modo CODE). Fica em
  // sync com um listener do evento que o settings.setChatName dispara.
  const [name, setName] = useState<string>(() => settings.getChatName());
  useEffect(() => {
    const onName = (e: Event) =>
      setName((e as CustomEvent<string>).detail ?? "");
    window.addEventListener("papinho:chat-name", onName);
    return () => window.removeEventListener("papinho:chat-name", onName);
  }, []);

  // estado só de UI (barra lateral, menus, modo, voz)
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState("");
  const [searchOn, setSearchOn] = useState(false);
  const [section, setSection] = useState<ChatSection>("inicio");
  const [sortDesc, setSortDesc] = useState(true);
  const [menu, setMenu] = useState<
    null | "filter" | "attach" | "model" | "profile" | "help" | "voice"
  >(null);
  const [notice, setNotice] = useState<string | null>(null);

  const streamRef = useRef<{ turnId: string; chatId: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  function toast(msg: string) {
    setNotice(msg);
    window.setTimeout(() => setNotice((n) => (n === msg ? null : n)), 2600);
  }
  function focusInput() {
    window.setTimeout(() => taRef.current?.focus(), 30);
  }

  // textarea que cresce com o texto (até um teto)
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [draft]);

  useEffect(() => {
    try {
      localStorage.setItem(CHATS_KEY, JSON.stringify(chats));
    } catch {
      /* ignora */
    }
  }, [chats]);

  useEffect(() => {
    try {
      localStorage.setItem(CHAT_MODEL_KEY, defaultModel);
      localStorage.setItem(CHAT_EFFORT_KEY, defaultEffort);
    } catch {
      /* ignora */
    }
  }, [defaultModel, defaultEffort]);

  const active = chats.find((c) => c.id === activeId) ?? null;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [active?.msgs]);

  const patchLastAssistant = (
    chatId: string,
    fn: (m: ChatMsg) => ChatMsg,
  ) => {
    setChats((cs) =>
      cs.map((c) => {
        if (c.id !== chatId) return c;
        const m = c.msgs.slice();
        for (let i = m.length - 1; i >= 0; i--) {
          if (m[i].role === "assistant") {
            m[i] = fn(m[i]);
            break;
          }
        }
        return { ...c, msgs: m };
      }),
    );
  };

  useEffect(() => {
    const uns: Array<() => void> = [];
    listen<{ turnId: string; text: string }>("chat://delta", (e) => {
      const s = streamRef.current;
      if (!s || e.payload.turnId !== s.turnId) return;
      patchLastAssistant(s.chatId, (m) => ({
        ...m,
        content: m.content + e.payload.text,
      }));
    }).then((u) => uns.push(u));
    listen<{ turnId: string; text: string }>("chat://done", (e) => {
      const s = streamRef.current;
      if (!s || e.payload.turnId !== s.turnId) return;
      patchLastAssistant(s.chatId, (m) => ({
        ...m,
        content: e.payload.text || m.content,
      }));
      setChats((cs) =>
        cs.map((c) => (c.id === s.chatId ? { ...c, turns: c.turns + 1 } : c)),
      );
      streamRef.current = null;
      setBusy(false);
    }).then((u) => uns.push(u));
    listen<{ turnId: string; message: string }>("chat://error", (e) => {
      const s = streamRef.current;
      if (!s || e.payload.turnId !== s.turnId) return;
      patchLastAssistant(s.chatId, (m) => ({
        ...m,
        content: e.payload.message,
        error: true,
      }));
      streamRef.current = null;
      setBusy(false);
    }).then((u) => uns.push(u));
    return () => uns.forEach((u) => u());
  }, []);

  function makeChat(): Chat {
    return {
      id: uuid(),
      title: "novo chat",
      model: defaultModel,
      effort: defaultEffort,
      msgs: [],
      turns: 0,
      createdAt: Date.now(),
    };
  }

  function newChat() {
    const c = makeChat();
    setChats((cs) => [c, ...cs]);
    setActiveId(c.id);
    setDraft("");
    setPending([]);
    setSection("inicio");
    focusInput();
  }

  function removeChat(id: string) {
    setChats((cs) => cs.filter((c) => c.id !== id));
    if (activeId === id) setActiveId(null);
  }

  async function attach() {
    if (busy) return;
    setMenu(null);
    try {
      const sel = await openDialog({
        multiple: true,
        filters: [
          { name: "imagem", extensions: ["png", "jpg", "jpeg", "gif", "webp"] },
        ],
      });
      const paths = Array.isArray(sel) ? sel : sel ? [sel] : [];
      for (const p of paths) {
        try {
          const img = await invoke<{ mediaType: string; data: string }>(
            "read_chat_image",
            { path: p },
          );
          const name = p.split(/[/\\]/).pop() || "imagem";
          setPending((ps) => [
            ...ps,
            {
              name,
              mediaType: img.mediaType,
              data: img.data,
              dataUrl: `data:${img.mediaType};base64,${img.data}`,
            },
          ]);
        } catch (e) {
          console.error("[devterm] imagem:", e);
        }
      }
    } catch {
      /* cancelou */
    }
  }

  async function copyMsg(text: string, idx: number) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(idx);
      window.setTimeout(() => setCopied((c) => (c === idx ? null : c)), 1400);
    } catch {
      /* ignora */
    }
  }

  async function send(over?: string) {
    const text = (over ?? draft).trim();
    if ((!text && pending.length === 0) || busy) return;
    let chat = active;
    if (!chat) {
      chat = makeChat();
      setChats((cs) => [chat as Chat, ...cs]);
      setActiveId(chat.id);
    }
    const turnId = uuid();
    const resume = chat.turns > 0;
    const model = chat.model;
    const effort = chat.effort;
    const chatId = chat.id;
    const imgs = pending;
    streamRef.current = { turnId, chatId };
    setSection("inicio");
    setChats((cs) =>
      cs.map((c) =>
        c.id === chatId
          ? {
              ...c,
              title:
                c.msgs.length === 0
                  ? (text || "imagem").slice(0, 44) +
                    (text.length > 44 ? "…" : "")
                  : c.title,
              msgs: [
                ...c.msgs,
                {
                  role: "user",
                  content: text,
                  images: imgs.map((i) => i.dataUrl),
                },
                { role: "assistant", content: "" },
              ],
            }
          : c,
      ),
    );
    setDraft("");
    setPending([]);
    setBusy(true);
    try {
      await invoke("chat_send", {
        turnId,
        sessionId: chatId,
        text,
        model,
        effort: effort || null,
        userName: name || null,
        systemExtra: settings.get("chatSystemExtra") || null,
        images: imgs.map((i) => ({ mediaType: i.mediaType, data: i.data })),
        resume,
      });
    } catch (e) {
      patchLastAssistant(chatId, (m) => ({
        ...m,
        content: String(e),
        error: true,
      }));
      streamRef.current = null;
      setBusy(false);
    }
  }

  function setModel(v: string) {
    setDefaultModel(v);
    if (active)
      setChats((cs) =>
        cs.map((c) => (c.id === active.id ? { ...c, model: v } : c)),
      );
  }
  function setEffort(v: string) {
    setDefaultEffort(v);
    if (active)
      setChats((cs) =>
        cs.map((c) => (c.id === active.id ? { ...c, effort: v } : c)),
      );
  }

  const curModel = active?.model ?? defaultModel;
  const curEffort = active?.effort ?? defaultEffort;
  const curModelName =
    MODELS.find((m) => m.api === curModel)?.nome ?? "Modelo";
  const sorted = [...chats]
    .filter((c) =>
      search.trim()
        ? c.title.toLowerCase().includes(search.trim().toLowerCase())
        : true,
    )
    .sort((a, b) =>
      sortDesc ? b.createdAt - a.createdAt : a.createdAt - b.createdAt,
    );

  const NAV: { id: ChatSection; ico: string; label: string }[] = [
    { id: "projetos", ico: "folder", label: "Projetos" },
    { id: "skills", ico: "bulb", label: "Habilidades" },
    { id: "programado", ico: "clock", label: "Programado" },
  ];

  const showThread = section === "inicio" && active && active.msgs.length > 0;

  return (
    <div className="fade-up relative z-10 flex min-h-0 flex-1 overflow-hidden bg-bg text-ink">
      <div className="pointer-events-none absolute inset-0 opacity-40">
        <HomeSky />
      </div>

      {/* botãozinho flutuante pra reabrir a sidebar (fade quando recolhida) */}
      <button
        onClick={() => setCollapsed(false)}
        title="mostrar barra lateral"
        aria-label="mostrar barra lateral"
        className={
          "absolute left-2.5 top-2.5 z-30 flex h-8 w-8 items-center justify-center rounded-lg text-ink-dim transition-all duration-200 hover:bg-white/[0.06] hover:text-ink " +
          (collapsed
            ? "opacity-100 delay-150"
            : "pointer-events-none -translate-x-1.5 opacity-0")
        }
      >
        <Ico n="sidebar" />
      </button>

      {/* ---------------- Sidebar ---------------- */}
      <aside
        className={
          "relative z-10 shrink-0 overflow-hidden border-r bg-bg-soft/92 backdrop-blur-sm transition-[width,border-color] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] " +
          (collapsed ? "w-0 border-transparent" : "w-[300px] border-hairline")
        }
      >
      <div
        className={
          "flex h-full w-[300px] flex-col transition-opacity duration-200 " +
          (collapsed ? "opacity-0" : "opacity-100 delay-100")
        }
      >
        {/* marca + controles */}
        <div className="flex h-12 items-center gap-1.5 px-3">
          <span className="mr-auto text-[17px] font-semibold tracking-tight text-ink">
            Papinho
          </span>
          <button
            onClick={() => setCollapsed(true)}
            title="recolher"
            aria-label="recolher barra lateral"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-dim transition-colors hover:bg-white/[0.06] hover:text-ink"
          >
            <Ico n="sidebar" />
          </button>
          <button
            onClick={() => {
              setSearchOn((v) => !v);
              setMenu(null);
            }}
            title="buscar conversas"
            aria-label="buscar"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-dim transition-colors hover:bg-white/[0.06] hover:text-ink"
          >
            <Ico n="search" />
          </button>
        </div>

            <button
              onClick={() => {
                setSection("inicio");
                setActiveId(null);
                setDraft("");
                setPending([]);
                setMenu(null);
              }}
              className={
                "mx-3 mb-1 flex items-center justify-center gap-1.5 rounded-full border border-hairline py-1.5 text-[12px] transition-colors " +
                (section === "inicio" && !active
                  ? "bg-hairline-strong text-ink"
                  : "text-ink-dim hover:text-ink")
              }
            >
              <Ico n="home" className="h-4 w-4" /> Início
            </button>

            {/* Novo */}
            <button
              onClick={newChat}
              className="pill mx-3 mb-1 mt-2.5 h-10 justify-center px-3 text-[13px]"
            >
              <Ico n="plus" className="h-[18px] w-[18px]" /> Novo chat
            </button>

            {/* navegação */}
            <nav className="mt-2 px-3">
              {NAV.map((it) => (
                <button
                  key={it.id}
                  onClick={() => {
                    setSection(it.id);
                    setMenu(null);
                  }}
                  className={
                    "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-[14px] transition-colors " +
                    (section === it.id
                      ? "bg-hairline text-ink"
                      : "text-ink-dim hover:bg-hairline hover:text-ink")
                  }
                >
                  <Ico n={it.ico} /> {it.label}
                </button>
              ))}
            </nav>

            {/* Conversas e tarefas */}
            <div className="mt-4 flex items-center gap-2 px-4 pb-1">
              <span className="text-[12px] text-ink-dim">Conversas e tarefas</span>
              <div className="relative ml-auto">
                <button
                  onClick={() =>
                    setMenu((m) => (m === "filter" ? null : "filter"))
                  }
                  title="filtros"
                  aria-label="filtros da lista"
                  className="flex h-7 w-7 items-center justify-center rounded-full text-ink-dim transition-colors hover:bg-white/[0.06] hover:text-ink"
                >
                  <Ico n="sliders" className="h-4 w-4" />
                </button>
                {menu === "filter" && (
                  <div className="absolute right-0 top-8 z-30 w-44 pop p-1">
                    <button
                      onClick={() => {
                        setSortDesc(true);
                        setMenu(null);
                      }}
                      className="block w-full rounded px-2 py-1.5 text-left text-[12px] text-ink hover:bg-white/[0.06]"
                    >
                      Mais recentes {sortDesc && "·"}
                    </button>
                    <button
                      onClick={() => {
                        setSortDesc(false);
                        setMenu(null);
                      }}
                      className="block w-full rounded px-2 py-1.5 text-left text-[12px] text-ink hover:bg-white/[0.06]"
                    >
                      Mais antigas {!sortDesc && "·"}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {searchOn && (
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.currentTarget.value)}
                placeholder="buscar…"
                className="mx-3 mb-1 rounded-full border border-hairline bg-black/20 px-3 py-1.5 text-[12px] text-ink outline-none placeholder:text-ink-dim focus:border-hairline-strong"
              />
            )}

            <div className="min-h-0 flex-1 overflow-auto px-2 pb-2">
              {sorted.length === 0 && (
                <p className="px-3 py-3 text-[12px] text-ink-dim">
                  {search ? "nada encontrado" : "nenhuma conversa ainda"}
                </p>
              )}
              {sorted.map((c) => (
                <div
                  key={c.id}
                  className={
                    "group flex items-center gap-2 rounded-lg px-3 py-2 transition-colors " +
                    (c.id === activeId && section === "inicio"
                      ? "bg-surface"
                      : "hover:bg-white/[0.04]")
                  }
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-ink-dim/50"
                    aria-hidden
                  />
                  <button
                    onClick={() => {
                      setActiveId(c.id);
                      setSection("inicio");
                    }}
                    className="min-w-0 flex-1 truncate text-left text-[13px] text-ink"
                    title={c.title}
                  >
                    {c.title}
                  </button>
                  <button
                    onClick={() => removeChat(c.id)}
                    title="apagar"
                    aria-label="apagar conversa"
                    className="shrink-0 text-ink-dim opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                  >
                    <Ico n="trash" className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
      </div>
      </aside>

      {/* ---------------- Área principal ---------------- */}
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <div className="absolute right-3 top-3 z-20">
          <button
            onClick={() => setMenu((m) => (m === "help" ? null : "help"))}
            title="ajuda e feedback"
            aria-label="ajuda"
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink-dim transition-colors hover:bg-white/[0.06] hover:text-ink"
          >
            <Ico n="help" />
          </button>
          {menu === "help" && (
            <div className="absolute right-0 top-11 w-56 pop p-3 text-[12px] text-ink-dim">
              Papinho — todos os seus agentes num chat só, usando o login que você já tem.
              Enter manda, Shift+Enter quebra linha.
            </div>
          )}
        </div>

        {section === "skills" ? (
          <ChatSkills />
        ) : section !== "inicio" ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <span className="text-[15px] font-semibold text-ink">
              {NAV.find((n) => n.id === section)?.label}
            </span>
            {(
              <p className="max-w-sm text-[13px] text-ink-dim">
                Em breve.
              </p>
            )}
          </div>
        ) : showThread ? (
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
            <div className="mx-auto flex max-w-[44rem] flex-col gap-10 px-6 py-10">
              {active!.msgs.map((m, i) =>
                m.role === "user" ? (
                  <div key={i} className="flex flex-col items-end gap-2">
                    {m.images && m.images.length > 0 && (
                      <div className="flex flex-wrap justify-end gap-2">
                        {m.images.map((src, k) => (
                          <img
                            key={k}
                            src={src}
                            alt=""
                            className="max-h-56 rounded-xl border border-hairline object-cover"
                          />
                        ))}
                      </div>
                    )}
                    {m.content && (
                      <div className="chat-serif max-w-[85%] whitespace-pre-wrap rounded-[20px] bg-surface/70 px-4 py-3 text-[15px] leading-[1.7] text-ink">
                        {m.content}
                      </div>
                    )}
                  </div>
                ) : (
                  <div
                    key={i}
                    className="group/msg chat-serif text-[15px] leading-[1.75] text-ink"
                  >
                    <div className="pixel mb-1.5 text-[9px] tracking-wider text-ink-dim">
                      {curModelName}
                    </div>
                    {m.content ? (
                      m.error ? (
                        <div className="rounded-md border border-danger/50 bg-danger/10 px-3 py-2 text-[13px] text-danger">
                          {m.content}
                        </div>
                      ) : (
                        <>
                          <Markdown text={m.content} />
                          <div className="mt-2 flex items-center gap-1 opacity-0 transition-opacity group-hover/msg:opacity-100">
                            <button
                              onClick={() => void copyMsg(m.content, i)}
                              title="copiar"
                              className="flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-ink-dim transition-colors hover:bg-white/[0.06] hover:text-ink"
                            >
                              {copied === i ? (
                                <>
                                  <IconCheck /> copiado
                                </>
                              ) : (
                                <>
                                  <IconCopy /> copiar
                                </>
                              )}
                            </button>
                          </div>
                        </>
                      )
                    ) : (
                      <span className="tok-counting text-ink-dim">
                        digitando…
                      </span>
                    )}
                  </div>
                ),
              )}
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 pb-4 text-center">
            <span
              aria-hidden
              className="logo-wobble-lg mb-8 h-16 w-16 shrink-0"
              style={{ backgroundImage: `url(${logoSheet})` }}
            />
            <span className="chat-serif text-[38px] leading-tight tracking-[-0.02em] text-ink">
              {name ? `Que bom ter você aqui, ${name}!` : "Que bom ter você aqui!"}
            </span>
            {!name && (
              <p className="mt-4 text-[12px] text-ink-dim">
                clica no seu nome aqui embaixo pra dizer como quer ser chamado.
              </p>
            )}
          </div>
        )}

        {/* ---------------- Compositor ---------------- */}
        {section === "inicio" && (
        <footer className="shrink-0 px-4 pb-6">
          <div className="mx-auto w-full max-w-[720px]">
            {pending.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {pending.map((p, k) => (
                  <div key={k} className="group relative">
                    <img
                      src={p.dataUrl}
                      alt={p.name}
                      className="h-16 w-16 rounded-xl border border-hairline object-cover"
                    />
                    <button
                      onClick={() =>
                        setPending((ps) => ps.filter((_, j) => j !== k))
                      }
                      className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-bg text-[11px] text-ink-dim ring-1 ring-line hover:text-danger"
                      title="tirar"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-[26px] border border-hairline bg-surface/80 backdrop-blur-sm transition-colors focus-within:border-hairline-strong">
              <textarea
                ref={taRef}
                value={draft}
                onChange={(e) => setDraft(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                rows={1}
                placeholder="Como posso ajudar você hoje?"
                className="block max-h-52 w-full resize-none bg-transparent px-5 pt-4 text-[16px] leading-[1.5] tracking-[-0.01em] text-ink outline-none placeholder:text-ink-dim"
              />

              <div className="flex items-center gap-1.5 px-2.5 pb-2.5 pt-1.5">
                {/* + anexos */}
                <div className="relative">
                  <button
                    onClick={() =>
                      setMenu((m) => (m === "attach" ? null : "attach"))
                    }
                    title="anexar"
                    aria-label="anexar"
                    className="flex h-9 w-9 items-center justify-center rounded-full text-ink-dim transition-colors hover:bg-white/[0.08] hover:text-ink"
                  >
                    <Ico n="plus" />
                  </button>
                  {menu === "attach" && (
                    <div className="absolute bottom-11 left-0 z-30 w-44 pop p-1">
                      <button
                        onClick={() => void attach()}
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] text-ink hover:bg-white/[0.06]"
                      >
                        <IconImage /> Imagem
                      </button>
                      <button
                        onClick={() => {
                          setMenu(null);
                          toast("outros anexos em breve.");
                        }}
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] text-ink-dim hover:bg-white/[0.06]"
                      >
                        <Ico n="folder" className="h-4 w-4" /> Arquivo · PDF
                      </button>
                    </div>
                  )}
                </div>

                <div className="ml-auto flex items-center gap-1">
                  {/* seletor de modelo + raciocínio */}
                  <div className="relative">
                    <button
                      onClick={() =>
                        setMenu((m) => (m === "model" ? null : "model"))
                      }
                      className="pill px-3 py-1 text-[12px] text-ink"
                    >
                      {curModelName}
                      <span className="text-ink-dim">
                        {curEffort ? "· estendido" : "· padrão"}
                      </span>
                      <Ico n="chevron" className="h-3.5 w-3.5 text-ink-dim" />
                    </button>
                    {menu === "model" && (
                      <div className="absolute bottom-12 right-0 z-30 w-[340px] pop p-3">
                        <p className="mb-2 px-1 text-[10px] uppercase tracking-[0.16em] text-ink-dim">
                          Modelo
                        </p>
                        <div className="flex flex-col gap-1">
                          {MODELS.map((m) => (
                            <button
                              key={m.id}
                              onClick={() => {
                                setModel(m.api);
                                setMenu(null);
                              }}
                              className={
                                "flex items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-hairline " +
                                (curModel === m.api ? "bg-hairline" : "")
                              }
                            >
                              <span
                                className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                                style={{ background: m.cor }}
                                aria-hidden
                              />
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-2">
                                  <span className="text-[13px] font-medium text-ink">
                                    {m.nome}
                                  </span>
                                  <span className="text-[11px] tabular-nums text-ink-dim">
                                    {m.precoM}
                                  </span>
                                  {curModel === m.api && (
                                    <span className="ml-auto text-primary">
                                      <IconCheck />
                                    </span>
                                  )}
                                </span>
                                <span className="mt-0.5 block text-[11px] leading-snug text-ink-dim">
                                  {m.melhorPra}
                                </span>
                              </span>
                            </button>
                          ))}
                        </div>
                        <p className="mb-2 mt-4 px-1 text-[10px] uppercase tracking-[0.16em] text-ink-dim">
                          Raciocínio
                        </p>
                        <div className="flex flex-wrap gap-1.5 px-1">
                          {EFFORTS.map((e) => (
                            <button
                              key={e}
                              onClick={() => {
                                setEffort(e);
                                setMenu(null);
                              }}
                              className={
                                "rounded-full px-3 py-1 text-[11px] transition-colors " +
                                (curEffort === e
                                  ? "bg-primary/15 text-primary"
                                  : "pill")
                              }
                            >
                              {EFFORT_LABEL[e].replace("pensar: ", "") || "padrão"}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>



                  {/* enviar */}
                  <button
                    onClick={() => void send()}
                    disabled={busy || (!draft.trim() && pending.length === 0)}
                    title="enviar"
                    aria-label="enviar"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-bg transition-opacity disabled:opacity-30"
                  >
                    {busy ? (
                      <span className="tok-counting text-[14px] leading-none">
                        •
                      </span>
                    ) : (
                      <IconArrowUp />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </footer>
        )}
      </div>

      {notice && (
        <div className="pointer-events-none absolute bottom-6 left-1/2 z-40 -translate-x-1/2 pop px-3 py-2 text-[12px] text-ink">
          {notice}
        </div>
      )}
    </div>
  );
}

/** aba HABILIDADES do chat — tabela das skills instaladas + navegar/adicionar,
 *  no espírito do painel de Skills do claude.ai. */
function ChatSkills() {
  const [items, setItems] = useState<InstalledSkill[]>([]);
  const [browse, setBrowse] = useState(false);
  const [q, setQ] = useState("");
  const [qOn, setQOn] = useState(false);

  useEffect(() => {
    invoke<InstalledSkill[]>("list_installed_skills")
      .then(setItems)
      .catch(() => {});
  }, [browse]);

  function reload() {
    invoke<InstalledSkill[]>("list_installed_skills")
      .then(setItems)
      .catch(() => {});
  }

  const authorOf = (name: string) =>
    SKILLS.find((s) => s.name === name)?.team ?? "—";
  const fmt = (secs?: number | null) =>
    secs ? new Date(secs * 1000).toLocaleDateString("pt-BR") : "—";

  const rows = items.filter((s) =>
    q.trim() ? s.name.toLowerCase().includes(q.trim().toLowerCase()) : true,
  );

  async function remove(name: string) {
    try {
      await invoke("remove_installed_skill", { name });
      reload();
    } catch (e) {
      console.error("[devterm] remover skill:", e);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b border-hairline px-5 py-3.5">
        <span className="text-[17px] font-semibold text-ink">Habilidades</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setQOn((v) => !v)}
            title="buscar"
            aria-label="buscar"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-dim transition-colors hover:bg-white/[0.06] hover:text-ink"
          >
            <Ico n="search" />
          </button>
          <button
            onClick={() => void openUrl("https://github.com/anthropics/skills")}
            title="saiba mais"
            aria-label="ajuda"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-dim transition-colors hover:bg-white/[0.06] hover:text-ink"
          >
            <Ico n="help" />
          </button>
          <button
            onClick={() => setBrowse((v) => !v)}
            className="pill px-3.5 py-1.5 text-[12px]"
          >
            {browse ? "Instaladas" : "Navegar"}
          </button>
          <button
            onClick={() => setBrowse(true)}
            className="rounded-full bg-primary px-3.5 py-1.5 text-[12px] font-medium text-bg transition-opacity hover:opacity-90"
          >
            Adicionar
          </button>
        </div>
      </header>

      {qOn && !browse && (
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.currentTarget.value)}
          placeholder="buscar habilidade…"
          className="mx-5 mt-3 rounded-full border border-hairline bg-black/20 px-3 py-1.5 text-[12px] text-ink outline-none placeholder:text-ink-dim focus:border-hairline-strong"
        />
      )}

      {browse ? (
        <div className="min-h-0 flex-1 overflow-auto p-5">
          <SkillsPanel />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto px-5 py-3">
          <div className="grid grid-cols-[1fr_150px_130px] gap-4 border-b border-hairline px-2 pb-2.5 text-[13px] text-ink-dim">
            <span>Habilidade</span>
            <span>Última atualização</span>
            <span>Autor</span>
          </div>
          {rows.map((s) => (
            <div
              key={s.name}
              className="group relative grid grid-cols-[1fr_150px_130px] items-center gap-4 border-b border-hairline px-2 py-3.5 text-[13px] transition-colors hover:bg-hairline"
            >
              <span className="truncate text-ink" title={s.description}>
                {s.name}
              </span>
              <span className="text-ink-dim">{fmt(s.modified)}</span>
              <span className="text-ink-dim">{authorOf(s.name)}</span>
              <button
                onClick={() => void remove(s.name)}
                title="remover"
                aria-label="remover habilidade"
                className="absolute right-2 flex h-7 w-7 items-center justify-center rounded-full text-ink-dim opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
              >
                <Ico n="trash" className="h-4 w-4" />
              </button>
            </div>
          ))}

          <div className="flex flex-col items-center gap-3 py-14 text-center">
            <Ico n="bulb" className="h-14 w-14 text-ink-dim/70" />
            <p className="max-w-xs text-[13px] leading-relaxed text-ink-dim">
              Adicione habilidades para estender as capacidades do Claude.
            </p>
            <button
              onClick={() => setBrowse(true)}
              className="rounded-full bg-primary px-4 py-2 text-[13px] font-medium text-bg transition-opacity hover:opacity-90"
            >
              Adicionar habilidade
            </button>
            <button
              onClick={() =>
                void openUrl(
                  "https://docs.claude.com/en/docs/claude-code/skills",
                )
              }
              className="rounded-lg px-3 py-1.5 text-[12px] text-ink-dim transition-colors hover:text-ink"
            >
              Saiba mais
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function IconImage() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  );
}

function IconCopy() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h8" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function IconArrowUp() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 19V5M6 11l6-6 6 6" />
    </svg>
  );
}

/** markdown mínimo → nós React (seguro, não injeta HTML). cobre code fences,
 *  `inline`, **negrito**, *itálico*, [link](url), títulos e listas. */
function mdInline(s: string, base: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)|(\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    const tok = m[0];
    const k = `${base}-${i++}`;
    if (tok.startsWith("`")) {
      out.push(
        <code
          key={k}
          className="rounded bg-white/10 px-1 py-0.5 text-[0.92em]"
        >
          {tok.slice(1, -1)}
        </code>,
      );
    } else if (tok.startsWith("**")) {
      out.push(<strong key={k}>{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith("*")) {
      out.push(<em key={k}>{tok.slice(1, -1)}</em>);
    } else {
      const mm = /\[([^\]]+)\]\(([^)\s]+)\)/.exec(tok);
      out.push(
        mm ? (
          <a
            key={k}
            href={mm[2]}
            onClick={(e) => {
              e.preventDefault();
              void openUrl(mm[2]);
            }}
            className="text-secondary underline"
          >
            {mm[1]}
          </a>
        ) : (
          tok
        ),
      );
    }
    last = m.index + tok.length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  text.split(/(```[\s\S]*?```)/g).forEach((part, pi) => {
    if (part.startsWith("```")) {
      const body = part.replace(/^```[^\n]*\n?/, "").replace(/\n?```$/, "");
      blocks.push(
        <pre
          key={`c${pi}`}
          className="overflow-x-auto rounded-md bg-black/40 p-3 text-[12.5px] leading-relaxed"
        >
          <code>{body}</code>
        </pre>,
      );
      return;
    }
    part.split(/\n{2,}/).forEach((para, qi) => {
      const t = para.trim();
      if (!t) return;
      const key = `p${pi}-${qi}`;
      const h = /^(#{1,4})\s+(.*)$/.exec(t);
      if (h) {
        const lvl = h[1].length;
        blocks.push(
          <p
            key={key}
            className={
              "font-bold " +
              (lvl <= 1
                ? "text-[16px]"
                : lvl === 2
                  ? "text-[15px]"
                  : "text-[14px]")
            }
          >
            {mdInline(h[2], key)}
          </p>,
        );
        return;
      }
      const lines = t.split("\n");
      if (lines.every((l) => /^\s*([-*]|\d+\.)\s+/.test(l))) {
        const ordered = /^\s*\d+\./.test(lines[0]);
        const items = lines.map((l, li) => (
          <li key={li}>
            {mdInline(l.replace(/^\s*([-*]|\d+\.)\s+/, ""), `${key}-${li}`)}
          </li>
        ));
        blocks.push(
          ordered ? (
            <ol key={key} className="list-decimal space-y-1 pl-5">
              {items}
            </ol>
          ) : (
            <ul key={key} className="list-disc space-y-1 pl-5">
              {items}
            </ul>
          ),
        );
        return;
      }
      const inner: ReactNode[] = [];
      lines.forEach((ln, li) => {
        inner.push(...mdInline(ln, `${key}-${li}`));
        if (li < lines.length - 1) inner.push(<br key={`br${li}`} />);
      });
      blocks.push(<p key={key}>{inner}</p>);
    });
  });
  return <div className="flex flex-col gap-3">{blocks}</div>;
}

type InstalledSkill = {
  name: string;
  description: string;
  path: string;
  modified?: number | null;
};

const SKILL_CATS = ["todas", ...Array.from(new Set(SKILLS.map((s) => s.cat)))];

function copy(text: string) {
  navigator.clipboard?.writeText(text).catch(() => {});
}


function SkillsPanel() {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("todas");
  const [showInstall, setShowInstall] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [installed, setInstalled] = useState<InstalledSkill[]>([]);
  const [showInstalled, setShowInstalled] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [skErr, setSkErr] = useState<string | null>(null);

  function loadInstalled() {
    invoke<InstalledSkill[]>("list_installed_skills")
      .then(setInstalled)
      .catch(() => setInstalled([]));
  }
  useEffect(loadInstalled, []);

  const installedNames = new Set(installed.map((s) => s.name));

  function did(label: string, text: string) {
    copy(text);
    setCopied(label);
    window.setTimeout(() => setCopied((c) => (c === label ? null : c)), 1200);
  }

  async function doInstall(name: string, repo: string, subdir: string) {
    setWorking(name);
    setSkErr(null);
    try {
      await invoke("install_skill", { repo, subdir, name });
      loadInstalled();
    } catch (e) {
      setSkErr(String(e));
    } finally {
      setWorking(null);
    }
  }
  async function doRemove(name: string) {
    if (!confirm(`remover a skill "${name}" de ~/.claude/skills?`)) return;
    setWorking(name);
    setSkErr(null);
    try {
      await invoke("remove_installed_skill", { name });
      loadInstalled();
    } catch (e) {
      setSkErr(String(e));
    } finally {
      setWorking(null);
    }
  }

  const list = SKILLS.filter((s) => {
    if (cat !== "todas" && s.cat !== cat) return false;
    if (!q.trim()) return true;
    const t = `${s.name} ${s.desc} ${s.team}`.toLowerCase();
    return t.includes(q.toLowerCase());
  });

  const cats = SKILL_CATS.filter((c) => c !== "todas");

  const ordered = [...list].sort(
    (a, b) => a.team.localeCompare(b.team) || a.name.localeCompare(b.name),
  );

  return (
    <div className="fade-up mx-auto max-w-4xl">
      {/* header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="pixel text-[14px] tracking-[0.14em] text-primary">
            HABILIDADES
          </p>
          <p className="mt-2.5 max-w-xl text-[14px] leading-relaxed text-ink-dim">
            receitas que o Claude carrega pra fazer a tarefa do jeito certo — o
            app instala sozinho as da Anthropic.
          </p>
        </div>
        <button
          onClick={() => setShowInstall((v) => !v)}
          className="btn-ock shrink-0 px-3.5 py-1.5 text-[11px]"
        >
          {showInstall ? "fechar" : "coleções git"}
        </button>
      </div>

      {showInstall && (
        <div className="fade-up mb-6 flex flex-col gap-2 rounded-md border border-hairline p-3">
          {SKILL_SOURCES.map((s) => (
            <div key={s.url} className="flex items-center gap-3 text-[13px]">
              <span className="flex-1 truncate text-ink-dim">{s.label}</span>
              <button
                onClick={() => did(s.url, s.cmd)}
                className="text-[12px] text-ink-dim hover:text-primary"
                title={s.cmd}
              >
                {copied === s.url ? "copiado" : "copiar git clone"}
              </button>
              <button
                onClick={() => openUrl(s.url).catch(() => {})}
                className="text-[12px] text-secondary hover:underline"
              >
                abrir
              </button>
            </div>
          ))}
        </div>
      )}

      {/* busca */}
      <input
        className="mb-4 w-full rounded-full border border-hairline bg-black/20 px-4 py-2.5 text-[15px] text-ink outline-none placeholder:text-ink-dim focus:border-hairline-strong"
        placeholder="buscar habilidade, time, o que faz…"
        value={q}
        onChange={(e) => setQ(e.currentTarget.value)}
      />

      {/* filtros de categoria */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {["todas", ...cats].map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={
              "rounded-full px-3 py-1 text-[12px] transition-colors " +
              (cat === c ? "bg-primary/15 text-primary" : "pill text-ink-dim")
            }
          >
            {c}
          </button>
        ))}
        <span className="ml-auto text-[12px] tabular-nums text-ink-dim">
          {list.length} / {SKILLS.length}
        </span>
      </div>

      {installed.length > 0 && (
        <div className="mb-6">
          <button
            onClick={() => setShowInstalled((v) => !v)}
            className="flex items-center gap-2 text-[12px] text-ink-dim transition-colors hover:text-ink"
          >
            <span className="text-success">●</span>
            {installed.length} instaladas
            <span className="text-[11px]">{showInstalled ? "▾" : "▸"}</span>
          </button>
          {showInstalled && (
            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
              {installed.map((s) => (
                <div
                  key={s.name}
                  className="flex items-center gap-3 rounded-md border border-hairline px-3 py-2.5 text-[13px]"
                >
                  <code className="shrink-0 text-success">/{s.name}</code>
                  <span className="min-w-0 flex-1 truncate text-ink-dim">
                    {s.description || "—"}
                  </span>
                  <button
                    onClick={() => doRemove(s.name)}
                    disabled={working === s.name}
                    className="shrink-0 text-[12px] text-ink-dim hover:text-danger disabled:opacity-40"
                  >
                    {working === s.name ? "…" : "remover"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {skErr && (
        <p className="mb-4 rounded-md border border-danger/60 bg-danger/10 px-3 py-2 text-[13px] text-danger">
          {skErr}
        </p>
      )}

      {/* grade de cartões */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {ordered.map((s, i) => {
          const isIn = installedNames.has(s.name);
          const source = skillSource(s);
          const busy = working === s.name;
          const logo = teamLogo(s.team);
          return (
            <div
              key={s.name}
              className="fade-up flex flex-col gap-2.5 rounded-md border border-hairline p-4 transition-colors hover:border-hairline-strong"
              style={{ animationDelay: `${Math.min(i, 10) * 16}ms` }}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="relative flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-[4px] bg-hairline text-[10px] uppercase text-ink-dim"
                  aria-hidden
                  title={s.team}
                >
                  {s.team[0]}
                  {logo && (
                    <img
                      src={logo}
                      alt=""
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-contain opacity-90"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  )}
                </span>
                <code
                  className="min-w-0 flex-1 truncate text-[14px] font-medium"
                  style={{
                    color: isIn
                      ? "var(--color-success)"
                      : "var(--color-primary)",
                  }}
                >
                  /{s.name}
                </code>
                {isIn && (
                  <span
                    className="shrink-0 text-[11px] text-success"
                    title="instalada"
                  >
                    ✓
                  </span>
                )}
              </div>

              <p className="min-h-[2.5em] text-[12.5px] leading-relaxed text-ink-dim">
                {s.desc}
              </p>

              <div className="mt-auto flex items-center gap-3 pt-1 text-[12px]">
                <span className="text-ink-dim/70">{s.team}</span>
                <span className="ml-auto flex items-center gap-3">
                  {isIn ? (
                    <button
                      onClick={() => doRemove(s.name)}
                      disabled={busy}
                      className="text-ink-dim hover:text-danger disabled:opacity-40"
                    >
                      {busy ? "…" : "remover"}
                    </button>
                  ) : source ? (
                    <button
                      onClick={() =>
                        doInstall(s.name, source.repo, source.subdir)
                      }
                      disabled={busy}
                      className="rounded-full border border-primary/50 px-3 py-1 text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
                    >
                      {busy ? "…" : "instalar"}
                    </button>
                  ) : null}
                  <button
                    onClick={() => did(s.name, `/${s.name}`)}
                    className="text-ink-dim hover:text-primary"
                  >
                    {copied === s.name ? "copiado" : "copiar"}
                  </button>
                  {s.src && (
                    <button
                      onClick={() => openUrl(s.src!).catch(() => {})}
                      className="text-secondary hover:underline"
                    >
                      fonte
                    </button>
                  )}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {list.length === 0 && (
        <p className="py-16 text-center text-[15px] text-ink-dim">
          nada com "{q}"
        </p>
      )}
    </div>
  );
}

/* ---------- barra lateral minimalista ---------- */

