/**
 * Tarefas agendadas do Papinho ("Programado").
 *
 * Uma tarefa é um prompt que roda sozinho na hora marcada e vira um chat novo
 * — o resultado fica na lista de conversas, esperando você ler.
 *
 * O agendador vive no app (não há daemon): só dispara com o Papinho aberto.
 * Por isso `lastRun` é guardado — ao voltar, uma tarefa cujo horário passou
 * enquanto o app estava fechado aparece como "atrasada" em vez de disparar um
 * monte de coisa de uma vez.
 */

export type Freq = "diaria" | "uteis" | "semanal" | "unica";

export type Task = {
  id: string;
  title: string;
  /** o que o Papinho recebe na hora marcada */
  prompt: string;
  freq: Freq;
  /** 0=domingo … 6=sábado, só para `semanal` */
  weekday: number;
  /** "HH:MM" */
  time: string;
  paused: boolean;
  /** timestamp da última execução (undefined = nunca rodou) */
  lastRun?: number;
  createdAt: number;
};

const KEY = "papinho.tasks";

export function load(): Task[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? (arr as Task[]) : [];
  } catch {
    return [];
  }
}

export function save(tasks: Task[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(tasks));
  } catch {
    /* modo privado — ignora */
  }
  try {
    window.dispatchEvent(new CustomEvent("papinho:tasks"));
  } catch {
    /* SSR / testes */
  }
}

export function subscribe(fn: () => void): () => void {
  window.addEventListener("papinho:tasks", fn);
  return () => window.removeEventListener("papinho:tasks", fn);
}

export function uid(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID)
      return crypto.randomUUID();
  } catch {
    /* segue pro fallback */
  }
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

const WEEKDAYS = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

/** "Dias úteis às 8:00", "Toda sexta-feira às 16:00"… */
export function scheduleLabel(t: Task): string {
  const [h, m] = t.time.split(":");
  const hora = `${Number(h)}:${m}`;
  if (t.freq === "diaria") return `Todo dia às ${hora}`;
  if (t.freq === "uteis") return `Dias úteis às ${hora}`;
  if (t.freq === "semanal") return `Toda ${WEEKDAYS[t.weekday]} às ${hora}`;
  return `Uma vez, às ${hora}`;
}

/** Próxima execução depois de `from`. `null` quando não há mais nenhuma
 *  (tarefa de uma vez só que já rodou). */
export function nextRun(t: Task, from = Date.now()): number | null {
  const [h, m] = t.time.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;

  const at = (d: Date) => {
    const x = new Date(d);
    x.setHours(h, m, 0, 0);
    return x.getTime();
  };

  if (t.freq === "unica") {
    const hoje = at(new Date(from));
    if (t.lastRun) return null;
    // já passou da hora hoje? então é pra amanhã
    return hoje > from ? hoje : hoje + 86_400_000;
  }

  // procura o próximo dia que serve, começando por hoje
  for (let i = 0; i < 14; i++) {
    const d = new Date(from);
    d.setDate(d.getDate() + i);
    const when = at(d);
    if (when <= from) continue;
    const dow = d.getDay();
    if (t.freq === "uteis" && (dow === 0 || dow === 6)) continue;
    if (t.freq === "semanal" && dow !== t.weekday) continue;
    return when;
  }
  return null;
}

/** Está na hora de rodar? Só conta se ainda não rodou nesta ocorrência. */
export function isDue(t: Task, now = Date.now()): boolean {
  if (t.paused) return false;
  // a ocorrência de agora é a última que já passou: olha 25h pra trás
  const prev = nextRun(t, now - 25 * 3_600_000);
  if (prev === null || prev > now) return false;
  // tolerância: se o app ficou fechado por muito tempo, não dispara atrasado
  if (now - prev > 6 * 3_600_000) return false;
  return !t.lastRun || t.lastRun < prev;
}

/** "em 3 h", "amanhã às 8:00", "atrasada" — texto curto pra lista. */
export function whenLabel(t: Task, now = Date.now()): string {
  if (t.paused) return "pausada";
  const next = nextRun(t, now);
  if (next === null) return "concluída";
  const diff = next - now;
  const min = Math.round(diff / 60_000);
  if (min < 60) return `em ${Math.max(min, 1)} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `em ${h} h`;
  const dias = Math.round(h / 24);
  return dias === 1 ? "amanhã" : `em ${dias} dias`;
}

export type Suggestion = {
  icon: string;
  title: string;
  desc: string;
  prompt: string;
  freq: Freq;
  weekday: number;
  time: string;
};

/** Sugestões da tela vazia. Todas são coisas que o Papinho faz de verdade —
 *  ele é só conversa, não tem acesso a calendário, e-mail nem arquivos. */
export const SUGGESTIONS: Suggestion[] = [
  {
    icon: "sun",
    title: "Plano do dia",
    desc: "Um empurrão de manhã: por onde começar e o que deixar pra depois.",
    prompt:
      "Bom dia! Me ajuda a organizar o dia: pergunta o que eu tenho pra hoje e me devolve uma ordem de ataque curta, com o que priorizar e o que dá pra deixar pra depois.",
    freq: "uteis",
    weekday: 1,
    time: "08:00",
  },
  {
    icon: "bulb",
    title: "Ideias de conteúdo",
    desc: "Algumas ideias de post por semana sobre os assuntos que você acompanha.",
    prompt:
      "Me traz 5 ideias de post pra esta semana sobre os assuntos que eu venho acompanhando. Cada uma com um ângulo diferente e uma primeira frase pronta.",
    freq: "semanal",
    weekday: 1,
    time: "09:00",
  },
  {
    icon: "check",
    title: "Revisão semanal",
    desc: "Uma retrospectiva de sexta pra fechar a semana e apontar a próxima.",
    prompt:
      "É sexta: me guia numa retrospectiva curta da semana. Pergunta o que avançou, o que travou e o que fica pra próxima, e me devolve um resumo em tópicos.",
    freq: "semanal",
    weekday: 5,
    time: "16:00",
  },
  {
    icon: "book",
    title: "Estudo diário",
    desc: "Um conceito novo por dia sobre o tema que você escolher, explicado do zero.",
    prompt:
      "Me ensina um conceito novo hoje sobre o tema que eu vier a escolher. Explica do zero, com um exemplo prático e uma pergunta no fim pra eu testar se entendi.",
    freq: "diaria",
    weekday: 1,
    time: "09:00",
  },
  {
    icon: "chat",
    title: "Prática de inglês",
    desc: "Uma conversa curta em inglês pra treinar, com correções no fim.",
    prompt:
      "Let's practice English: puxa uma conversa curta comigo sobre um assunto do dia a dia, me corrige no fim e lista os erros que eu repeti.",
    freq: "uteis",
    weekday: 1,
    time: "19:00",
  },
  {
    icon: "spark",
    title: "Brainstorm do projeto",
    desc: "Ângulos novos pro que você está construindo, sem ficar puxando saco.",
    prompt:
      "Quero um brainstorm sobre o projeto que eu estou tocando. Pergunta em que pé está e me traz ângulos que eu provavelmente não considerei — inclusive os incômodos.",
    freq: "semanal",
    weekday: 3,
    time: "14:00",
  },
];

export function fromSuggestion(s: Suggestion): Task {
  return {
    id: uid(),
    title: s.title,
    prompt: s.prompt,
    freq: s.freq,
    weekday: s.weekday,
    time: s.time,
    paused: false,
    createdAt: Date.now(),
  };
}
