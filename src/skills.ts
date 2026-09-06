/**
 * Catálogo de skills do Claude Code — curadoria das melhores skills oficiais
 * (Anthropic) e de times conhecidos (Vercel, Stripe, Cloudflare, Trail of Bits,
 * Sentry, Figma, OpenAI, Google Labs, HashiCorp...).
 *
 * O DevTerm não empacota as skills — elas ficam em `~/.claude/skills/`. Este
 * catálogo serve pra descobrir, copiar o comando `/skill` e ir na fonte instalar.
 *
 * Coleções: github.com/anthropics/skills · github.com/VoltAgent/awesome-agent-skills
 */

export type Skill = {
  name: string;
  desc: string;
  team: string;
  cat: string;
  src?: string;
};

/** Skills que o app sabe instalar sozinho (git sparse-checkout do repo oficial). */
const ANTHROPIC_INSTALLABLE = new Set([
  "academy-guide",
  "algorithmic-art",
  "brand-guidelines",
  "canvas-design",
  "claude-api",
  "discernment-nudge",
  "doc-coauthoring",
  "docx",
  "frontend-design",
  "internal-comms",
  "mcp-builder",
  "pdf",
  "pptx",
  "skill-creator",
  "slack-gif-creator",
  "theme-factory",
  "web-artifacts-builder",
  "webapp-testing",
  "xlsx",
]);

/** De onde o app clona a skill, ou null se só dá pra copiar o comando. */
export function skillSource(
  s: Skill,
): { repo: string; subdir: string } | null {
  if (s.team === "Anthropic" && ANTHROPIC_INSTALLABLE.has(s.name)) {
    return {
      repo: "https://github.com/anthropics/skills",
      subdir: `skills/${s.name}`,
    };
  }
  return null;
}

export const SKILL_SOURCES: { label: string; url: string; cmd: string }[] = [
  {
    label: "Anthropic — skills oficiais",
    url: "https://github.com/anthropics/skills",
    cmd: "git clone https://github.com/anthropics/skills ~/.claude/skills-anthropic",
  },
  {
    label: "awesome-agent-skills (1000+)",
    url: "https://github.com/VoltAgent/awesome-agent-skills",
    cmd: "git clone https://github.com/VoltAgent/awesome-agent-skills ~/.claude/skills-awesome",
  },
  {
    label: "coleção da comunidade 2026",
    url: "https://github.com/obviousworks/Claude-AI-skills-collection-2026",
    cmd: "git clone https://github.com/obviousworks/Claude-AI-skills-collection-2026 ~/.claude/skills-community",
  },
];

export const SKILLS: Skill[] = [
  // Claude / agentes
  { name: "skill-creator", desc: "cria uma skill nova do zero (SKILL.md + estrutura)", team: "Anthropic", cat: "Claude & agentes" },
  { name: "claude-api", desc: "referência da API da Anthropic: modelos, preços, tool use, caching", team: "Anthropic", cat: "Claude & agentes" },
  { name: "mcp-builder", desc: "gera servidores MCP", team: "Anthropic", cat: "Claude & agentes" },
  { name: "webapp-testing", desc: "testa web apps de ponta a ponta pelo navegador", team: "Anthropic", cat: "Claude & agentes" },
  { name: "web-artifacts-builder", desc: "monta artifacts HTML complexos com React + Tailwind", team: "Anthropic", cat: "Claude & agentes" },
  { name: "discernment-nudge", desc: "faz o Claude checar melhor antes de afirmar", team: "Anthropic", cat: "Claude & agentes" },
  { name: "academy-guide", desc: "guia dos cursos e materiais da Anthropic", team: "Anthropic", cat: "Claude & agentes" },
  { name: "launch-your-agent", desc: "do zero a um Managed Agent no ar: entrevista, escopo, deploy, avaliação", team: "Anthropic", cat: "Claude & agentes", src: "https://github.com/anthropics/launch-your-agent" },
  { name: "composio", desc: "conecta agentes a 1000+ apps com auth gerenciada", team: "Composio", cat: "Claude & agentes" },

  // Documentos & Design
  { name: "docx", desc: "cria, edita e analisa documentos Word", team: "Anthropic", cat: "Documentos & design" },
  { name: "pptx", desc: "cria e edita apresentações PowerPoint", team: "Anthropic", cat: "Documentos & design" },
  { name: "xlsx", desc: "cria e edita planilhas Excel", team: "Anthropic", cat: "Documentos & design" },
  { name: "pdf", desc: "gera e manipula PDFs", team: "Anthropic", cat: "Documentos & design" },
  { name: "doc-coauthoring", desc: "escreve documentos longos junto com você, por seção", team: "Anthropic", cat: "Documentos & design" },
  { name: "brand-guidelines", desc: "aplica o manual de marca da sua empresa nos docs", team: "Anthropic", cat: "Documentos & design" },
  { name: "canvas-design", desc: "layouts visuais multi-artboard", team: "Anthropic", cat: "Documentos & design" },
  { name: "theme-factory", desc: "gera sistemas de tema (tokens de cor/tipo/espaço)", team: "Anthropic", cat: "Documentos & design" },
  { name: "algorithmic-art", desc: "arte generativa por código", team: "Anthropic", cat: "Documentos & design" },
  { name: "slack-gif-creator", desc: "cria GIFs pro Slack", team: "Anthropic", cat: "Documentos & design" },
  { name: "internal-comms", desc: "escreve comunicados internos no tom certo", team: "Anthropic", cat: "Documentos & design" },

  // Frontend & UI
  { name: "frontend-design", desc: "design de front com bom gosto e sistema", team: "Anthropic", cat: "Frontend & UI" },
  { name: "shadcn-ui", desc: "monta componentes com shadcn/ui", team: "Google Labs", cat: "Frontend & UI" },
  { name: "react-components", desc: "converte design (Stitch) em componentes React", team: "Google Labs", cat: "Frontend & UI" },
  { name: "figma-implement-design", desc: "traduz Figma em código com fidelidade 1:1", team: "Figma", cat: "Frontend & UI" },
  { name: "figma-generate-library", desc: "cria/atualiza um design system profissional no Figma", team: "Figma", cat: "Frontend & UI" },
  { name: "next-best-practices", desc: "boas práticas e padrões do Next.js", team: "Vercel", cat: "Frontend & UI" },
  { name: "next-upgrade", desc: "atualiza projetos Next.js pra versões novas", team: "Vercel", cat: "Frontend & UI" },

  // Testes
  { name: "playwright-skill", desc: "gera testes E2E Playwright em TS/JS/Python/Java/C#", team: "TestMu AI", cat: "Testes" },
  { name: "cypress-skill", desc: "gera testes E2E e de componente com Cypress", team: "TestMu AI", cat: "Testes" },
  { name: "jest-skill", desc: "gera testes unitários/integração Jest com mocks e snapshots", team: "TestMu AI", cat: "Testes" },
  { name: "selenium-skill", desc: "gera testes Selenium em Java/Python/JS/C#/Ruby/PHP", team: "TestMu AI", cat: "Testes" },
  { name: "playwright", desc: "automatiza navegador real: navegação, formulários, scraping", team: "OpenAI", cat: "Testes" },
  { name: "gh-fix-ci", desc: "debuga e conserta checks do GitHub Actions lendo os logs", team: "OpenAI", cat: "Testes" },

  // Segurança
  { name: "static-analysis", desc: "kit de análise estática com CodeQL, Semgrep e SARIF", team: "Trail of Bits", cat: "Segurança" },
  { name: "semgrep-rule-creator", desc: "cria e refina regras Semgrep pra achar vulnerabilidade", team: "Trail of Bits", cat: "Segurança" },
  { name: "differential-review", desc: "review de diff focado em segurança, com histórico do git", team: "Trail of Bits", cat: "Segurança" },
  { name: "building-secure-contracts", desc: "kit de segurança pra smart contracts", team: "Trail of Bits", cat: "Segurança" },
  { name: "security-best-practices", desc: "revisa código atrás de vulnerabilidade por linguagem", team: "OpenAI", cat: "Segurança" },
  { name: "sentry-workflow", desc: "fluxo completo: conserta erro de produção e revisa código", team: "Sentry", cat: "Segurança" },
  { name: "sentry-sdk-setup", desc: "configura o Sentry em qualquer linguagem/framework", team: "Sentry", cat: "Segurança" },

  // Backend & Dados
  { name: "postgres-best-practices", desc: "boas práticas de PostgreSQL (Supabase)", team: "Supabase", cat: "Backend & dados" },
  { name: "neon-postgres", desc: "boas práticas do Neon Serverless Postgres", team: "Neon", cat: "Backend & dados" },
  { name: "clickhouse-best-practices", desc: "boas práticas com ClickHouse", team: "ClickHouse", cat: "Backend & dados" },
  { name: "stripe-best-practices", desc: "boas práticas pra integrar o Stripe", team: "Stripe", cat: "Backend & dados" },
  { name: "apollo-server", desc: "monta servidores GraphQL com Apollo Server 5", team: "Apollo", cat: "Backend & dados" },
  { name: "apollo-client", desc: "apps React com Apollo Client 4", team: "Apollo", cat: "Backend & dados" },
  { name: "create-auth", desc: "configura autenticação com Better Auth", team: "Better Auth", cat: "Backend & dados" },
  { name: "wp-rest-api", desc: "rotas/endpoints, schema e auth da REST API do WordPress", team: "WordPress", cat: "Backend & dados" },

  // Infra & Deploy
  { name: "cloudflare", desc: "Workers, Pages, storage, AI, rede e segurança da Cloudflare", team: "Cloudflare", cat: "Infra & deploy" },
  { name: "workers-best-practices", desc: "revisa e escreve código de Workers no padrão de produção", team: "Cloudflare", cat: "Infra & deploy" },
  { name: "durable-objects", desc: "coordenação com estado: RPC, SQLite e WebSockets", team: "Cloudflare", cat: "Infra & deploy" },
  { name: "netlify-functions", desc: "endpoints serverless e tarefas de background", team: "Netlify", cat: "Infra & deploy" },
  { name: "netlify-db", desc: "Postgres gerenciado com branching por deploy preview", team: "Netlify", cat: "Infra & deploy" },
  { name: "terraform-style-guide", desc: "gera HCL no style guide oficial da HashiCorp", team: "HashiCorp", cat: "Infra & deploy" },
  { name: "new-terraform-provider", desc: "faz o scaffold de um provider Terraform novo", team: "HashiCorp", cat: "Infra & deploy" },

  // IA & ML
  { name: "hugging-face-datasets", desc: "cria e gerencia datasets com configs e query SQL", team: "Hugging Face", cat: "IA & ML" },
  { name: "hugging-face-model-trainer", desc: "treina modelos com TRL: SFT, DPO, GRPO, GGUF", team: "Hugging Face", cat: "IA & ML" },
  { name: "transformers.js", desc: "roda modelos de ML no navegador", team: "Hugging Face", cat: "IA & ML" },
  { name: "gemini-api-dev", desc: "boas práticas pra apps com Gemini", team: "Google", cat: "IA & ML" },
  { name: "replicate", desc: "descobre, compara e roda modelos pela API do Replicate", team: "Replicate", cat: "IA & ML" },
];

/** Domínio de cada time — pra puxar o favicon como "logo" da skill. */
const TEAM_DOMAIN: Record<string, string> = {
  Anthropic: "anthropic.com",
  Vercel: "vercel.com",
  Stripe: "stripe.com",
  Cloudflare: "cloudflare.com",
  "Trail of Bits": "trailofbits.com",
  Sentry: "sentry.io",
  Figma: "figma.com",
  OpenAI: "openai.com",
  "Google Labs": "labs.google",
  Google: "google.com",
  HashiCorp: "hashicorp.com",
  "Hugging Face": "huggingface.co",
  Neon: "neon.tech",
  Netlify: "netlify.com",
  Supabase: "supabase.com",
  ClickHouse: "clickhouse.com",
  Composio: "composio.dev",
  Apollo: "apollographql.com",
  "Better Auth": "better-auth.com",
  Replicate: "replicate.com",
  "TestMu AI": "lambdatest.com",
  WordPress: "wordpress.org",
};

/** URL de um favicon 64px pro time, ou null. */
export function teamLogo(team: string): string | null {
  const d = TEAM_DOMAIN[team];
  return d ? `https://www.google.com/s2/favicons?domain=${d}&sz=64` : null;
}
