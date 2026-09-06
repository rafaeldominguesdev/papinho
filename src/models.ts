export type ModelId = "haiku" | "sonnet" | "opus" | "fable";

export type ModelSpec = {
  id: ModelId;
  nome: string;
  api: string;
  cor: string;
  melhorPra: string;
  precoM: string; // rótulo "in / out" por 1M tokens
  priceIn: number; // USD por 1M tokens de entrada
  priceOut: number; // USD por 1M tokens de saída
};

/** Os 4 terminais do Chefão. Um modelo do Claude por pane. */
export const MODELS: ModelSpec[] = [
  {
    id: "haiku",
    nome: "Haiku",
    api: "claude-haiku-4-5",
    cor: "#2fd06a",
    melhorPra: "perguntas rápidas, lookups, gastar pouco",
    precoM: "$1 / $5",
    priceIn: 1,
    priceOut: 5,
  },
  {
    id: "sonnet",
    nome: "Sonnet",
    api: "claude-sonnet-5",
    cor: "#1fbcd8",
    melhorPra: "tarefa média de código, o pão com manteiga",
    precoM: "$2 / $10",
    priceIn: 2,
    priceOut: 10,
  },
  {
    id: "opus",
    nome: "Opus",
    api: "claude-opus-5",
    cor: "#e0a93b",
    melhorPra: "backend difícil, bug de lógica, algoritmo",
    precoM: "$5 / $25",
    priceIn: 5,
    priceOut: 25,
  },
  {
    id: "fable",
    nome: "Fable 5",
    api: "claude-fable-5",
    cor: "#ff2a2a",
    melhorPra: "refactor pesado, migração, contexto longo",
    precoM: "$10 / $50",
    priceIn: 10,
    priceOut: 50,
  },
];

/** Câmbio USD→BRL pra mostrar economia em reais (aproximado, fixo por ora). */
export const USD_BRL = 5.4;

/** Custo estimado (USD) de um uso, com taxas de cache do Claude. */
export function costOf(
  family: string,
  u: {
    input: number;
    output: number;
    cache_creation: number;
    cache_read: number;
  },
): number {
  const m = MODELS.find((x) => x.id === family);
  if (!m) return 0;
  const inR = m.priceIn / 1_000_000;
  const outR = m.priceOut / 1_000_000;
  return (
    u.input * inR +
    u.cache_creation * inR * 1.25 +
    u.cache_read * inR * 0.1 +
    u.output * outR
  );
}

/** Provedores que entram depois do Claude (aba HUB). Ver Provedores (Hub) no vault. */
export const PROVEDORES_FUTUROS = [
  "OpenAI · GPT / Codex",
  "Google · Gemini",
  "xAI · Grok",
  "DeepSeek",
  "Meta · Llama (local)",
  "Mistral · Codestral",
  "Alibaba · Qwen Coder",
];
