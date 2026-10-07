import { useEffect, useRef, type ReactNode } from "react";

type Star = {
  x: number;
  y: number;
  r: number;
  base: number;
  amp: number;
  phase: number;
  speed: number;
  purple: boolean;
};

type Meteor = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  duration: number;
  trail: number;
  purple: boolean;
};

const COUNT = 80;
const METEOR_EVERY_SEC = 10;

function spawn(w: number, h: number): Star {
  const accent = Math.random() < 0.58;
  return {
    x: Math.random() * w,
    y: Math.random() * h,
    r: 0.4 + Math.random() * 1.25,
    base: 0.2 + Math.random() * 0.28,
    amp: 0.12 + Math.random() * 0.35,
    phase: Math.random() * Math.PI * 2,
    speed: 0.6 + Math.random() * 1.4,
    purple: accent,
  };
}

function spawnMeteor(w: number, h: number, nowSec: number): Meteor {
  const x = w * (0.08 + Math.random() * 0.84);
  const y = h * (0.06 + Math.random() * 0.55);
  const speed = 240 + Math.random() * 140;
  const downRight = Math.random() < 0.5;
  const tilt = (18 + Math.random() * 22) * (Math.PI / 180);
  const angle = downRight ? tilt : Math.PI - tilt;
  return {
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    born: nowSec,
    duration: 1.05 + Math.random() * 0.45,
    trail: 70 + Math.random() * 90,
    purple: true,
  };
}

function hudRgb(): string {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--hud-rgb")
    .trim();
  return raw || "196, 196, 196";
}

function drawMeteor(
  ctx: CanvasRenderingContext2D,
  m: Meteor,
  t: number,
) {
  const age = t - m.born;
  const u = Math.min(1, age / m.duration);
  const fade = u < 0.15 ? u / 0.15 : u > 0.7 ? (1 - u) / 0.3 : 1;
  const alpha = Math.max(0, Math.min(1, fade));
  if (alpha <= 0) return;

  const speed = Math.hypot(m.vx, m.vy) || 1;
  const tx = (m.vx / speed) * m.trail;
  const ty = (m.vy / speed) * m.trail;
  const x0 = m.x - tx;
  const y0 = m.y - ty;

  const accent = hudRgb();
  const head = accent;
  const grad = ctx.createLinearGradient(x0, y0, m.x, m.y);
  grad.addColorStop(0, `rgba(${head}, 0)`);
  grad.addColorStop(0.55, `rgba(${head}, ${0.18 * alpha})`);
  grad.addColorStop(1, `rgba(${head}, ${0.95 * alpha})`);

  ctx.save();
  ctx.strokeStyle = grad;
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(m.x, m.y);
  ctx.stroke();

  ctx.fillStyle = `rgba(${head}, ${alpha})`;
  ctx.beginPath();
  ctx.arc(m.x, m.y, 1.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Sparse starfield with twinkle; accent stars follow Settings Appearance. */
export function HomeStars() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let stars: Star[] = [];
    let meteor: Meteor | null = null;
    let nextMeteorAt = METEOR_EVERY_SEC;
    let raf = 0;
    let running = true;
    const t0 = performance.now();
    let lastNow = t0;

    const hostEl = (): HTMLElement => {
      const found =
        canvas.closest(".pane-star-host") ||
        canvas.closest(".app-starfield") ||
        canvas.closest(".newtab-orbs") ||
        canvas.parentElement;
      return found instanceof HTMLElement ? found : canvas;
    };

    const resize = () => {
      const box = hostEl();
      const rect = box.getBoundingClientRect();
      const w = Math.max(1, Math.round(box.clientWidth || rect.width));
      const h = Math.max(1, Math.round(box.clientHeight || rect.height));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      stars = Array.from({ length: COUNT }, () => spawn(w, h));
      meteor = null;
    };

    resize();
    const ro = new ResizeObserver(resize);
    const observed = hostEl();
    ro.observe(observed);
    if (observed.parentElement) ro.observe(observed.parentElement);
    window.addEventListener("resize", resize);
    const later = window.setTimeout(resize, 50);

    const draw = (now: number) => {
      if (!running) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const t = (now - t0) / 1000;
      const dt = Math.min(0.05, (now - lastNow) / 1000);
      lastNow = now;

      ctx.clearRect(0, 0, w, h);
      const accent = hudRgb();

      for (const star of stars) {
        const twinkle = reduced
          ? 0
          : Math.sin(t * star.speed + star.phase) * 0.5 + 0.5;
        const alpha = Math.min(0.95, star.base + star.amp * twinkle);

        ctx.fillStyle = star.purple
          ? `rgba(${accent}, ${alpha})`
          : `rgba(220, 230, 236, ${alpha})`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
        ctx.fill();
      }

      if (!reduced) {
        if (!meteor && t >= nextMeteorAt) {
          meteor = spawnMeteor(w, h, t);
          nextMeteorAt += METEOR_EVERY_SEC;
        }
        if (meteor) {
          meteor.x += meteor.vx * dt;
          meteor.y += meteor.vy * dt;
          drawMeteor(ctx, meteor, t);
          const off =
            meteor.x < -120 ||
            meteor.x > w + 120 ||
            meteor.y < -80 ||
            meteor.y > h + 80;
          if (off || t - meteor.born >= meteor.duration) meteor = null;
        }
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", resize);
      window.clearTimeout(later);
    };
  }, []);

  return (
    <canvas
      className="home-stars"
      ref={canvasRef}
      aria-hidden="true"
    />
  );
}

/** Page layout over the shared workspace starfield. */
export function PageStarfield({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`pane-sky-ui${className ? ` ${className}` : ""}`}>
      {children}
    </div>
  );
}
