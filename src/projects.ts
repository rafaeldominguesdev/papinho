/**
 * Projetos do Papinho: uma pasta de conversas com instruções próprias.
 *
 * As instruções do projeto entram no system prompt de toda conversa criada
 * dentro dele (`chatSystemExtra` do envio) — é o que faz o Papinho "vestir"
 * o contexto do projeto sem você repetir tudo a cada chat.
 */

export type Project = {
  id: string;
  name: string;
  /** instruções que valem pra toda conversa do projeto */
  instructions: string;
  createdAt: number;
};

const KEY = "papinho.projects";

export function load(): Project[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? (arr as Project[]) : [];
  } catch {
    return [];
  }
}

export function save(list: Project[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* modo privado — ignora */
  }
  try {
    window.dispatchEvent(new CustomEvent("papinho:projects"));
  } catch {
    /* SSR / testes */
  }
}

export function subscribe(fn: () => void): () => void {
  window.addEventListener("papinho:projects", fn);
  return () => window.removeEventListener("papinho:projects", fn);
}

export function uid(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID)
      return crypto.randomUUID();
  } catch {
    /* segue pro fallback */
  }
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
