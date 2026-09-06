import { useEffect, useMemo, useState } from "react";
import { Ico } from "./Ico";
import * as projects from "./projects";
import type { Project } from "./projects";

/* =============================== PROJETOS ===============================
   Pasta de conversas com instruções próprias: tudo que você abre dentro do
   projeto já nasce sabendo do que se trata (as instruções vão no system
   prompt da conversa). */

export function Projects({
  chatCount,
  onOpen,
  onNewChat,
}: {
  /** quantas conversas cada projeto tem, por id */
  chatCount: Record<string, number>;
  /** abrir a lista de conversas do projeto (filtra a sidebar) */
  onOpen: (p: Project) => void;
  /** começar uma conversa nova dentro do projeto */
  onNewChat: (p: Project) => void;
}) {
  const [list, setList] = useState<Project[]>(() => projects.load());
  const [q, setQ] = useState("");
  const [qOn, setQOn] = useState(false);
  const [recent, setRecent] = useState(true);
  const [editing, setEditing] = useState<Project | null>(null);

  useEffect(() => projects.subscribe(() => setList(projects.load())), []);

  const commit = (next: Project[]) => {
    setList(next);
    projects.save(next);
  };

  const novo = () =>
    setEditing({
      id: projects.uid(),
      name: "",
      instructions: "",
      createdAt: Date.now(),
    });

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return list
      .filter((p) =>
        term ? `${p.name} ${p.instructions}`.toLowerCase().includes(term) : true,
      )
      .sort((a, b) =>
        recent ? b.createdAt - a.createdAt : a.name.localeCompare(b.name),
      );
  }, [list, q, recent]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[62rem] px-8 py-10">
        <div className="flex items-start gap-3">
          <h1 className="chat-serif min-w-0 flex-1 text-[34px] leading-tight tracking-[-0.01em] text-ink">
            Projetos
          </h1>
          <div className="flex items-center gap-2 pt-1.5">
            {qOn ? (
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.currentTarget.value)}
                onBlur={() => !q && setQOn(false)}
                placeholder="buscar projeto"
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
            <button
              onClick={() => setRecent((v) => !v)}
              title={recent ? "ordenado por recentes" : "ordenado por nome"}
              aria-label="ordenar"
              className="flex h-9 w-9 items-center justify-center rounded-full text-ink-dim transition-colors hover:bg-white/[0.06] hover:text-ink"
            >
              <Ico n="sort" />
            </button>
            <button
              onClick={novo}
              className="h-9 rounded-full bg-ink px-4 text-[12px] font-medium text-bg transition-opacity hover:opacity-90"
            >
              Novo projeto
            </button>
          </div>
        </div>

        {shown.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-28 text-center">
            <span className="text-ink-dim/70">
              <Ico n="blocks" className="h-14 w-14" />
            </span>
            <p className="text-[14px] text-ink">
              {list.length ? "Nenhum projeto com esse nome." : "Quer começar um projeto?"}
            </p>
            <p className="max-w-sm text-[13px] leading-relaxed text-ink-dim">
              Dê instruções próprias e junte as conversas de um mesmo assunto
              em um só lugar.
            </p>
            <button
              onClick={novo}
              className="mt-1 rounded-lg bg-surface px-4 py-2 text-[13px] text-ink transition-colors hover:bg-white/[0.09]"
            >
              Novo projeto
            </button>
          </div>
        ) : (
          <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((p) => (
              <div
                key={p.id}
                className="group/proj flex flex-col rounded-xl border border-hairline bg-surface/60 p-4 transition-colors hover:border-hairline-strong"
              >
                <button
                  onClick={() => onOpen(p)}
                  className="flex items-start gap-3 text-left"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-bg-soft text-ink-dim">
                    <Ico n="folder" className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] text-ink">
                      {p.name}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-ink-dim">
                      {chatCount[p.id] ?? 0}{" "}
                      {(chatCount[p.id] ?? 0) === 1 ? "conversa" : "conversas"}
                    </span>
                  </span>
                </button>
                {p.instructions && (
                  <p className="mt-3 line-clamp-3 text-[12px] leading-relaxed text-ink-dim">
                    {p.instructions}
                  </p>
                )}
                <div className="mt-3 flex items-center gap-1 opacity-0 transition-opacity group-hover/proj:opacity-100">
                  <button
                    onClick={() => onNewChat(p)}
                    className="pill px-2.5 py-1 text-[11px] text-ink-dim hover:text-ink"
                  >
                    <Ico n="plus" className="h-3.5 w-3.5" /> conversa
                  </button>
                  <button
                    onClick={() => setEditing(p)}
                    className="pill px-2.5 py-1 text-[11px] text-ink-dim hover:text-ink"
                  >
                    <Ico n="pencil" className="h-3.5 w-3.5" /> instruções
                  </button>
                  <button
                    onClick={() => commit(list.filter((x) => x.id !== p.id))}
                    title="excluir projeto"
                    className="ml-auto flex h-7 w-7 items-center justify-center rounded-full text-ink-dim hover:bg-white/[0.06] hover:text-danger"
                  >
                    <Ico n="trash" className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <ProjectForm
          project={editing}
          onClose={() => setEditing(null)}
          onSave={(p) => {
            const exists = list.some((x) => x.id === p.id);
            commit(exists ? list.map((x) => (x.id === p.id ? p : x)) : [...list, p]);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function ProjectForm({
  project,
  onSave,
  onClose,
}: {
  project: Project;
  onSave: (p: Project) => void;
  onClose: () => void;
}) {
  const [p, setP] = useState<Project>(project);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm">
      <div className="fade-up w-full max-w-lg pop p-5">
        <h2 className="chat-serif text-[20px] text-ink">
          {project.name ? "Instruções do projeto" : "Novo projeto"}
        </h2>

        <label className="mt-5 block text-[11px] uppercase tracking-[0.16em] text-ink-dim">
          nome
        </label>
        <input
          autoFocus
          value={p.name}
          onChange={(e) => setP({ ...p, name: e.currentTarget.value })}
          placeholder="Papinho"
          className="mt-1.5 h-10 w-full rounded-lg border border-hairline bg-bg px-3 text-[13px] text-ink outline-none placeholder:text-ink-dim focus:border-hairline-strong"
        />

        <label className="mt-4 block text-[11px] uppercase tracking-[0.16em] text-ink-dim">
          instruções
        </label>
        <textarea
          value={p.instructions}
          onChange={(e) => setP({ ...p, instructions: e.currentTarget.value })}
          rows={6}
          placeholder="O que o Papinho precisa saber toda vez que você conversar dentro deste projeto: o contexto, o tom, o que evitar."
          className="mt-1.5 w-full resize-none rounded-lg border border-hairline bg-bg px-3 py-2 text-[13px] leading-relaxed text-ink outline-none placeholder:text-ink-dim focus:border-hairline-strong"
        />

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="pill px-4 py-1.5 text-[12px] text-ink-dim"
          >
            cancelar
          </button>
          <button
            disabled={!p.name.trim()}
            onClick={() => onSave({ ...p, name: p.name.trim() })}
            className="rounded-full bg-ink px-4 py-1.5 text-[12px] font-medium text-bg transition-opacity disabled:opacity-30"
          >
            salvar
          </button>
        </div>
      </div>
    </div>
  );
}
