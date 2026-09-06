import { useEffect, useRef } from "react";

/* ================================ O ORBE ================================
   Esfera de wireframe girando, no espírito de interface de ficção científica:
   meridianos e paralelos, dois anéis orbitais em eixos tortos e um núcleo que
   respira. Nada de biblioteca 3D — é projeção em perspectiva feita na mão num
   canvas 2D, que dá conta de sobra do que a tela precisa mostrar.

   O que cada estado faz com a esfera:
   - ouvindo:  o raio segue o microfone (`level`), o giro é lento
   - pensando: acelera e encolhe um pouco, como quem se recolhe pra calcular
   - falando:  pulsa sozinha e solta ondas concêntricas a cada frase

   Desempenho: as linhas não são desenhadas uma a uma — vão pra 5 baldes de
   profundidade e cada balde vira UM path com o seu alpha. São ~6 chamadas de
   stroke por quadro em vez de ~700. */

type Phase = "starting" | "listening" | "thinking" | "speaking";

const RED = [255, 59, 59] as const;
const CYAN = [31, 188, 216] as const;
const rgba = (c: readonly number[], a: number) =>
  `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`;

/** rotação yaw (em torno de Y) + tilt (em torno de X) */
function rot(
  x: number,
  y: number,
  z: number,
  yaw: number,
  tilt: number,
): [number, number, number] {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const x1 = x * cy + z * sy;
  const z1 = -x * sy + z * cy;
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  return [x1, y * ct - z1 * st, y * st + z1 * ct];
}

export function VoiceOrb({
  phase,
  level,
  size = 300,
}: {
  phase: Phase;
  /** 0..1 do microfone (só vale quando está ouvindo) */
  level: number;
  size?: number;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  // o loop de desenho é montado uma vez; lê o estado por refs pra não
  // reiniciar a animação a cada evento de nível (chegam ~20 por segundo)
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const levelRef = useRef(level);
  levelRef.current = level;

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx0 = cv.getContext("2d");
    if (!ctx0) return;
    // as funções de desenho abaixo são declarações hoisted — o TS não leva o
    // narrowing do `if` pra dentro delas, daí a cópia já sem `null`.
    const ctx: CanvasRenderingContext2D = ctx0;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = size * dpr;
    cv.height = size * dpr;
    ctx.scale(dpr, dpr);

    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const cx = size / 2;
    const cy = size / 2;
    const R = size * 0.3;

    let raf = 0;
    let t = 0; // tempo em segundos
    let yaw = 0;
    let amp = 0; // nível suavizado
    let pulse = 0; // respiração própria (fala)
    const waves: number[] = []; // ondas de fala em curso (raio 0..1)
    let lastWave = 0;
    let last = performance.now();

    // 5 baldes de profundidade: cada um vira um path só
    const LAYERS = 5;
    const paths: Path2D[] = [];
    const bucket = (z: number) =>
      Math.min(LAYERS - 1, Math.max(0, Math.floor(((z + 1) / 2) * LAYERS)));

    function project(p: [number, number, number], r: number) {
      const k = 2.6 / (2.6 + p[2]); // perspectiva suave
      return [cx + p[0] * r * k, cy + p[1] * r * k] as const;
    }

    /** desenha uma curva 3D repartida pelos baldes de profundidade */
    function curve(
      pts: Array<[number, number, number]>,
      r: number,
      close: boolean,
    ) {
      for (let i = 0; i < pts.length - (close ? 0 : 1); i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        const [ax, ay] = project(a, r);
        const [bx, by] = project(b, r);
        const p = paths[bucket((a[2] + b[2]) / 2)];
        p.moveTo(ax, ay);
        p.lineTo(bx, by);
      }
    }

    function frame(now: number) {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      t += dt;

      const ph = phaseRef.current;
      const target = ph === "listening" ? Math.min(levelRef.current, 1) : 0;
      amp += (target - amp) * Math.min(dt * 9, 1); // segue o microfone, sem tremer

      // giro: calmo ouvindo, apressado pensando, médio falando
      const spin =
        ph === "thinking" ? 1.15 : ph === "speaking" ? 0.62 : 0.3;
      if (!reduce) yaw += dt * spin;
      pulse = ph === "speaking" ? (Math.sin(t * 5.2) + 1) / 2 : 0;

      const tilt = -0.34 + Math.sin(t * 0.25) * 0.06;
      // raio: microfone quando ouve, respiração quando fala, encolhe pensando
      const r =
        R *
        (1 +
          amp * 0.3 +
          pulse * 0.09 +
          (ph === "thinking" ? -0.06 : 0) +
          (ph === "starting" ? -0.18 : 0));

      ctx.clearRect(0, 0, size, size);

      // ---- halo
      const halo = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r * 2.1);
      halo.addColorStop(0, rgba(RED, 0.2 + amp * 0.22 + pulse * 0.1));
      halo.addColorStop(0.45, rgba(RED, 0.05));
      halo.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, size, size);

      for (let i = 0; i < LAYERS; i++) paths[i] = new Path2D();

      // ---- esfera: meridianos e paralelos
      const MER = 14;
      const PAR = 7;
      for (let m = 0; m < MER; m++) {
        const lon = (m / MER) * Math.PI * 2;
        const pts: Array<[number, number, number]> = [];
        for (let i = 0; i <= 22; i++) {
          const lat = -Math.PI / 2 + (i / 22) * Math.PI;
          pts.push(
            rot(
              Math.cos(lat) * Math.cos(lon),
              Math.sin(lat),
              Math.cos(lat) * Math.sin(lon),
              yaw,
              tilt,
            ),
          );
        }
        curve(pts, r, false);
      }
      for (let p = 1; p <= PAR; p++) {
        const lat = -Math.PI / 2 + (p / (PAR + 1)) * Math.PI;
        const pts: Array<[number, number, number]> = [];
        for (let i = 0; i < 34; i++) {
          const lon = (i / 34) * Math.PI * 2;
          pts.push(
            rot(
              Math.cos(lat) * Math.cos(lon),
              Math.sin(lat),
              Math.cos(lat) * Math.sin(lon),
              yaw,
              tilt,
            ),
          );
        }
        curve(pts, r, true);
      }

      ctx.lineWidth = 1;
      for (let i = 0; i < LAYERS; i++) {
        // fundo da esfera quase apagado, frente acesa: é o que dá volume
        const a = 0.05 + (i / (LAYERS - 1)) * (0.34 + amp * 0.3 + pulse * 0.1);
        ctx.strokeStyle = rgba(RED, a);
        ctx.stroke(paths[i]);
      }

      // ---- anéis orbitais (fora da esfera, eixos tortos, ciano)
      for (let i = 0; i < LAYERS; i++) paths[i] = new Path2D();
      const rings: Array<[number, number, number]> = [
        [1.42, 1.15, 0.42], // [raio, inclinação, velocidade]
        [1.62, -0.75, -0.3],
        [1.28, 2.05, 0.24],
      ];
      for (const [rr, inc, sp] of rings) {
        const pts: Array<[number, number, number]> = [];
        for (let i = 0; i < 46; i++) {
          const a = (i / 46) * Math.PI * 2;
          // círculo no plano XZ, inclinado no seu próprio eixo, depois girado
          const [x, y, z] = rot(Math.cos(a) * rr, 0, Math.sin(a) * rr, 0, inc);
          pts.push(rot(x, y, z, yaw * sp * 2.2, tilt));
        }
        curve(pts, r, true);
      }
      ctx.lineWidth = 1;
      for (let i = 0; i < LAYERS; i++) {
        ctx.strokeStyle = rgba(CYAN, 0.04 + (i / (LAYERS - 1)) * 0.2);
        ctx.stroke(paths[i]);
      }

      // ---- núcleo
      const coreR = r * (0.34 + amp * 0.26 + pulse * 0.12);
      const core = ctx.createRadialGradient(
        cx,
        cy - coreR * 0.2,
        0,
        cx,
        cy,
        coreR,
      );
      core.addColorStop(0, rgba([255, 235, 235], 0.9));
      core.addColorStop(0.35, rgba(RED, 0.65));
      core.addColorStop(1, rgba(RED, 0));
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
      ctx.fill();

      // ---- ondas: cada frase falada solta um anel que se abre e some
      if (ph === "speaking" && !reduce && t - lastWave > 0.65) {
        lastWave = t;
        waves.push(0);
      }
      for (let i = waves.length - 1; i >= 0; i--) {
        waves[i] += dt * 0.55;
        if (waves[i] >= 1) {
          waves.splice(i, 1);
          continue;
        }
        const w = waves[i];
        ctx.strokeStyle = rgba(RED, (1 - w) * 0.32);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, r * (1 + w * 1.1), 0, Math.PI * 2);
        ctx.stroke();
      }

      // ---- arco de varredura: só quando está pensando
      if (ph === "thinking" && !reduce) {
        const a0 = t * 2.6;
        ctx.strokeStyle = rgba(CYAN, 0.5);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 1.78, a0, a0 + 0.7);
        ctx.stroke();
        ctx.strokeStyle = rgba(CYAN, 0.22);
        ctx.beginPath();
        ctx.arc(cx, cy, r * 1.78, a0 + Math.PI, a0 + Math.PI + 0.45);
        ctx.stroke();
      }

      raf = requestAnimationFrame(frame);
    }

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [size]);

  return (
    <canvas
      ref={ref}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      aria-hidden
    />
  );
}
