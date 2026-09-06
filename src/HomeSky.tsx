import { useEffect, useRef } from "react";

/* --------- fundo espacial: estrelas coloridas num canvas, o mouse empurra
 * o que estiver perto. Cada estrela vai numa direção; wrap nos 4 lados.
 * Pausa em document.hidden; prefers-reduced-motion = 1 frame estático. */
export function runHomeSky(canvas: HTMLCanvasElement): () => void {
  const ctx0 = canvas.getContext("2d");
  const host = canvas.parentElement;
  if (!ctx0 || !host) return () => {};
  const ctx: CanvasRenderingContext2D = ctx0;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  let w = 0;
  let h = 0;
  const mouse = { x: -9999, y: -9999, on: false };

  const STAR_COLORS = [
    "236,240,244", // branco
    "236,240,244",
    "255,209,102", // amarelo
    "111,207,151", // verde
    "255,92,92", // vermelho
  ];
  type Star = {
    x: number;
    y: number;
    z: number;
    r: number;
    ph: number;
    vx: number;
    vy: number;
    c: string;
  };
  let stars: Star[] = [];

  function seed() {
    const n = Math.max(500, Math.min(1700, Math.round((w * h) / 1100)));
    stars = Array.from({ length: n }, () => {
      const ang = Math.random() * Math.PI * 2;
      const z = 0.15 + Math.random() * 0.85;
      const spd = (0.08 + Math.random() * 0.4) * z;
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        z,
        r: 0.4 + Math.random() * 1.1,
        ph: Math.random() * Math.PI * 2,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        c: STAR_COLORS[(Math.random() * STAR_COLORS.length) | 0],
      };
    });
  }

  const ro = new ResizeObserver(() => {
    const rect = canvas.getBoundingClientRect();
    w = rect.width;
    h = rect.height;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
  });
  ro.observe(canvas);

  const onMove = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
    mouse.on = true;
  };
  const onLeave = () => {
    mouse.on = false;
    mouse.x = -9999;
    mouse.y = -9999;
  };
  host.addEventListener("pointermove", onMove);
  host.addEventListener("pointerleave", onLeave);

  const REP = 145;
  let raf = 0;
  let running = !reduce;
  let t = 0;

  function frame() {
    if (!running) return;
    t += 1;
    ctx.clearRect(0, 0, w, h);

    for (const s of stars) {
      if (!reduce) {
        s.x += s.vx;
        s.y += s.vy;
      }
      if (s.x < -6) s.x = w + 6;
      if (s.x > w + 6) s.x = -6;
      if (s.y < -6) s.y = h + 6;
      if (s.y > h + 6) s.y = -6;

      let px = s.x;
      let py = s.y;
      if (mouse.on) {
        const dx = s.x - mouse.x;
        const dy = s.y - mouse.y;
        const d = Math.hypot(dx, dy);
        if (d < REP && d > 0.01) {
          const push = 1 - d / REP;
          px += (dx / d) * push * push * 48;
          py += (dy / d) * push * push * 48;
        }
      }

      const tw = 0.5 + 0.5 * Math.sin(s.ph + t * 0.06 * s.z);
      const a = (0.12 + s.z * 0.6) * tw;
      ctx.fillStyle = `rgba(${s.c},${a})`;
      ctx.fillRect(px, py, s.r, s.r);
    }

    if (!reduce) raf = requestAnimationFrame(frame);
  }

  const onVis = () => {
    if (document.hidden) {
      running = false;
      cancelAnimationFrame(raf);
    } else if (!reduce) {
      running = true;
      frame();
    }
  };
  document.addEventListener("visibilitychange", onVis);

  if (reduce) {
    const rect = canvas.getBoundingClientRect();
    w = rect.width;
    h = rect.height;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
    running = true;
    frame();
  } else {
    frame();
  }

  return () => {
    running = false;
    cancelAnimationFrame(raf);
    ro.disconnect();
    document.removeEventListener("visibilitychange", onVis);
    host.removeEventListener("pointermove", onMove);
    host.removeEventListener("pointerleave", onLeave);
  };
}

export function HomeSky() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (ref.current) return runHomeSky(ref.current);
  }, []);
  return <canvas ref={ref} aria-hidden className="home-sky h-full w-full" />;
}
