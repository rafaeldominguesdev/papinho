import { useEffect, useRef } from "react";

type Phase = "starting" | "listening" | "thinking" | "speaking";
const particles = Array.from({ length: 720 }, (_, i) => {
  const y = 1 - 2 * (i + 0.5) / 720;
  const a = i * Math.PI * (3 - Math.sqrt(5));
  const ring = Math.sqrt(1 - y * y);
  return { x: Math.cos(a) * ring, y, z: Math.sin(a) * ring,
    shell: 0.76 + ((i * 37) % 101) / 300, seed: i * 1.618 };
});

export function VoiceOrb({ phase, level, size = 320 }: {
  phase: Phase; level: number; size?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const state = useRef({ phase, level });
  state.current = { phase, level };

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);
    const theme = getComputedStyle(canvas);
    const white = theme.getPropertyValue("--color-voice-core").trim();
    const silver = theme.getPropertyValue("--color-voice-silver").trim();
    const graphite = theme.getPropertyValue("--color-voice-muted").trim();
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const center = size / 2;
    const radius = size * 0.29;
    let raf = 0, previous = performance.now(), time = 0, yaw = 0;
    let energy = 0, displacement = 0, velocity = 0;

    function frame(now: number) {
      if (!ctx) return;
      const dt = Math.min((now - previous) / 1000, 0.04);
      previous = now;
      const reduced = motion.matches || document.documentElement.classList.contains("no-anim");
      const { phase: current, level: input } = state.current;
      if (!reduced) time += dt;
      // Microfone real ao ouvir; pulsação ambiente enquanto responde.
      const target = reduced ? 0 : current === "listening"
        ? Math.max(0, Math.min(1, Number.isFinite(input) ? input : 0))
        : current === "speaking" ? 0.3 + 0.28 * Math.pow(Math.sin(time * 4.8), 2)
          : current === "thinking" ? 0.12 : 0;
      energy += (target - energy) * (1 - Math.exp(-dt * 12));
      // Mola amortecida: pontos são empurrados e retornam suavemente.
      velocity += ((energy * 0.3 - displacement) * 65 - velocity * 12) * dt;
      displacement += velocity * dt;
      if (reduced) { displacement = 0; velocity = 0; }
      else yaw += dt * (current === "thinking" ? 0.32 : 0.09);
      ctx.clearRect(0, 0, size, size);
      const glow = ctx.createRadialGradient(center, center, 0, center, center, radius * 1.5);
      glow.addColorStop(0, silver);
      glow.addColorStop(1, "transparent");
      ctx.globalAlpha = 0.035 + energy * 0.045;
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, size, size);
      ctx.globalAlpha = 1;
      const projected = particles.map((p) => {
        const ripple = reduced ? 0 : Math.sin(time * 2.3 - p.shell * 9 + p.y * 3) * energy * 0.055;
        const r = radius * (p.shell + displacement + ripple);
        const x = p.x * Math.cos(yaw) + p.z * Math.sin(yaw);
        const z = -p.x * Math.sin(yaw) + p.z * Math.cos(yaw);
        const depth = 3.8 / (3.8 + z);
        return { x: center + x * r * depth, y: center + p.y * r * depth, z, seed: p.seed, depth };
      }).sort((a, b) => b.z - a.z);
      function drawPoints(front: boolean) {
        if (!ctx) return;
        for (const p of projected) {
          if ((p.z <= 0) !== front) continue;
          const bright = (1 - p.z) / 2;
          ctx.globalAlpha = 0.12 + bright * 0.55 + energy * 0.16;
          ctx.fillStyle = Math.sin(p.seed) > 0.6 ? silver : graphite;
          ctx.beginPath();
          ctx.arc(p.x, p.y, size * (0.0018 + bright * 0.0018 + energy * 0.0012) * p.depth, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      drawPoints(false);
      const coreRadius = radius * (0.25 + energy * 0.13);
      const coreGlow = ctx.createRadialGradient(center, center, coreRadius * 0.2, center, center, coreRadius * 2.4);
      coreGlow.addColorStop(0, white);
      coreGlow.addColorStop(0.35, silver);
      coreGlow.addColorStop(1, "transparent");
      ctx.globalAlpha = 0.22 + energy * 0.13;
      ctx.fillStyle = coreGlow;
      ctx.fillRect(center - coreRadius * 2.4, center - coreRadius * 2.4, coreRadius * 4.8, coreRadius * 4.8);
      ctx.globalAlpha = 1;
      const core = ctx.createRadialGradient(center - coreRadius * 0.28, center - coreRadius * 0.32, 0, center, center, coreRadius);
      core.addColorStop(0, white);
      core.addColorStop(0.5, white);
      core.addColorStop(0.82, silver);
      core.addColorStop(0.96, graphite);
      core.addColorStop(1, "transparent");
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(center, center, coreRadius, 0, Math.PI * 2);
      ctx.fill();
      drawPoints(true);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [size]);
  return <canvas ref={ref} width={size} height={size}
    style={{ width: size, maxWidth: "100%", height: "auto", aspectRatio: "1" }} aria-hidden />;
}
