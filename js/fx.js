// Animated background: a 3D wave field of points (like a site survey grid) with rising flare embers.
import { reduceMotion } from "./ui.js";

export function startFx(canvas) {
  const ctx = canvas.getContext("2d");
  let W = 0, H = 0, dpr = 1, t = 0, raf = 0, running = true;
  let mx = 0, my = 0, tx = 0, ty = 0;
  let colors = readColors();
  const mobile = matchMedia("(max-width: 820px)").matches;
  const COLS = mobile ? 34 : 64, ROWS = mobile ? 18 : 30;
  const embers = Array.from({ length: mobile ? 26 : 70 }, () => newEmber(true));

  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    return { dot: cs.getPropertyValue("--grid-dot").trim(), accent: cs.getPropertyValue("--accent").trim(), hazard: cs.getPropertyValue("--hazard").trim(), light: document.documentElement.dataset.theme === "light" };
  }
  function newEmber(init) {
    return { x: Math.random(), y: init ? Math.random() : 1.05, s: .4 + Math.random() * 1.6, v: .0006 + Math.random() * .0016, w: Math.random() * 6.28, a: .2 + Math.random() * .6 };
  }
  function resize() {
    dpr = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.width = W + "px"; canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function frame() {
    if (!running) return;
    t += .006; mx += (tx - mx) * .04; my += (ty - my) * .04;
    ctx.clearRect(0, 0, W, H);
    // perspective wave field
    const horizon = H * (.52 + my * .03), fov = 420, camY = 140, spread = W * 1.6;
    ctx.fillStyle = colors.dot;
    for (let r = 0; r < ROWS; r++) {
      const z = 60 + r * 34;
      for (let c = 0; c < COLS; c++) {
        const xw = (c / (COLS - 1) - .5) * spread + mx * 80;
        const yw = Math.sin(c * .28 + t * 3) * 14 + Math.cos(r * .35 + t * 2.2) * 16 + Math.sin((c + r) * .15 + t) * 10;
        const s = fov / z, x = W / 2 + xw * s * .35, y = horizon + (camY - yw) * s * .55;
        if (y < 0 || y > H || x < -10 || x > W + 10) continue;
        const size = Math.max(.6, 2.2 * s * .5);
        ctx.globalAlpha = Math.min(1, (1 - r / ROWS) * 1.1);
        ctx.fillRect(x, y, size, size);
      }
    }
    // embers
    ctx.globalCompositeOperation = colors.light ? "source-over" : "lighter";
    for (const e of embers) {
      e.y -= e.v; e.w += .02; if (e.y < -.05) Object.assign(e, newEmber(false));
      const x = (e.x + Math.sin(e.w) * .01 + mx * .02 * e.s) * W, y = e.y * H;
      const flick = .6 + Math.sin(t * 20 + e.w * 3) * .4;
      ctx.globalAlpha = e.a * flick * (colors.light ? .5 : .9) * Math.min(1, e.y * 2);
      const g = ctx.createRadialGradient(x, y, 0, x, y, e.s * 5);
      g.addColorStop(0, colors.hazard); g.addColorStop(1, "transparent");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, e.s * 5, 0, 6.29); ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
    raf = requestAnimationFrame(frame);
  }
  resize(); addEventListener("resize", resize);
  addEventListener("pointermove", e => { tx = e.clientX / W - .5; ty = e.clientY / H - .5; }, { passive: true });
  document.addEventListener("visibilitychange", () => { running = !document.hidden; if (running) { cancelAnimationFrame(raf); frame(); } });
  if (reduceMotion()) { running = true; frame(); running = false; return { recolor() { colors = readColors(); running = true; frame(); running = false; } }; }
  frame();
  return { recolor() { colors = readColors(); } };
}

export function bindCursorGlow() {
  if (matchMedia("(pointer: coarse)").matches) return;
  const g = document.createElement("div"); g.className = "cursor-glow"; document.body.appendChild(g);
  let x = 0, y = 0, cx = 0, cy = 0;
  addEventListener("pointermove", e => { x = e.clientX; y = e.clientY; document.body.classList.add("has-pointer"); }, { passive: true });
  const loop = () => { cx += (x - cx) * .12; cy += (y - cy) * .12; g.style.transform = `translate(${cx - 260}px, ${cy - 260}px)`; requestAnimationFrame(loop); };
  g.style.left = g.style.top = "0px"; loop();
}
