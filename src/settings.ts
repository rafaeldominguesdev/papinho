/**
 * Configuração do Papinho — store simples em localStorage.
 * (No DevTerm isso é um store grande; aqui só o que o chat usa.)
 */

import { useSyncExternalStore } from "react";

export type Settings = {
  /** como a pessoa quer ser chamada (vai pro system prompt) */
  chatName: string;
  /** modelo padrão de conversa nova */
  chatModel: string;
  /** nível de raciocínio padrão ("" = padrão do modelo) */
  chatEffort: string;
  /** instrução extra anexada ao system prompt */
  chatSystemExtra: string;
};

export const DEFAULTS: Settings = {
  chatName: "",
  chatModel: "claude-sonnet-5",
  chatEffort: "",
  chatSystemExtra: "",
};

const KEY = "papinho.settings";
let cache: Settings | null = null;

function load(): Settings {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    cache = { ...DEFAULTS };
  }
  return cache!;
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* modo privado — ignora */
  }
}

type Key = keyof Settings | "*";
const listeners = new Set<(k: Key) => void>();

export function subscribe(fn: (k: Key) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(k: Key) {
  for (const fn of listeners) fn(k);
  try {
    window.dispatchEvent(new CustomEvent("papinho:settings", { detail: k }));
    if (k === "chatName" || k === "*") {
      window.dispatchEvent(
        new CustomEvent("papinho:chat-name", { detail: load().chatName }),
      );
    }
  } catch {
    /* SSR / testes */
  }
}

export function getAll(): Settings {
  return { ...load() };
}
export function get<K extends keyof Settings>(k: K): Settings[K] {
  return load()[k];
}
export function set<K extends keyof Settings>(k: K, v: Settings[K]) {
  load()[k] = v;
  persist();
  emit(k);
}
export function reset() {
  cache = { ...DEFAULTS };
  persist();
  emit("*");
}

/** hook React: re-renderiza quando a chave muda. */
export function useSetting<K extends keyof Settings>(k: K): Settings[K] {
  return useSyncExternalStore(
    (cb) =>
      subscribe((changed) => {
        if (changed === k || changed === "*") cb();
      }),
    () => get(k),
  );
}

export const getChatName = () => get("chatName");
export const setChatName = (n: string) =>
  set("chatName", n.trim().slice(0, 40));
