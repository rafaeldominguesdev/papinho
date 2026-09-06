/**
 * Marcas das empresas de IA — SVG inline traçado das logos oficiais.
 * Mesma arte do DevTerm (copiada de lá): as duas casas mostram as mesmas
 * empresas, e desenho de marca é coisa que tem que ser idêntica.
 *
 * Aqui o id vem do catálogo de provedores (`providers.ts`), não de um
 * comando de terminal — `glyphFor` faz a ponte.
 */

/** De qual empresa é a CLI que roda neste terminal (pra mostrar a marca dela
 *  no lugar de um LED de status genérico). */
export function providerOf(cmd: string): string {
  const c = cmd.toLowerCase();
  if (c.includes("claude")) return "anthropic";
  if (c.includes("codex")) return "openai";
  if (c.includes("cursor-agent") || c.includes("cursor ")) return "cursor";
  if (c.includes("agy") || c.includes("antigravity")) return "google";
  if (c.includes("grok")) return "xai";
  if (c.includes("ollama")) return "meta";
  if (c.includes("deepseek")) return "deepseek";
  return "shell";
}

/** Cor de destaque de cada empresa. A CLI de cada agente imprime caminho de
 *  arquivo, link, símbolo etc. num realce (o `claude` faz em vermelho) — esse
 *  realce é repintado nesta cor. Todos os modelos da mesma empresa dividem a
 *  cor (haiku/sonnet/opus = mesmo vermelho). */
const PROVIDER_ACCENT: Record<string, string> = {
  anthropic: "#ff3b3b", // vermelho da marca (mesmo do app)
  openai: "#10b981", // verde
  cursor: "#d8d8d8", // branco / prata
  google: "#b98cff", // roxo (Antigravity)
  xai: "#38bdf8", // azul
  meta: "#4a9eff", // azul Meta
  deepseek: "#5b7cff", // índigo
  shell: "#ff3b3b", // terminal solto = vermelho do app
};

/** cor de destaque a partir do id normalizado (`providerOf`). */
export function providerAccent(id: string): string {
  return PROVIDER_ACCENT[id] ?? PROVIDER_ACCENT.shell;
}

/** cor de destaque a partir do comando que roda no terminal. */
export function providerAccentForCmd(cmd: string): string {
  return providerAccent(providerOf(cmd));
}

// Coords em 0..130 (0..125 no xai).
const MARK_CLAUDE =
  "M325 1273 c-32 -34 -28 -83 9 -141 49 -75 176 -305 172 -309 -3 -3 -74 47 -158 110 -169 127 -207 143 -233 103 -40 -60 -16 -84 278 -281 142 -94 147 -100 76 -91 -135 18 -444 34 -456 24 -18 -15 -16 -32 7 -53 17 -16 52 -19 255 -28 161 -7 234 -14 232 -21 -2 -6 -60 -42 -129 -81 -197 -110 -240 -143 -236 -179 3 -28 7 -31 38 -34 31 -3 60 13 213 112 97 63 177 113 177 111 0 -3 -24 -35 -54 -72 -236 -295 -254 -326 -199 -339 34 -9 86 47 225 238 51 70 96 127 99 128 3 0 2 -19 -3 -42 -73 -356 -76 -380 -46 -408 28 -25 34 -25 62 3 20 20 24 39 36 185 19 237 19 238 54 177 76 -130 188 -285 208 -285 80 0 73 53 -27 203 -41 61 -73 113 -70 115 2 2 48 -34 103 -80 169 -142 202 -159 202 -104 0 17 -40 60 -150 160 -82 76 -150 141 -150 145 0 4 82 -12 182 -36 180 -44 183 -44 220 -27 44 20 48 41 14 74 -31 28 -84 39 -211 41 -55 0 -125 4 -155 8 -60 7 -56 8 272 82 110 25 137 50 97 90 -23 23 -35 22 -246 -21 -97 -19 -133 -23 -133 -14 0 13 80 127 159 229 66 83 77 119 50 156 -48 68 -106 28 -274 -184 -42 -54 -79 -96 -81 -94 -2 2 9 73 25 158 44 237 44 227 16 255 -27 27 -33 28 -56 11 -31 -24 -39 -58 -54 -214 -21 -232 -25 -254 -37 -223 -6 14 -36 77 -68 140 -32 63 -77 159 -101 213 -54 124 -98 149 -154 90z";
const MARK_CODEX =
  "M495 1083 c-43 -22 -102 -81 -116 -115 -7 -17 -28 -37 -49 -48 -124 -63 -172 -212 -104 -327 22 -37 28 -61 29 -108 2 -131 99 -227 231 -230 47 -2 72 -9 110 -31 109 -64 244 -27 312 86 21 36 44 60 69 72 123 60 168 223 91 331 -15 21 -22 48 -24 94 -7 147 -95 233 -238 233 -36 0 -68 5 -71 10 -28 45 -178 66 -240 33z m13 -362 c43 -79 43 -79 -3 -155 -47 -77 -63 -88 -85 -62 -9 12 -5 27 24 76 43 74 43 60 1 130 -37 61 -38 90 -1 90 16 0 31 -18 64 -79z m377 -201 c0 -25 -1 -25 -95 -28 -112 -3 -140 2 -140 27 0 30 9 32 124 29 111 -3 111 -3 111 -28z";
const MARK_AGRAV =
  "M585 1056 c-75 -32 -122 -123 -190 -366 -56 -199 -93 -285 -164 -379 -31 -42 -38 -57 -30 -68 44 -52 163 46 263 218 71 121 122 157 211 147 64 -8 96 -37 165 -149 111 -181 215 -268 258 -216 13 15 5 30 -50 103 -49 64 -89 160 -138 335 -97 342 -180 438 -325 375z";
const MARK_CURSOR =
  "M450 997 c-195 -113 -195 -113 -195 -347 0 -234 0 -234 197 -348 198 -114 198 -114 395 0 198 114 198 114 198 348 0 234 0 234 -195 347 -107 62 -197 113 -200 113 -3 0 -93 -51 -200 -113z m560 -143 c0 -9 -158 -286 -299 -524 -56 -95 -56 -95 -61 114 -5 210 -5 210 -173 307 -93 53 -171 100 -174 103 -4 3 154 6 350 6 197 0 357 -3 357 -6z";
const MARK_XAI =
  "M899 847 c-205 -210 -367 -377 -359 -371 142 108 414 304 420 304 37 0 64 -87 58 -190 -13 -218 -227 -374 -437 -317 -53 15 -54 14 -122 -17 -37 -17 -68 -34 -69 -37 0 -11 105 -58 165 -74 245 -63 507 88 579 334 20 70 20 174 0 296 -25 147 -2 233 103 384 24 35 42 65 40 67 -1 2 -172 -169 -378 -379z M535 1086 c-154 -49 -272 -161 -326 -312 -31 -83 -31 -235 0 -318 45 -127 23 -198 -108 -339 -84 -91 -108 -127 -43 -66 30 29 314 283 345 310 5 3 -7 28 -27 53 -198 259 62 621 391 545 46 -11 52 -10 118 24 69 34 69 34 20 60 -111 56 -271 74 -370 43z";

const flipY = (h: number) => `translate(0,${h}) scale(0.1,-0.1)` as const;

/** Marcas das empresas — SVG inline traçado das logos oficiais (não imagem).
 *  Cores da marca; `size` em px (15 = cabeçalho do pane). */
export function ProviderGlyph({ id, size = 15 }: { id: string; size?: number }) {
  if (id === "anthropic") {
    return (
      <svg viewBox="0 0 130 130" width={size} height={size} aria-hidden>
        <g transform={flipY(130)} fill="#d97757">
          <path d={MARK_CLAUDE} />
        </g>
      </svg>
    );
  }
  if (id === "openai") {
    return (
      <svg viewBox="0 0 130 130" width={size} height={size} aria-hidden>
        <defs>
          <linearGradient id="gCodex" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#aca6f8" />
            <stop offset="1" stopColor="#5162f7" />
          </linearGradient>
        </defs>
        <g transform={flipY(130)} fill="url(#gCodex)">
          <path d={MARK_CODEX} />
        </g>
      </svg>
    );
  }
  if (id === "google") {
    return (
      <svg viewBox="0 0 130 130" width={size} height={size} aria-hidden>
        <defs>
          <linearGradient id="gAgrav" x1="0.08" y1="0" x2="0.92" y2="1">
            <stop offset="0" stopColor="#46c26c" />
            <stop offset="0.34" stopColor="#ef5d37" />
            <stop offset="0.7" stopColor="#3f7ef0" />
            <stop offset="1" stopColor="#63a6f6" />
          </linearGradient>
        </defs>
        <g transform={flipY(130)} fill="url(#gAgrav)">
          <path d={MARK_AGRAV} />
        </g>
      </svg>
    );
  }
  if (id === "xai") {
    return (
      <svg viewBox="0 0 130 125" width={size} height={size} aria-hidden>
        <g transform={flipY(125)} fill="#f1eeef">
          <path d={MARK_XAI} />
        </g>
      </svg>
    );
  }
  if (id === "cursor") {
    return (
      <svg viewBox="0 0 130 130" width={size} height={size} aria-hidden>
        <g transform={flipY(130)} fill="#cfcfcf">
          <path d={MARK_CURSOR} />
        </g>
      </svg>
    );
  }
  if (id === "deepseek" || id === "meta") {
    const c = id === "deepseek" ? "#4d6bfe" : "#0866ff";
    return (
      <span
        className="flex items-center justify-center rounded-[4px] font-bold text-white"
        style={{
          background: c,
          width: size,
          height: size,
          fontSize: Math.round(size * 0.6),
        }}
        aria-hidden
      >
        {id === "deepseek" ? "D" : "M"}
      </span>
    );
  }
  return (
    <span
      className="flex items-center justify-center rounded-[4px] bg-line text-ink-dim"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.53) }}
      aria-hidden
    >
      ›_
    </span>
  );
}

/** A marca da empresa + um pip de status só quando há algo a dizer
 *  (bootando / esperando você / terminou). Parado e rodando = só a marca. */
export function ProviderMark({
  cmd,
  state,
}: {
  cmd: string;
  state: "boot" | "input" | "done" | "run";
}) {
  const pip =
    state === "boot"
      ? "#e0a93b"
      : state === "input"
        ? "#ff5a5f"
        : state === "done"
          ? "#3ecf8e"
          : null;
  return (
    <span className="relative inline-flex shrink-0">
      <span style={{ opacity: state === "boot" ? 0.5 : 1 }}>
        <ProviderGlyph id={providerOf(cmd)} />
      </span>
      {pip && (
        <span
          className={
            "absolute -right-0.5 -top-0.5 h-[6px] w-[6px] rounded-full ring-2 ring-surface " +
            (state === "boot" || state === "input" ? "tok-counting" : "")
          }
          style={{ background: pip }}
          aria-hidden
        />
      )}
    </span>
  );
}

/** id do provedor do Papinho -> id da marca desenhada aqui */
export function glyphFor(providerId: string): string {
  switch (providerId) {
    case "claude":
      return "anthropic";
    case "codex":
      return "openai";
    case "gemini":
    case "antigravity":
      return "google";
    case "cursor":
      return "cursor";
    case "grok":
      return "xai";
    default:
      return "shell";
  }
}
