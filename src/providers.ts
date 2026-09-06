/**
 * As IAs disponíveis pro chat. O catálogo mora no Rust (`engine/providers.rs`)
 * porque é lá que dá pra olhar a PATH e ver quais CLIs a pessoa já tem.
 *
 * Conectar uma IA nova é instalar a CLI dela e logar — o Papinho não guarda
 * chave de API, ele reaproveita o login que já existe na máquina.
 */

import { invoke } from "@tauri-apps/api/core";

export type ProviderModel = { id: string; label: string; arg: string };
export type Provider = {
  id: string;
  company: string;
  product: string;
  bin: string;
  install: string;
  login: string;
  free: boolean;
  models: ProviderModel[];
  installed: boolean;
  path: string;
};

let cache: Provider[] | null = null;
const listeners = new Set<(p: Provider[]) => void>();

export async function refresh(): Promise<Provider[]> {
  const list = await invoke<Provider[]>("list_providers");
  cache = list;
  for (const fn of listeners) fn(list);
  return list;
}

export function get(): Provider[] {
  return cache ?? [];
}

export function subscribe(fn: (p: Provider[]) => void): () => void {
  listeners.add(fn);
  if (cache) fn(cache);
  else void refresh().catch(() => {});
  return () => {
    listeners.delete(fn);
  };
}

/** rótulo curto do modelo em uso ("Sonnet", "Astra 6"…) */
export function modelLabel(providerId: string, arg: string): string {
  const p = get().find((x) => x.id === providerId);
  const m = p?.models.find((x) => x.arg === arg);
  return m?.label ?? p?.models[0]?.label ?? "Modelo";
}

export function companyOf(providerId: string): string {
  return get().find((x) => x.id === providerId)?.company ?? "";
}

/** cor da marca de cada empresa — a mesma linguagem do DevTerm */
export const BRAND: Record<string, string> = {
  claude: "#d97757",
  codex: "#10b981",
  gemini: "#4285f4",
  antigravity: "#b98cff",
  cursor: "#d8d8d8",
  grok: "#38bdf8",
};
