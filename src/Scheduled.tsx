import { useEffect, useMemo, useState } from "react";
import { Ico } from "./Ico";
import * as tasks from "./tasks";
import type { Task } from "./tasks";

/* ============================== PROGRAMADO ==============================
   Tarefas que rodam sozinhas na hora marcada e viram um chat novo.

   O agendador vive no App (`useEffect` com um tique de meio minuto): não há
   daemon, então as tarefas só disparam com o Papinho aberto. É uma limitação
   honesta — melhor do que prometer um cron que o app não tem. */

const ORDERS = [
  { id: "next", label: "Próxima execução" },
  { id: "name", label: "Nome" },
  { id: "new", label: "Criadas recentemente" },
] as const;
type Order = (typeof ORDERS)[number]["id"];

const FREQS: { id: tasks.Freq; label: string }[] = [
  { id: "diaria", label: "todo dia" },
  { id: "uteis", label: "dias úteis" },
  { id: "semanal", label: "toda semana" },
  { id: "unica", label: "uma vez" },
];
const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export function Scheduled({ onRun }: { onRun: (t: Task) => void }) {
  const [list, setList] = useState<Task[]>(() => tasks.load());
  const [q, setQ] = useState("");
  const [qOn, setQOn] = useState(false);
  const [order, setOrder] = useState<Order>("next");
  const [orderOpen, setOrderOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => tasks.subscribe(() => setList(tasks.load())), []);
  // só pra "em 3 h" não ficar velho na tela
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const commit = (next: Task[]) => {
    setList(next);
    tasks.save(next);
  };

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    const arr = list.filter((t) =>
      term ? `${t.title} ${t.prompt}`.toLowerCase().includes(term) : true,
    );
    return arr.sort((a, b) => {
      if (order === "name") return a.title.localeCompare(b.title);
      if (order === "new") return b.createdAt - a.createdAt;
      const na = tasks.nextRun(a) ?? Infinity;
      const nb = tasks.nextRun(b) ?? Infinity;
      return na - nb;
    });
    // `tick` entra de propósito: reordena junto com o relógio
  }, [list, q, order, tick]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[62rem] px-8 py-10">
        {/* ---- cabeçalho ---- */}
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="chat-serif text-[34px] leading-tight tracking-[-0.01em] text-ink">
              Tarefas agendadas
            </h1>
            <p className="mt-1.5 text-[13px] text-ink-dim">
              Rode tarefas na hora marcada ou sempre que precisar delas.
            </p>
          </div>

          <div className="flex items-center gap-2 pt-1.5">
            {qOn ? (
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.currentTarget.value)}
                onBlur={() => !q && setQOn(false)}
                placeholder="buscar tarefa"
                className="h-9 w-48 rounded-full border border-hairline bg-transparent px-4 text-[12px] text-ink outline-none placeholder:text-ink-dim focus:border-hairline-strong"
              />
            ) : (
              <button
                onClick={() => setQOn(true)}
                title="buscar"
                aria-label="buscar"
                className="flex h-9 w-9 items-center justify-center rounded-full text-ink-dim transition-colors hover:bg-white/[0.06] hover:text-ink"
              >
                <Ico n="search" />
              </button>
            )}

            <div className="relative">
              <button
                onClick={() => setOrderOpen((v) => !v)}
                className="flex h-9 items-center gap-1.5 rounded-full bg-surface px-4 text-[12px] text-ink-dim transition-colors hover:text-ink"
              >
                Ordenar por{" "}
                <span className="text-ink">
                  {ORDERS.find((o) => o.id === order)?.label}
                </span>
                <Ico n="chevron" className="h-3.5 w-3.5" />
              </button>
              {orderOpen && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setOrderOpen(false)}
                  />
                  <div className="absolute right-0 top-11 z-40 w-52 pop p-1">
                    {ORDERS.map((o) => (
                      <button
                        key={o.id}
                        onClick={() => {
                          setOrder(o.id);
                          setOrderOpen(false);
                        }}
                        className={
                          "block w-full rounded px-2.5 py-1.5 text-left text-[12px] hover:bg-white/[0.06] " +
                          (order === o.id ? "text-primary" : "text-ink")
                        }
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <button
              onClick={() =>
                setEditing({
                  id: tasks.uid(),
                  title: "",
                  prompt: "",
                  freq: "diaria",
                  weekday: 1,
                  time: "09:00",
                  paused: false,
                  createdAt: Date.now(),
                })
              }
              className="h-9 rounded-full bg-ink px-4 text-[12px] font-medium text-bg transition-opacity hover:opacity-90"
            >
              Nova tarefa
            </button>
          </div>
        </div>

        {/* ---- tarefas ---- */}
        {shown.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-24">
            <span className="text-ink-dim/70">
              <Ico n="stopwatch" className="h-16 w-16" />
            </span>
            <p className="text-[13px] text-ink-dim">
              {list.length === 0
                ? "Nenhuma tarefa agendada ainda."
                : "Nenhuma tarefa com esse nome."}
            </p>
          </div>
        ) : (
          <div className="mt-10 flex flex-col">
            {shown.map((t) => (
              <div
                key={t.id}
                className="group/task flex items-start gap-3 border-b border-hairline py-4 last:border-0"
              >
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface text-ink-dim">
                  <Ico n="clock" className="h-[18px] w-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <button
                    onClick={() => setEditing(t)}
                    className="block max-w-full truncate text-left text-[14px] text-ink hover:underline"
                  >
                    {t.title}
                  </button>
                  <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-ink-dim">
                    {t.prompt}
                  </p>
                  <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-ink-dim">
                    <Ico n="clock" className="h-3.5 w-3.5" />
                    {tasks.scheduleLabel(t)}
                    <span className="text-ink-dim/60">
                      · {tasks.whenLabel(t)}
                    </span>
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover/task:opacity-100">
                  <button
                    onClick={() => onRun(t)}
                    title="rodar agora"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-ink-dim hover:bg-white/[0.06] hover:text-ink"
                  >
                    <Ico n="play" className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() =>
                      commit(
                        list.map((x) =>
                          x.id === t.id ? { ...x, paused: !x.paused } : x,
                        ),
                      )
                    }
                    title={t.paused ? "retomar" : "pausar"}
                    className={
                      "flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/[0.06] " +
                      (t.paused ? "text-primary" : "text-ink-dim hover:text-ink")
                    }
                  >
                    <Ico n={t.paused ? "play" : "pause"} className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => commit(list.filter((x) => x.id !== t.id))}
                    title="excluir"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-ink-dim hover:bg-white/[0.06] hover:text-danger"
                  >
                    <Ico n="trash" className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ---- sugestões ---- */}
        <div className="mt-14">
          <Squiggle />
          <div className="mt-10 grid grid-cols-1 gap-x-10 gap-y-7 md:grid-cols-2">
            {tasks.SUGGESTIONS.map((s) => (
              <button
                key={s.title}
                onClick={() => commit([...list, tasks.fromSuggestion(s)])}
                className="group/sug flex items-start gap-3.5 rounded-xl p-2 text-left transition-colors hover:bg-white/[0.03]"
              >
                <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface text-ink-dim transition-colors group-hover/sug:text-ink">
                  <Ico n={s.icon} className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[14px] text-ink">{s.title}</span>
                  <span className="mt-0.5 block text-[12.5px] leading-relaxed text-ink-dim">
                    {s.desc}
                  </span>
                  <span className="mt-1.5 flex items-center gap-1.5 text-[11px] text-ink-dim">
                    <Ico n="clock" className="h-3.5 w-3.5" />
                    {tasks.scheduleLabel({
                      ...tasks.fromSuggestion(s),
                    })}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {editing && (
        <TaskForm
          task={editing}
          onClose={() => setEditing(null)}
          onSave={(t) => {
            const exists = list.some((x) => x.id === t.id);
            commit(exists ? list.map((x) => (x.id === t.id ? t : x)) : [...list, t]);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

/** a linha ondulada que separa as tarefas das sugestões */
function Squiggle() {
  return (
    <svg
      className="h-2.5 w-full text-hairline-strong"
      viewBox="0 0 100 10"
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <pattern id="wave" width="4" height="10" patternUnits="userSpaceOnUse">
          <path
            d="M0 5 Q 1 1.5 2 5 T 4 5"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.7"
          />
        </pattern>
      </defs>
      <rect width="100" height="10" fill="url(#wave)" />
    </svg>
  );
}

function TaskForm({
  task,
  onSave,
  onClose,
}: {
  task: Task;
  onSave: (t: Task) => void;
  onClose: () => void;
}) {
  const [t, setT] = useState<Task>(task);
  const ok = t.title.trim() && t.prompt.trim();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm">
      <div className="fade-up w-full max-w-lg pop p-5">
        <h2 className="chat-serif text-[20px] text-ink">
          {task.title ? "Editar tarefa" : "Nova tarefa"}
        </h2>

        <label className="mt-5 block text-[11px] uppercase tracking-[0.16em] text-ink-dim">
          nome
        </label>
        <input
          autoFocus
          value={t.title}
          onChange={(e) => setT({ ...t, title: e.currentTarget.value })}
          placeholder="Plano do dia"
          className="mt-1.5 h-10 w-full rounded-lg border border-hairline bg-bg px-3 text-[13px] text-ink outline-none placeholder:text-ink-dim focus:border-hairline-strong"
        />

        <label className="mt-4 block text-[11px] uppercase tracking-[0.16em] text-ink-dim">
          o que o Papinho deve fazer
        </label>
        <textarea
          value={t.prompt}
          onChange={(e) => setT({ ...t, prompt: e.currentTarget.value })}
          rows={4}
          placeholder="Escreve como se estivesse pedindo na conversa."
          className="mt-1.5 w-full resize-none rounded-lg border border-hairline bg-bg px-3 py-2 text-[13px] leading-relaxed text-ink outline-none placeholder:text-ink-dim focus:border-hairline-strong"
        />

        <label className="mt-4 block text-[11px] uppercase tracking-[0.16em] text-ink-dim">
          quando
        </label>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {FREQS.map((f) => (
            <button
              key={f.id}
              onClick={() => setT({ ...t, freq: f.id })}
              className={
                "rounded-full px-3 py-1 text-[11px] transition-colors " +
                (t.freq === f.id ? "bg-primary/15 text-primary" : "pill")
              }
            >
              {f.label}
            </button>
          ))}
          <input
            type="time"
            value={t.time}
            onChange={(e) => setT({ ...t, time: e.currentTarget.value })}
            className="ml-auto h-8 rounded-full border border-hairline bg-transparent px-3 text-[12px] text-ink outline-none focus:border-hairline-strong"
          />
        </div>
        {t.freq === "semanal" && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {DIAS.map((d, i) => (
              <button
                key={d}
                onClick={() => setT({ ...t, weekday: i })}
                className={
                  "rounded-full px-2.5 py-1 text-[11px] transition-colors " +
                  (t.weekday === i ? "bg-primary/15 text-primary" : "pill")
                }
              >
                {d}
              </button>
            ))}
          </div>
        )}

        <p className="mt-4 text-[11px] leading-relaxed text-ink-dim">
          As tarefas rodam com o Papinho aberto — ele não deixa nada rodando em
          segundo plano quando você fecha o app.
        </p>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="pill px-4 py-1.5 text-[12px] text-ink-dim"
          >
            cancelar
          </button>
          <button
            disabled={!ok}
            onClick={() => onSave({ ...t, title: t.title.trim() })}
            className="rounded-full bg-ink px-4 py-1.5 text-[12px] font-medium text-bg transition-opacity disabled:opacity-30"
          >
            salvar
          </button>
        </div>
      </div>
    </div>
  );
}
