import { useEffect, useRef } from "react";

type Star = {
  x: number;
  y: number;
  z: number;
  pz: number;
};

const COUNT = 140;
const SPEED = 0.32;
const FOV = 320;

function spawn(w: number, h: number, far: boolean): Star {
  const depth = far ? 0.55 + Math.random() * 0.45 : Math.random();
  return {
    x: (Math.random() - 0.5) * w * 1.4,
    y: (Math.random() - 0.5) * h * 1.4,
    z: FOV * (0.35 + depth * 2.2),
    pz: FOV * (0.35 + depth * 2.2),
  };
}

/**
 * Lock-screen starfield: stars drift toward the viewer and pass out of frame.
 */
export function LockStars() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let stars: Star[] = [];
    let raf = 0;
    let running = true;

    const resize = () => {
      const parent = canvas.parentElement;
      const w = parent?.clientWidth ?? window.innerWidth;
      const h = parent?.clientHeight ?? window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      stars = Array.from({ length: COUNT }, () => spawn(w, h, true));
    };

    resize();
    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    const draw = () => {
      if (!running) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const cx = w / 2;
      const cy = h / 2;

      ctx.fillStyle = "#01060a";
      ctx.fillRect(0, 0, w, h);

      for (const star of stars) {
        star.pz = star.z;
        if (!reduced) {
          star.z -= SPEED * (12 + (FOV / Math.max(star.z, 1)) * 4);
        }

        if (star.z <= 8) {
          Object.assign(star, spawn(w, h, true));
          continue;
        }

        const sx = cx + (star.x * FOV) / star.z;
        const sy = cy + (star.y * FOV) / star.z;
        const px = cx + (star.x * FOV) / star.pz;
        const py = cy + (star.y * FOV) / star.pz;

        if (sx < -40 || sx > w + 40 || sy < -40 || sy > h + 40) {
          Object.assign(star, spawn(w, h, true));
          continue;
        }

        const near = 1 - Math.min(1, star.z / (FOV * 2.4));
        const radius = 0.4 + near * 1.8;
        const alpha = 0.25 + near * 0.65;

        // Short motion streak as the star approaches.
        const streak = near * near;
        const rgb =
          getComputedStyle(document.documentElement)
            .getPropertyValue("--hud-rgb")
            .trim() || "196, 196, 196";
        if (streak > 0.04) {
          ctx.beginPath();
          ctx.strokeStyle = `rgba(${rgb},${alpha * 0.55})`;
          ctx.lineWidth = Math.max(0.6, radius * 0.7);
          ctx.moveTo(px, py);
          ctx.lineTo(sx, sy);
          ctx.stroke();
        }

        ctx.beginPath();
        ctx.fillStyle = `rgba(${rgb},${alpha})`;
        ctx.arc(sx, sy, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas className="lock-stars" ref={canvasRef} aria-hidden="true" />;
}
