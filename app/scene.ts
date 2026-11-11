// The town itself: a canvas scene drawn in "world pixels". World x is measured from the bakery
// door (0 = centre of the street), so the scene stays centred at any screen width.
import type { Invoice } from "@/lib/paypal";

export type Step = { x?: number; say?: string; color?: string; ms?: number; at?: number; onArrive?: () => void };
export type Kind = "folk" | "ava" | "mira" | "cole";
export type Actor = {
  id: string; name: string; kind: Kind;
  x: number; tx: number; home: number; dy: number; look: string[];
  bubble?: { text: string; until: number; color: string }; script: Step[]; inv?: Invoice;
};
export type View = { W: number; H: number; scale: number; cx: number; ground: number };
type Spark = { x: number; y: number; vx: number; vy: number; born: number; life: number; color: string };
export type Fx = {
  sparks: Spark[];
  rockets: { x: number; top: number; at: number; color: string; done?: boolean }[];
  floats: { text: string; x: number; born: number; color: string }[];
};

export const P = 2, TALL = 13 * P + 3; // person pixel size; head-top offset for bubbles and hit-tests
export const HOME = { ava: -123, mira: 0, cole: 123 };
export const GOOD = "#52ffa8", BAD = "#ff5c7a", GOLD = "#ffd24a", HOT = "#ff4f9a", CYAN = "#3ee7ff";
const PARTY = [HOT, CYAN, GOLD, "#8dff6a", "#b98bff"];

export const money = (n: number) => "$" + n.toFixed(n % 1 ? 2 : 0);
// similar strings ("s1", "s2") must land far apart, so the running hash gets a final scramble
export const hash = (s: string) => {
  let n = [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  n = Math.imul(n ^ (n >>> 15), 0x2c1b3c6d); n = Math.imul(n ^ (n >>> 12), 0x297a2d39);
  return (n ^ (n >>> 15)) >>> 0;
};
const pick = <T,>(a: T[], n: number) => a[n % a.length];
export const lookFor = (s: string) => {
  const h = hash(s);
  return [
    pick(["#2b1d14", "#6b3e26", "#e0b354", "#c2452f", "#1c1c1c", "#e8e2d2", "#7a3fb0"], h),
    pick(["#f1c7a5", "#d9a07a", "#a8714f", "#6e4630", "#f5d6bf"], h >>> 3),
    pick(["#4db5ff", "#ff7a59", "#9be33a", "#c77dff", "#ffd23a", "#ff8fc0", "#3fe0c5"], h >>> 6),
    pick(["#2d3047", "#4a2e52", "#2f5a2a", "#1f4e63"], h >>> 9),
  ];
};
export const STAFF: Record<"ava" | "mira" | "cole", { name: string; role: string; look: string[] }> = {
  mira: { name: "Mira", role: "Manager", look: ["#c2452f", "#f1c7a5", "#fff4e0", "#4a2e52"] },
  ava: { name: "Ava", role: "Accountant", look: ["#1c1c1c", "#d9a07a", "#2fd39a", "#1f4e63"] },
  cole: { name: "Cole", role: "Courier", look: ["#6b3e26", "#a8714f", "#ff7a2e", "#2d3047"] },
};

export const zone = (inv: Invoice) => (inv.status === "PAID" || inv.status === "MARKED_AS_PAID" ? "paid" : inv.overdue ? "overdue" : "open");
/** Where the i-th person of a group stands. Narrow screens pull the overdue group inward so it stays visible. */
export function homeX(z: "overdue" | "open" | "paid", i: number, halfW: number) {
  const left = -Math.min(226, Math.max(150, halfW - 12));
  const [a, b] = z === "overdue" ? [left, -134] : z === "open" ? [62, 112] : [-44, 44];
  return a + ((i * 19) % (b - a));
}

/** Size the backing store to the element and pick a whole-number pixel scale so edges stay crisp. */
export function fit(canvas: HTMLCanvasElement): View {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const dw = Math.max(1, Math.round(canvas.clientWidth * dpr)), dh = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== dw || canvas.height !== dh) { canvas.width = dw; canvas.height = dh; }
  // Wide screens: the largest scale that still shows the whole town (472 world px).
  // Tall, narrow screens: keep people big and crop the far ends instead (the three main shops need 330).
  const scale = Math.max(1, Math.min(Math.round(dh / 210), Math.floor(dw / (dw < dh * 1.2 ? 330 : 472))));
  const W = Math.ceil(dw / scale), H = Math.ceil(dh / scale);
  return { W, H, scale, cx: Math.round(W / 2), ground: H - 30 };
}

/* ---------- effects ---------- */

export const newFx = (): Fx => ({ sparks: [], rockets: [], floats: [] });
export function coins(fx: Fx, x: number, now: number) {
  for (let i = 0; i < 14; i++) fx.sparks.push({ x: x - 6 + Math.random() * 12, y: 14 - TALL, vx: (Math.random() - 0.5) * 0.9, vy: -0.9 - Math.random() * 0.9, born: now, life: 900 + Math.random() * 500, color: GOLD });
}
export function fireworks(fx: Fx, x: number, now: number) {
  for (let i = 0; i < 4; i++) fx.rockets.push({ x: x + (i - 1.5) * 34 + Math.random() * 10, top: -96 - Math.random() * 34, at: now + i * 260, color: PARTY[i % PARTY.length] });
}
export const floatText = (fx: Fx, text: string, x: number, now: number, color = GOLD) => fx.floats.push({ text, x, born: now, color });

/* ---------- frame ---------- */

export function draw(
  ctx: CanvasRenderingContext2D, v: View, now: number, night: boolean, font: string,
  actors: Actor[], fx: Fx, hoverId: string | null, selectedId: string | null, paidTotal: number,
) {
  const { W, H, scale, cx, ground } = v, B = ground - 14; // B = where buildings meet the pavement
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over"; ctx.shadowBlur = 0;

  const r = (x: number, y: number, w: number, h: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
  /** world rect: x from the street centre, y from the pavement line (negative is up) */
  const wr = (x: number, y: number, w: number, h: number, c: string) => r(cx + x, B + y, w, h, c);
  const disc = (x: number, y: number, rad: number, c: string) => {
    for (let dy = -rad; dy <= rad; dy++) { const hw = Math.round(Math.sqrt(rad * rad - dy * dy)); r(x - hw, y + dy, hw * 2 + 1, 1, c); }
  };
  const line = (x0: number, y0: number, x1: number, y1: number, c: string) => {
    const n = Math.max(1, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let i = 0; i <= n; i++) r(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, 1, 1, c);
  };
  const glow = (x: number, y: number, rad: number, c: string, alpha: number) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, c); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = alpha; ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
  };
  const text = (s: string, x: number, y: number, c: string, size = 6, neon?: string) => {
    ctx.font = `${size}px ${font}`; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic"; ctx.fillStyle = c;
    if (neon && night) { ctx.shadowColor = neon; ctx.shadowBlur = 5 * scale; ctx.fillText(s, x, y); }
    ctx.fillText(s, x, y); ctx.shadowBlur = 0;
  };
  const lit = (seed: number) => (night ? (Math.sin(now / 900 + seed) > -0.96 ? "#ffd978" : "#c79a4a") : "#bfe9ff");

  /* sky */
  const sky = ctx.createLinearGradient(0, 0, 0, B);
  (night ? [[0, "#0b0530"], [0.5, "#2b0f6b"], [0.82, "#8a2a9a"], [1, "#ff6a8a"]] : [[0, "#1f8fff"], [0.6, "#86d4ff"], [1, "#ffeab5"]])
    .forEach(([s, c]) => sky.addColorStop(s as number, c as string));
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, B);
  const orbX = Math.round(W * 0.7), orbY = Math.min(48, Math.round(B * 0.3));
  if (night) {
    for (let i = 0; i < 120; i++) {
      const h = hash("s" + i), x = h % W, y = (h >>> 9) % Math.round(B * 0.72), tw = Math.sin(now / 520 + i * 1.7);
      r(x, y, 1, 1, tw > 0.55 ? "#ffffff" : "#b9a8ff");
      if (i % 19 === 0 && tw > 0) { r(x - 1, y, 3, 1, "#ffffff"); r(x, y - 1, 1, 3, "#ffffff"); }
    }
    const t = (now % 9000) / 650;
    if (t < 1) for (let k = 0; k < 9; k++) { ctx.globalAlpha = 1 - k / 9; r(W * 0.18 + t * 150 - k * 3, 14 + t * 46 - k, 2, 1, "#fff"); ctx.globalAlpha = 1; }
    glow(orbX, orbY, 70, "#ffe9a8", 0.28);
    disc(orbX, orbY, 15, "#fff3c4"); disc(orbX - 5, orbY - 4, 3, "#ead9a0"); disc(orbX + 6, orbY + 5, 2, "#ead9a0"); disc(orbX + 3, orbY - 8, 1, "#ead9a0");
  } else {
    glow(orbX, orbY, 80, "#fff6c2", 0.55);
    for (let k = 0; k < 8; k++) { const a = now / 4000 + (k * Math.PI) / 4; line(orbX + Math.cos(a) * 19, orbY + Math.sin(a) * 19, orbX + Math.cos(a) * 25, orbY + Math.sin(a) * 25, "#fff1a8"); }
    disc(orbX, orbY, 14, "#fff1a8"); disc(orbX, orbY, 10, "#ffe36e");
    for (let i = 0; i < 3; i++) { const x = ((now * 0.02 + i * 130) % (W + 40)) - 20, y = 34 + i * 13 + Math.sin(now / 400 + i) * 3, f = Math.floor(now / 180 + i) % 2 ? -1 : 1; r(x, y, 2, 1, "#2a1540"); r(x + 3, y, 2, 1, "#2a1540"); r(x + 2, y + f, 1, 1, "#2a1540"); }
  }
  for (let i = 0; i < 7; i++) {
    const h = hash("c" + i), x = ((h % (W + 80)) + now * (0.003 + 0.0015 * i)) % (W + 80) - 40, y = 16 + ((h >>> 8) % Math.max(20, Math.round(B * 0.45)));
    ctx.globalAlpha = night ? 0.16 : 0.92; const c = night ? "#c9a8ff" : "#ffffff";
    r(x, y, 28, 6, c); r(x + 4, y - 4, 18, 5, c); r(x + 9, y - 7, 9, 4, c); ctx.globalAlpha = 1;
  }

  /* far and near skyline */
  for (const [gap, base, tone, lift] of [[22, 34, night ? "#1c0d4f" : "#8cc3ea", 58], [37, 22, night ? "#2a1263" : "#a9d5f2", 40]] as const) {
    for (let i = -30; i <= 30; i++) {
      const h = hash("b" + gap + i), x = i * gap + (h % 8), bw = 16 + ((h >>> 10) % 12), bh = base + ((h >>> 4) % lift);
      if (cx + x < -40 || cx + x > W + 10) continue;
      wr(x, -bh, bw, bh, tone);
      if (h % 5 === 0) wr(x + bw / 2, -bh - 6, 1, 6, tone);
      for (let wy = 5; wy < bh - 6; wy += 7) for (let wx = 3; wx < bw - 3; wx += 5) {
        const k = hash(`${i}.${wx}.${wy}`);
        if (k % 3 === 0) wr(x + wx, -bh + wy, 2, 3, night ? (Math.sin(now / 1300 + k) > -0.7 ? "#ffd978" : "#6a4fb0") : "#d8eefc");
      }
    }
  }
  const haze = ctx.createLinearGradient(0, B - 60, 0, B);
  haze.addColorStop(0, "rgba(0,0,0,0)"); haze.addColorStop(1, night ? "rgba(255,90,150,.30)" : "rgba(255,240,200,.45)");
  ctx.fillStyle = haze; ctx.fillRect(0, B - 60, W, 60);

  /* trees and little houses out to the edges */
  const tree = (x: number, s: number) => {
    wr(x - 1, -12, 3, 12, "#6b4426");
    const c1 = night ? "#1d7a70" : "#3ecf6e", c2 = night ? "#155c60" : "#2fae5c";
    disc(cx + x - 6, B - 15, 6, c2); disc(cx + x + 6, B - 15, 6, c2); disc(cx + x, B - 21, 9, c1);
    if (night) for (let k = 0; k < 6; k++) { const hh = hash("t" + s + k); if (Math.sin(now / 350 + k * 2 + s) > 0) wr(x - 7 + (hh % 15), -27 + ((hh >>> 4) % 14), 1, 1, PARTY[k % PARTY.length]); }
  };
  const house = (x: number, s: number) => {
    const wall = pick(night ? ["#7a3fb0", "#b0407a", "#2f7fb8"] : ["#ffb3d1", "#ffe08a", "#9be8ff"], s), roof = night ? "#3a1766" : "#ff6a59";
    wr(x, -30, 30, 30, wall);
    for (let k = 0; k < 9; k++) wr(x - 2 + k * 2, -31 - k, 34 - k * 4, 1, roof);
    wr(x + 5, -22, 8, 8, lit(s)); wr(x + 18, -14, 7, 14, night ? "#2a0d3e" : "#7a3b2e");
  };
  for (let i = 0; i < 8; i++) for (const side of [-1, 1]) {
    const x = side * (254 + i * 36);
    if (Math.abs(x) > W / 2 + 30) continue;
    if ((i + (side > 0 ? 1 : 0)) % 2) house(x - 15, i + side + 4); else tree(x, i * side + 9);
  }

  /* town vault: its display shows the money actually collected */
  const vr: typeof wr = (x, y, w, h, c) => wr(x + 12, y, w, h, c);
  const stone = night ? "#6a5a9c" : "#f2e6c8", stoneD = night ? "#4c3f7c" : "#d9c9a3", stoneL = night ? "#8b7bc0" : "#fff7e2";
  vr(-246, -66, 68, 66, stone);
  for (let k = 0; k < 9; k++) vr(-248 + k * 4, -67 - k, 72 - k * 8, 1, stoneD);
  vr(-248, -66, 72, 3, stoneL);
  for (const x of [-242, -226, -206, -190]) { vr(x, -44, 6, 40, stoneL); vr(x + 4, -44, 2, 40, stoneD); }
  vr(-248, -4, 72, 4, stoneD);
  vr(-236, -60, 48, 13, "#12082a"); text(money(paidTotal), cx - 200, B - 50, GOLD, 8, "#ff9a2e");
  vr(-219, -36, 14, 32, "#1b0f38"); disc(cx - 200, B - 20, 4, GOLD); disc(cx - 200, B - 20, 2, "#1b0f38");
  text("VAULT", cx - 200, B - 68, night ? "#e9dcff" : "#7a6a4a", 5);

  /* ledger & co: Ava's office */
  const teal = night ? "#0f6f73" : "#19b5a5", tealD = night ? "#0a4f55" : "#128a80";
  wr(-160, -66, 74, 66, teal); wr(-163, -70, 80, 5, tealD);
  for (let y = -60; y < -4; y += 8) wr(-160, y, 74, 1, tealD);
  wr(-152, -62, 58, 11, "#06262b"); text("LEDGER & CO", cx - 123, B - 54, night ? CYAN : "#e9fffb", 6, CYAN);
  for (const x of [-154, -110]) { wr(x - 1, -39, 20, 20, "#eafff9"); wr(x, -38, 18, 18, lit(x)); wr(x + 8, -38, 1, 18, tealD); wr(x, -30, 18, 1, tealD); }
  for (let k = 0; k < 4; k++) wr(-133 + k * 5, -33, 5, 4, k % 2 ? "#fff4e0" : "#2fd39a");
  wr(-130, -28, 14, 28, "#06262b"); wr(-128, -25, 10, 12, lit(3)); wr(-119, -12, 1, 2, GOLD);
  wr(-92, -52, 1, 8, "#06262b"); wr(-98, -45, 12, 10, GOLD); text("$", cx - 92, B - 37, "#06262b", 7);

  /* hearth bakery: the shop */
  const brick = night ? "#8a2f3a" : "#e8604a", brickD = night ? "#6a2030" : "#c44a38", cream = "#fff1dc";
  wr(-52, -82, 104, 82, brick);
  for (let row = 0; row < 14; row++) for (let k = 0; k < 11; k++) wr(-52 + (row % 2) * 5 + k * 10, -82 + row * 6, 6, 1, brickD);
  wr(-56, -86, 112, 5, night ? "#3a1020" : "#8a2f2a");
  wr(30, -100, 11, 15, brickD); wr(28, -102, 15, 3, night ? "#3a1020" : "#8a2f2a");
  for (let k = 0; k < 6; k++) { const age = (now / 2600 + k / 6) % 1; ctx.globalAlpha = (1 - age) * (night ? 0.35 : 0.7); disc(cx + 35 + Math.sin(age * 5 + k) * 4 + age * 10, B - 104 - age * 34, 2 + Math.round(age * 4), night ? "#d9c8ff" : "#ffffff"); ctx.globalAlpha = 1; }
  for (let k = 0; k < 17; k++) { const c = PARTY[k % PARTY.length]; wr(-51 + k * 6, -81, 5, 2, c); wr(-50 + k * 6, -79, 3, 1, c); wr(-49 + k * 6, -78, 1, 1, c); }
  for (const x of [-42, -9, 24]) {
    wr(x - 1, -75, 20, 18, cream); wr(x, -74, 18, 16, lit(x)); wr(x + 8, -74, 1, 16, brickD);
    wr(x - 2, -57, 22, 3, "#6b4426"); for (let k = 0; k < 5; k++) wr(x + k * 4, -59, 2, 2, k % 2 ? HOT : GOLD);
  }
  wr(-44, -53, 88, 13, "#2a0d2e"); wr(-44, -53, 88, 1, GOLD); wr(-44, -41, 88, 1, GOLD);
  text("HEARTH BAKERY", cx, B - 43, night ? "#ffd36b" : cream, 8, "#ff8a2e");
  for (let k = 0; k < 13; k++) { const c = k % 2 ? cream : HOT; wr(-52 + k * 8, -39, 8, 7, c); wr(-51 + k * 8, -32, 6, 2, c); }
  for (const x of [-46, 12]) {
    wr(x - 1, -29, 36, 24, cream); wr(x, -28, 34, 22, night ? "#ffd27a" : "#fff6dc");
    wr(x, -12, 34, 1, "#b0763c"); wr(x, -6, 34, 6, "#8a5a2a");
    for (let k = 0; k < 4; k++) { wr(x + 2 + k * 8, -11, 6, 4, "#c98a4b"); wr(x + 3 + k * 8, -12, 4, 1, "#e6b06c"); }
    wr(x + 5, -22, 9, 6, "#fff"); wr(x + 6, -24, 7, 2, HOT); wr(x + 9, -26, 1, 2, "#ff2f4f"); wr(x + 7, -16, 5, 4, cream);
    wr(x + 19, -21, 11, 5, "#e6b06c"); wr(x + 20, -22, 9, 1, "#f5cf8e");
  }
  wr(-9, -31, 18, 31, "#3b1420"); wr(-7, -28, 14, 15, night ? "#ffd27a" : "#fff6dc"); wr(5, -11, 1, 3, GOLD);
  text("OPEN", cx, B - 18, night ? CYAN : "#12789a", 4, CYAN);
  if (night) glow(cx, B + 2, 70, "#ffb347", 0.4);

  /* post office: Cole's base */
  const blue = night ? "#2740b8" : "#3f6bff", blueD = night ? "#1a2c86" : "#2b4fd0";
  wr(86, -66, 74, 66, blue); wr(83, -70, 80, 5, blueD);
  for (let y = -60; y < -4; y += 8) wr(86, y, 74, 1, blueD);
  wr(104, -62, 38, 11, "#0b1440"); text("POST", cx + 123, B - 54, night ? "#ffe9a8" : "#ffffff", 6, GOLD);
  for (const x of [92, 136]) { wr(x - 1, -39, 20, 20, "#eaf1ff"); wr(x, -38, 18, 18, lit(x)); wr(x + 8, -38, 1, 18, blueD); wr(x, -30, 18, 1, blueD); }
  wr(116, -28, 14, 28, "#0b1440"); wr(118, -25, 10, 12, lit(5)); wr(127, -12, 1, 2, GOLD);
  wr(150, -86, 1, 17, "#dfe6ff"); for (let k = 0; k < 9; k++) wr(151 + k, -86 + Math.round(Math.sin(now / 260 + k * 0.8) * 1.2), 1, 6, k % 4 < 2 ? HOT : cream);
  wr(150, -13, 8, 13, "#ff3b4f"); wr(149, -15, 10, 3, "#c92a3c"); wr(152, -9, 4, 1, "#fff");
  wr(134, -8, 9, 8, "#c8955a"); wr(138, -8, 1, 8, "#8a5a2a"); wr(137, -14, 7, 6, "#d9a76a"); wr(140, -14, 1, 6, "#8a5a2a");
  wr(90, -10, 26, 2, "#b06a34"); wr(90, -6, 26, 2, "#c98040"); wr(92, -4, 2, 4, "#5a341a"); wr(112, -4, 2, 4, "#5a341a");

  /* café and clock tower: the clock shows the real time */
  const cr: typeof wr = (x, y, w, h, c) => wr(x - 12, y, w, h, c);
  const pink = night ? "#b0407a" : "#ff7eb6", pinkD = night ? "#7a2a5a" : "#e0558f";
  cr(178, -44, 68, 44, pink); cr(176, -47, 72, 4, pinkD);
  cr(198, -112, 28, 68, pink); cr(198, -112, 3, 68, pinkD);
  for (let k = 0; k < 12; k++) cr(196 + k, -113 - k, 32 - k * 2, 1, night ? "#17545a" : "#19b5a5");
  disc(cx + 200, B - 92, 10, "#12082a"); disc(cx + 200, B - 92, 9, "#fff7e2");
  const d = new Date(), hr = ((d.getHours() % 12) + d.getMinutes() / 60) * (Math.PI / 6) - Math.PI / 2, mn = d.getMinutes() * (Math.PI / 30) - Math.PI / 2;
  line(cx + 200, B - 92, cx + 200 + Math.cos(hr) * 4, B - 92 + Math.sin(hr) * 4, "#12082a");
  line(cx + 200, B - 92, cx + 200 + Math.cos(mn) * 7, B - 92 + Math.sin(mn) * 7, HOT);
  for (let k = 0; k < 9; k++) { const c = k % 2 ? cream : CYAN; cr(178 + k * 8, -30, 8, 5, c); cr(179 + k * 8, -25, 6, 2, c); }
  text("CAFE", cx + 200, B - 34, night ? "#ffe9a8" : "#fff", 6, HOT);
  cr(183, -21, 24, 16, lit(8)); cr(183, -13, 24, 1, pinkD); cr(218, -22, 12, 22, "#3a1030"); cr(220, -19, 8, 9, lit(9));

  /* string lights between the buildings */
  for (const [x0, x1, y] of [[-86, -52, -62], [52, 86, -62]]) {
    for (let k = 0; k <= 12; k++) { const t = k / 12, x = x0 + (x1 - x0) * t, yy = y + Math.sin(t * Math.PI) * 6; wr(x, yy, 1, 1, "#2a1540"); if (k % 3 === 1) { const on = Math.sin(now / 300 + k + x0) > -0.3; wr(x, yy + 1, 2, 2, on ? PARTY[k % PARTY.length] : "#5a4a7a"); } }
  }

  /* pavement, street lamps, road */
  r(0, B, W, 23, night ? "#4a3585" : "#f3dcb4");
  for (let x = cx % 16; x < W; x += 16) r(x, B, 1, 23, night ? "#3a2870" : "#e2c797");
  r(0, B, W, 1, night ? "#6a52b0" : "#fff1d2"); r(0, B + 21, W, 2, night ? "#2a1a5a" : "#c9ab78");
  r(0, B + 23, W, H - B - 23, night ? "#1a1035" : "#5b5672");
  for (let x = (cx % 28) - 28; x < W; x += 28) r(x, B + 33, 14, 2, night ? "#c9a23a" : "#fff3c4");
  for (let k = 0; k < 5; k++) r(cx - 14 + k * 6, B + 24, 3, H - B - 24, "rgba(255,255,255,.55)");
  for (const x of [-69, 69]) {
    wr(x, -50, 2, 50, "#1c1238"); wr(x - 2, -3, 6, 3, "#1c1238"); wr(x - 4, -55, 10, 6, night ? "#ffe08a" : "#fff7e0"); wr(x - 5, -57, 12, 2, "#1c1238");
    if (night) { glow(cx + x + 1, B - 52, 40, "#ffd27a", 0.6); glow(cx + x + 1, B + 12, 34, "#ffb347", 0.22); }
  }
  if (night) for (let i = 0; i < 18; i++) {
    const h = hash("f" + i); ctx.globalAlpha = 0.5 + 0.5 * Math.sin(now / 300 + i * 3);
    r((h % W) + Math.sin(now / 1700 + i) * 14, B - 8 - ((h >>> 7) % 54) + Math.cos(now / 1300 + i * 2) * 6, 1, 1, "#e4ff8a"); ctx.globalAlpha = 1;
  }

  /* people */
  for (const a of actors) stepActor(a, now);
  const sorted = [...actors].sort((a, b) => a.dy - b.dy);
  for (const a of sorted) {
    if (a.id === selectedId || a.id === hoverId) { ctx.globalAlpha = 0.5; r(cx + a.x - 9, ground + a.dy - 1, 18, 3, a.id === selectedId ? CYAN : "#ffffff"); ctx.globalAlpha = 1; }
    person(r, cx, ground, a, now);
  }
  for (const a of sorted) {
    const x = cx + a.x, y = ground + a.dy - TALL, talking = a.bubble && now < a.bubble.until;
    if (a.id === selectedId) { const yy = y - 7 + Math.round(Math.sin(now / 180) * 2); r(x - 3, yy, 7, 2, CYAN); r(x - 2, yy + 2, 5, 2, CYAN); r(x - 1, yy + 4, 3, 1, CYAN); r(x, yy + 5, 1, 1, CYAN); }
    else if (a.inv?.overdue && !talking) { const yy = y - 8 + Math.round(Math.sin(now / 260 + a.x) * 1.5); r(x - 2, yy - 1, 5, 9, "#12082a"); r(x - 1, yy, 3, 4, BAD); r(x - 1, yy + 5, 3, 2, BAD); }
    if (talking) bubble(ctx, W, a.bubble!.text, x, y - 2, a.bubble!.color, font);
    else if (hoverId === a.id && a.id !== selectedId) bubble(ctx, W, a.inv ? `${a.name} · ${money(a.inv.amount)}` : a.name, x, y - 2, "#fff", font);
  }

  /* a delivery van passes now and then */
  const lap = now % 26000;
  if (lap < 9000) {
    const dir = Math.floor(now / 26000) % 2 ? -1 : 1, t = lap / 9000, x = cx + dir * (-W / 2 - 50 + t * (W + 100)), y = H - 19;
    r(x - 15, y, 30, 11, HOT); r(x - 15, y + 8, 30, 3, "#c92f78");
    r(x + dir * 9 - 5, y + 2, 9, 5, night ? "#bfefff" : "#eaffff"); r(x - dir * 8 - 5, y + 3, 10, 4, cream); r(x - dir * 8 - 1, y + 3, 2, 4, "#c8955a");
    disc(x - 9, y + 11, 3, "#12082a"); disc(x + 9, y + 11, 3, "#12082a"); r(x - 10, y + 10, 2, 2, "#9a8ad0"); r(x + 8, y + 10, 2, 2, "#9a8ad0");
    if (night) glow(x + dir * 20, y + 8, 22, "#fff3b0", 0.55);
  }

  /* celebration effects */
  for (const k of fx.rockets) {
    if (k.done || now < k.at) continue;
    const t = (now - k.at) / 520;
    if (t < 1) { for (let i = 0; i < 5; i++) { ctx.globalAlpha = 1 - i / 5; wr(k.x, k.top * t + i * 3, 1, 2, "#fff"); ctx.globalAlpha = 1; } }
    else { k.done = true; for (let i = 0; i < 34; i++) { const a = (i / 34) * Math.PI * 2, s = 0.5 + Math.random() * 1.1; fx.sparks.push({ x: k.x, y: k.top, vx: Math.cos(a) * s, vy: Math.sin(a) * s, born: now, life: 900 + Math.random() * 600, color: i % 5 ? k.color : "#fff" }); } }
  }
  for (const s of fx.sparks) {
    const age = (now - s.born) / s.life;
    if (age >= 1) continue;
    s.x += s.vx; s.y += s.vy; s.vy += 0.022; s.vx *= 0.985;
    ctx.globalAlpha = 1 - age * age; wr(s.x, s.y, 2, 2, s.color); if (s.color === GOLD) wr(s.x, s.y, 1, 1, "#fff6c2"); ctx.globalAlpha = 1;
    if (s.color !== GOLD && night) glow(cx + s.x, B + s.y, 5, s.color, 0.35 * (1 - age));
  }
  for (const f of fx.floats) {
    const age = (now - f.born) / 2200;
    if (age >= 1) continue;
    const x = cx + f.x, y = B - 40 - age * 34;
    ctx.globalAlpha = age > 0.7 ? (1 - age) / 0.3 : 1;
    for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]]) text(f.text, x + ox, y + oy, "#12082a", 12);
    text(f.text, x, y, f.color, 12, f.color); ctx.globalAlpha = 1;
  }
  fx.sparks = fx.sparks.filter((s) => now - s.born < s.life);
  fx.rockets = fx.rockets.filter((k) => !k.done);
  fx.floats = fx.floats.filter((f) => now - f.born < 2200);
}

function stepActor(a: Actor, now: number) {
  const s = a.script[0];
  if (s) {
    if (s.x !== undefined && Math.abs(a.x - s.x) > 0.6) a.tx = s.x;
    else if (s.at === undefined) {
      s.at = now + (s.ms ?? 0);
      if (s.say) a.bubble = { text: s.say, until: s.at + 600, color: s.color ?? "#fff" };
      s.onArrive?.();
    } else if (now >= s.at) a.script.shift();
  } else {
    a.tx = a.home + (a.kind === "folk" && a.inv && zone(a.inv) === "paid" ? Math.sin(now / 3000 + hash(a.id)) * 6 : 0);
  }
  const d = a.tx - a.x;
  a.x += Math.sign(d) * Math.min(Math.abs(d), a.kind !== "folk" ? 0.8 : s ? 1.1 : 0.5); // customers hurry when they have somewhere to be
}

type Rect = (x: number, y: number, w: number, h: number, c: string) => void;

function person(draw: Rect, cx: number, ground: number, a: Actor, now: number) {
  const [hair, skin, shirt, pants] = a.look;
  // the sprite is designed on a 7x13 grid; each grid pixel is drawn P world pixels wide
  const ox = cx + Math.round(a.x) - Math.round(3.5 * P), oy = ground + a.dy - 13 * P;
  const r: Rect = (dx, dy, w, h, c) => draw(ox + dx * P, oy + dy * P, w * P, h * P, c);
  const walking = Math.abs(a.tx - a.x) > 0.6, f = walking ? Math.floor(now / 140) % 2 : 0;
  const bob = walking ? f : 0, blink = (now + hash(a.id) * 37) % 4200 < 140;
  draw(ox + P, oy + 13 * P, 5 * P, 2, "rgba(10,0,40,.35)");
  r(1, bob, 5, 2, hair); r(1, 2 + bob, 5, 3, skin); r(1, 2 + bob, 1, 1, hair); r(5, 2 + bob, 1, 1, hair);
  if (!blink) { r(2, 3 + bob, 1, 1, "#1a1026"); r(4, 3 + bob, 1, 1, "#1a1026"); }
  r(0, 5, 7, 4, shirt); r(0, 8, 1, 1, skin); r(6, 8, 1, 1, skin);
  r(1, 9, 2, f ? 3 : 4, pants); r(4, 9, 2, f ? 4 : 3, pants);
  if (a.kind === "mira") { r(1, -2 + bob, 5, 2, "#ffffff"); r(0, -3 + bob, 7, 1, "#ffffff"); r(2, 5, 3, 4, "#ffffff"); r(3, 5, 1, 1, HOT); }
  if (a.kind === "ava") { r(1, 3 + bob, 5, 1, "#12082a"); r(6, 5, 2, 3, "#fff4e0"); r(6, 5, 2, 1, GOLD); }
  if (a.kind === "cole") { r(0, -1 + bob, 6, 2, "#ff7a2e"); r(5, 1 + bob, 2, 1, "#ff7a2e"); if (a.script.length) { r(5, 5, 4, 4, "#c8955a"); r(6, 5, 1, 4, "#8a5a2a"); } }
}

function bubble(ctx: CanvasRenderingContext2D, W: number, s: string, x: number, y: number, color: string, font: string) {
  ctx.font = `6px ${font}`; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  const w = Math.ceil(ctx.measureText(s).width) + 7, bx = Math.max(2, Math.min(W - w - 2, Math.round(x - w / 2)));
  ctx.fillStyle = "#12082a"; ctx.fillRect(bx - 1, y - 12, w + 2, 12); ctx.fillRect(bx, y - 13, w, 14);
  ctx.fillStyle = color; ctx.fillRect(bx, y - 11, w, 10); ctx.fillRect(bx + 1, y - 12, w - 2, 12);
  ctx.fillStyle = "#12082a"; ctx.fillRect(Math.round(x) - 2, y + 1, 4, 1); ctx.fillRect(Math.round(x) - 1, y + 2, 2, 1);
  ctx.fillStyle = color; ctx.fillRect(Math.round(x) - 1, y, 2, 2);
  ctx.fillStyle = "#12082a"; ctx.fillText(s, bx + 4, y - 4);
}

/** 12x12 portrait used in the dialog bar and the record card. */
export function drawFace(ctx: CanvasRenderingContext2D, look: string[], kind: Kind, bg: string) {
  const [hair, skin, shirt] = look;
  const r = (x: number, y: number, w: number, h: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  r(0, 0, 12, 12, bg);
  r(1, 10, 10, 2, shirt); r(5, 9, 2, 1, skin);
  r(3, 3, 6, 6, skin); r(2, 1, 8, 3, hair); r(2, 3, 1, 3, hair); r(9, 3, 1, 3, hair);
  r(4, 5, 1, 1, "#1a1026"); r(7, 5, 1, 1, "#1a1026"); r(5, 7, 2, 1, "#b0483a");
  if (kind === "mira") { r(3, 0, 6, 2, "#ffffff"); r(2, 1, 8, 1, "#ffffff"); r(5, 10, 2, 2, "#ffffff"); }
  if (kind === "ava") { r(3, 5, 6, 1, "#12082a"); r(4, 5, 1, 1, "#bfefff"); r(7, 5, 1, 1, "#bfefff"); }
  if (kind === "cole") { r(2, 1, 8, 2, "#ff7a2e"); r(1, 3, 6, 1, "#ff7a2e"); }
}
