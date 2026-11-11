"use client";
import { useEffect, useRef, useState } from "react";
import type { Invoice } from "@/lib/paypal";

type Step = { x?: number; say?: string; color?: string; ms?: number; at?: number; onArrive?: () => void };
type Actor = {
  id: string; name: string; kind: "folk" | "ava" | "mira" | "cole";
  x: number; tx: number; home: number; dy: number; look: string[];
  bubble?: { text: string; until: number; color: string }; script: Step[]; inv?: Invoice;
};
type Msg = { role: "user" | "assistant"; content: string };
type Action = { tool: string; args: Record<string, unknown>; ok: boolean };

const W = 320, H = 180, S = 3, GROUND = 134;
const P = 2, TALL = 13 * P + 3; // person pixel size, and head-top offset used for bubbles and hit-tests
const HOME = { ava: 45, mira: 161, cole: 275 };
const GOOD = "#6fdc8c", BAD = "#ff6b6b", GOLD = "#ffcf4a";
const money = (n: number) => "$" + n.toFixed(n % 1 ? 2 : 0);
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const pick = <T,>(a: T[], n: number) => a[n % a.length];
const lookFor = (s: string) => {
  const h = hash(s);
  return [
    pick(["#2b1d14", "#6b3e26", "#e0b354", "#a33b2b", "#1c1c1c", "#d9d4c7"], h),
    pick(["#f1c7a5", "#d9a07a", "#a8714f", "#6e4630", "#f5d6bf"], h >> 3),
    pick(["#5aa9e6", "#e76f51", "#8ac926", "#c77dff", "#ffca3a", "#ff8fab", "#4ecdc4"], h >> 6),
    pick(["#2d3047", "#3a2e39", "#41521f", "#264653"], h >> 9),
  ];
};
const zone = (inv: Invoice) => (inv.status === "PAID" || inv.status === "MARKED_AS_PAID" ? "paid" : inv.overdue ? "overdue" : "open");
const ZONES = { overdue: [10, 92], open: [206, 242], paid: [118, 204] } as const;

function staff(kind: "ava" | "mira" | "cole", name: string, look: string[]): Actor {
  return { id: kind, name, kind, x: HOME[kind], tx: HOME[kind], home: HOME[kind], dy: 0, look, script: [] };
}

export default function Town() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const actors = useRef(new Map<string, Actor>([
    ["ava", staff("ava", "Ava · accountant", ["#1c1c1c", "#d9a07a", "#3f8f6b", "#264653"])],
    ["mira", staff("mira", "Mira · manager", ["#a33b2b", "#f1c7a5", "#f3ead8", "#3a2e39"])],
    ["cole", staff("cole", "Cole · courier", ["#6b3e26", "#a8714f", "#e76f51", "#2d3047"])],
  ]));
  const coins = useRef<{ x: number; y: number; vy: number; until: number }[]>([]);
  const hover = useRef<string | null>(null);
  const seen = useRef<Map<string, string> | null>(null);

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [qr, setQr] = useState("");
  const [log, setLog] = useState<{ t: string; text: string; tone?: "good" | "bad" }[]>([]);
  const [chat, setChat] = useState<Msg[]>([{ role: "assistant", content: "Morning! I'm Mira. Tell me what the shop needs and the staff will handle it in PayPal." }]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const note = (text: string, tone?: "good" | "bad") =>
    setLog((l) => [{ t: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), text, tone }, ...l].slice(0, 30));

  async function refresh() {
    const res = await fetch("/api/town").then((r) => r.json()).catch((e) => ({ error: String(e) }));
    if (res.error) return setError(res.error);
    setError("");
    const list: Invoice[] = res.invoices;
    const map = actors.current, first = !seen.current, prev = seen.current ?? new Map();
    const counts = { overdue: 0, open: 0, paid: 0 };
    for (const inv of list) {
      const z = zone(inv), [a, b] = ZONES[z], i = counts[z]++;
      const home = a + ((i * 19) % (b - a));
      let actor = map.get(inv.id);
      if (!actor) {
        actor = { id: inv.id, name: inv.name, kind: "folk", x: first ? home : -8, tx: home, home, dy: (i % 3) * 3, look: lookFor(inv.email || inv.name), script: [] };
        map.set(inv.id, actor);
        if (!first) note(`${inv.name} got an invoice for ${money(inv.amount)}.`);
      }
      actor.inv = inv;
      actor.home = home;
      if (!first && prev.get(inv.id) !== inv.status && z === "paid") {
        const who = actor;
        who.script.push({ x: HOME.mira, say: `+${money(inv.amount)} paid!`, color: GOOD, ms: 1800, onArrive: () => burst(who.x) });
        note(`${inv.name} walked in and paid ${money(inv.amount)}.`, "good");
      }
    }
    for (const id of map.keys()) if (map.get(id)!.kind === "folk" && !list.some((i) => i.id === id)) map.delete(id);
    seen.current = new Map(list.map((i) => [i.id, i.status]));
    if (first) note(`Shop open. ${list.length} customers on the books, ${list.filter((i) => i.overdue).length} overdue.`);
    setInvoices(list);
    setSelected((s) => (s ? list.find((i) => i.id === s.id) ?? null : s));
  }

  function burst(x: number) {
    const now = performance.now();
    for (let i = 0; i < 8; i++) coins.current.push({ x: x - 6 + Math.random() * 12, y: GROUND - TALL, vy: -0.4 - Math.random() * 0.5, until: now + 900 + Math.random() * 400 });
  }

  function animate(actions: Action[]) {
    const m = actors.current, ava = m.get("ava")!, mira = m.get("mira")!, cole = m.get("cole")!;
    for (const a of actions) {
      if (a.tool === "send_invoice_reminder") {
        const t = m.get(String(a.args.invoice_id));
        ava.script.push(
          { x: (t?.x ?? 60) + 8 * P, say: a.ok ? "Friendly reminder sent" : "Reminder failed", color: a.ok ? "#fff" : BAD, ms: 2600,
            onArrive: () => t && (t.bubble = { text: a.ok ? "Oh! Paying soon" : "?", until: performance.now() + 3600, color: "#fff" }) },
          { x: HOME.ava },
        );
      } else if (a.tool === "create_invoice" || a.tool === "send_invoice") {
        ava.script.push({ x: HOME.mira - 8 * P, say: a.tool === "create_invoice" ? "Invoice drafted" : "Invoice sent", ms: 1200 }, { x: HOME.ava });
      } else if (a.tool.includes("shipment")) {
        cole.script.push({ say: "Parcel tracked!", ms: 700 }, { x: 340 }, { ms: 1200 }, { x: HOME.cole, say: "Tracking is live", ms: 1400 });
      } else {
        mira.script.push({ say: a.tool.replace(/_/g, " "), ms: 1300, color: a.ok ? "#fff" : BAD });
      }
      note(`${a.ok ? "✓" : "✗"} ${a.tool.replace(/_/g, " ")}${a.args.invoice_id ? ` (${m.get(String(a.args.invoice_id))?.name ?? a.args.invoice_id})` : ""}`, a.ok ? undefined : "bad");
    }
  }

  async function ask(text: string) {
    if (!text.trim() || busy) return;
    const next = [...chat, { role: "user" as const, content: text.trim() }];
    setChat(next);
    setDraft("");
    setBusy(true);
    const res = await fetch("/api/manager", { method: "POST", body: JSON.stringify({ messages: next.slice(1) }) })
      .then((r) => r.json()).catch((e) => ({ error: String(e) }));
    setBusy(false);
    if (res.error) return setChat((c) => [...c, { role: "assistant", content: `Something went wrong: ${res.error}` }]);
    animate(res.actions ?? []);
    setChat((c) => [...c, { role: "assistant", content: res.reply || "Done." }]);
    refresh();
  }

  useEffect(() => {
    refresh();
    const poll = setInterval(refresh, 4000);
    const ctx = canvas.current!.getContext("2d")!;
    const font = getComputedStyle(document.body).getPropertyValue("--font-pixelify") || "monospace";
    const dark = matchMedia("(prefers-color-scheme: dark)");
    let raf = 0;
    const loop = (now: number) => {
      draw(ctx, now, dark.matches, font, [...actors.current.values()], coins.current, hover.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { clearInterval(poll); cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function hit(e: React.MouseEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W, y = ((e.clientY - r.top) / r.height) * H;
    // topmost (front-most) person wins when sprites overlap
    return [...actors.current.values()].sort((a, b) => b.dy - a.dy).find((a) => Math.abs(a.x - x) < 4 * P && y > GROUND + a.dy - TALL && y < GROUND + a.dy + 2);
  }

  async function inspect(inv: Invoice) {
    setSelected(inv);
    setQr("");
    if (zone(inv) === "paid") return;
    const t = await fetch(`/api/qr?id=${inv.id}`).then((r) => (r.ok ? r.text() : ""));
    const b64 = t.match(/iVBOR[A-Za-z0-9+/=\r\n]+/)?.[0]?.replace(/\s/g, "");
    if (b64) setQr(`data:image/png;base64,${b64}`);
  }

  const paid = invoices.filter((i) => zone(i) === "paid").reduce((s, i) => s + i.amount, 0);
  const owed = invoices.filter((i) => zone(i) !== "paid").reduce((s, i) => s + i.amount, 0);
  const overdue = invoices.filter((i) => i.overdue);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-line bg-bg/85 backdrop-blur">
        <nav className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <LampIcon />
            <div>
              <h1 className="font-pixel text-xl leading-none text-ink">Main Street</h1>
              <p className="text-xs text-muted">Your PayPal account, run as a town</p>
            </div>
          </div>
          <div className="ml-auto flex flex-wrap gap-2 font-mono text-xs">
            <Stat label="Paid" value={money(paid)} tone="good" />
            <Stat label="Owed" value={money(owed)} />
            <Stat label="Overdue" value={String(overdue.length)} tone={overdue.length ? "bad" : undefined} />
            <span className="rounded-full border border-pp/40 px-2.5 py-1 text-pp">PayPal sandbox</span>
          </div>
        </nav>
      </header>

      <main className="mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[1fr_380px]">
        <section className="space-y-5">
          {error && <p role="alert" className="rounded-lg border border-bad/50 bg-bad/10 p-3 text-sm text-bad">Can&apos;t reach PayPal: {error.slice(0, 200)}</p>}
          <div className="overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_20px_60px_-30px_rgba(0,0,0,.6)]">
            <canvas
              ref={canvas} width={W * S} height={H * S}
              className="block aspect-video w-full cursor-default [image-rendering:pixelated]"
              aria-label="Pixel town where each person is a PayPal invoice. Click a person to see their record."
              onMouseMove={(e) => { const a = hit(e); hover.current = a?.id ?? null; e.currentTarget.style.cursor = a?.inv ? "pointer" : "default"; }}
              onMouseLeave={() => (hover.current = null)}
              onClick={(e) => { const a = hit(e); if (a?.inv) inspect(a.inv); }}
            />
            <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-line px-4 py-2.5 text-xs text-muted">
              <Legend color={BAD} text="Left street: overdue" />
              <Legend color="#9aa3c7" text="Bench: invoice open" />
              <Legend color={GOOD} text="By the shop: paid regulars" />
              <span className="ml-auto">Click anyone to see their PayPal record</span>
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <div className="rounded-2xl border border-line bg-panel p-4">
              <h2 className="font-pixel text-base text-ink">Record</h2>
              {!selected ? (
                <p className="mt-2 text-sm text-muted">Pick a townsperson. Every one of them is a real PayPal invoice.</p>
              ) : (
                <div className="mt-3 flex gap-4">
                  <dl className="grid flex-1 grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                    <dt className="text-muted">Customer</dt><dd className="text-ink">{selected.name}</dd>
                    <dt className="text-muted">Email</dt><dd className="truncate text-ink">{selected.email || "—"}</dd>
                    <dt className="text-muted">Amount</dt><dd className="font-mono text-ink">{money(selected.amount)} {selected.currency}</dd>
                    <dt className="text-muted">Status</dt>
                    <dd className={selected.overdue ? "text-bad" : zone(selected) === "paid" ? "text-good" : "text-ink"}>{selected.overdue ? "OVERDUE" : selected.status}</dd>
                    <dt className="text-muted">Due</dt><dd className="font-mono text-ink">{selected.due ?? "—"}</dd>
                    <dt className="text-muted">Invoice</dt><dd className="truncate font-mono text-xs text-muted">{selected.number} · {selected.id}</dd>
                    {selected.payUrl && zone(selected) !== "paid" && (
                      <dd className="col-span-2 mt-2">
                        <a href={selected.payUrl} target="_blank" rel="noreferrer" className="inline-block rounded-lg bg-pp px-3 py-1.5 text-sm font-medium text-white hover:opacity-90">Open PayPal pay page</a>
                      </dd>
                    )}
                  </dl>
                  {qr && <img src={qr} alt={`PayPal QR code to pay ${selected.name}'s invoice`} className="size-28 shrink-0 rounded-lg bg-white p-1" />}
                </div>
              )}
            </div>
            <div className="rounded-2xl border border-line bg-panel p-4">
              <h2 className="font-pixel text-base text-ink">Town ledger</h2>
              <ol className="mt-2 max-h-48 space-y-1 overflow-y-auto text-sm" aria-live="polite">
                {log.map((l, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="font-mono text-xs text-muted">{l.t}</span>
                    <span className={l.tone === "good" ? "text-good" : l.tone === "bad" ? "text-bad" : "text-ink"}>{l.text}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <aside className="flex h-[min(78dvh,720px)] flex-col rounded-2xl border border-line bg-panel lg:sticky lg:top-20">
          <div className="border-b border-line px-4 py-3">
            <h2 className="font-pixel text-base text-ink">Talk to Mira</h2>
            <p className="text-xs text-muted">She directs the staff through PayPal&apos;s Agent Toolkit</p>
          </div>
          <ol className="flex-1 space-y-3 overflow-y-auto p-4 text-sm" aria-live="polite">
            {chat.map((m, i) => (
              <li key={i} className={m.role === "user" ? "ml-8 rounded-xl rounded-br-sm bg-pp px-3 py-2 text-white" : "mr-8 rounded-xl rounded-bl-sm bg-bg px-3 py-2 text-ink"}>{m.content}</li>
            ))}
            {busy && <li className="mr-8 animate-pulse rounded-xl bg-bg px-3 py-2 text-muted">Mira is on it…</li>}
          </ol>
          <div className="flex flex-wrap gap-1.5 px-4 pb-2">
            {["Chase everyone overdue over $50", "Who owes us the most?", "Bill Sam Lee $18 for a sourdough box"].map((q) => (
              <button key={q} onClick={() => ask(q)} disabled={busy} className="rounded-full border border-line px-2.5 py-1 text-xs text-muted hover:border-accent hover:text-ink disabled:opacity-50">{q}</button>
            ))}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); ask(draft); }} className="flex gap-2 border-t border-line p-3">
            <label htmlFor="ask" className="sr-only">Message Mira</label>
            <input id="ask" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Tell the manager what to do…" className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none" />
            <button disabled={busy || !draft.trim()} className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-[#1d1300] disabled:opacity-50">Send</button>
          </form>
        </aside>
      </main>
    </div>
  );
}

const Stat = ({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) => (
  <span className="rounded-full border border-line bg-panel px-2.5 py-1">
    <span className="text-muted">{label} </span>
    <span className={tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : "text-ink"}>{value}</span>
  </span>
);
const Legend = ({ color, text }: { color: string; text: string }) => (
  <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm" style={{ background: color }} />{text}</span>
);
const LampIcon = () => (
  <svg viewBox="0 0 16 16" className="size-8" aria-hidden shapeRendering="crispEdges">
    <rect x="7" y="6" width="2" height="9" fill="currentColor" className="text-muted" />
    <rect x="5" y="1" width="6" height="5" fill="var(--accent)" />
    <rect x="4" y="0" width="8" height="1" fill="currentColor" className="text-ink" />
    <rect x="5" y="15" width="6" height="1" fill="currentColor" className="text-ink" />
  </svg>
);

/* ---------- canvas ---------- */

function draw(ctx: CanvasRenderingContext2D, now: number, night: boolean, font: string, list: Actor[], coins: { x: number; y: number; vy: number; until: number }[], hoverId: string | null) {
  ctx.setTransform(S, 0, 0, S, 0, 0);
  ctx.imageSmoothingEnabled = false;
  const r = (x: number, y: number, w: number, h: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
  const text = (s: string, x: number, y: number, c: string, size = 6, align: CanvasTextAlign = "center") => {
    ctx.font = `${size}px ${font}`; ctx.textAlign = align; ctx.fillStyle = c; ctx.fillText(s, x, y);
  };

  // sky
  const g = ctx.createLinearGradient(0, 0, 0, 120);
  g.addColorStop(0, night ? "#0b1026" : "#7cc4e8"); g.addColorStop(1, night ? "#2a2f63" : "#d6f0f7");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 120);
  if (night) {
    for (let i = 0; i < 40; i++) { const h = hash("s" + i); r(h % W, (h >> 8) % 60, 1, 1, (now / 400 + i) % 7 < 1 ? "#6d74a8" : "#e8e6ff"); }
    r(282, 14, 10, 10, "#f4ecd0"); r(285, 14, 7, 7, "#d9cfae");
  } else {
    r(30, 14, 12, 12, "#ffe08a"); r(28, 16, 16, 8, "#ffe08a");
    const cx = (now / 120) % (W + 60) - 40; r(cx, 22, 26, 5, "#ffffff"); r(cx + 5, 18, 14, 5, "#ffffff");
  }
  // far skyline
  [[0, 70, 30], [28, 58, 24], [50, 76, 40], [88, 64, 22], [205, 60, 30], [232, 72, 20], [300, 66, 24]].forEach(([x, y, w]) => r(x, y, w, 120 - y, night ? "#1a1f45" : "#a9cfe0"));

  // ledger office
  r(8, 62, 74, 58, night ? "#2f4a40" : "#4f7a68"); r(6, 58, 78, 5, night ? "#20332c" : "#365a4b");
  text("LEDGER & CO", 45, 70, "#f3ead8", 5);
  for (const x of [14, 62]) { r(x, 78, 14, 14, night ? "#ffcf6e" : "#cfe8f0"); r(x + 6, 78, 1, 14, "#20332c"); }
  r(39, 98, 12, 22, "#1d2a24"); r(48, 108, 1, 2, GOLD);

  // bakery
  r(112, 54, 96, 66, night ? "#7a3d26" : "#a5573a"); r(110, 50, 100, 5, night ? "#4e2617" : "#6d3420");
  for (let x = 0; x < 96; x += 6) r(112 + x, 58 + (x % 12 ? 0 : 1), 3, 1, night ? "#5e2d1c" : "#8a4630");
  text("HEARTH BAKERY", 160, 66, "#ffe9c2", 6);
  for (let i = 0; i < 16; i++) r(112 + i * 6, 72, 6, 7, i % 2 ? "#f3ead8" : "#ffb547");
  r(118, 82, 32, 20, night ? "#ffd27a" : "#fff3d6"); r(170, 82, 32, 20, night ? "#ffd27a" : "#fff3d6");
  for (const x of [124, 132, 140, 176, 186, 194]) { r(x, 96, 5, 3, "#c98a4b"); r(x + 1, 95, 3, 1, "#e0a868"); }
  r(155, 92, 12, 28, "#3b1d10"); r(164, 106, 1, 2, GOLD);
  if (night) { ctx.fillStyle = "rgba(255,200,110,.10)"; ctx.fillRect(112, 102, 96, 30); }

  // post office
  r(240, 64, 72, 56, night ? "#283d68" : "#3e5f9c"); r(238, 60, 76, 5, night ? "#1a2a4d" : "#2c4778");
  text("POST", 276, 72, "#f3ead8", 6);
  r(248, 80, 14, 14, night ? "#ffcf6e" : "#cfe8f0"); r(290, 80, 14, 14, night ? "#ffcf6e" : "#cfe8f0");
  r(270, 96, 12, 24, "#15213d"); r(296, 108, 6, 10, "#d64545"); r(296, 107, 6, 2, "#a33232");

  // street
  r(0, 120, W, 16, night ? "#4b4a5e" : "#cfc6b4");
  for (let x = 0; x < W; x += 16) r(x, 120, 1, 16, night ? "#3e3d50" : "#bdb39f");
  r(0, 136, W, 44, night ? "#23232e" : "#5e5e6a");
  for (let x = 4; x < W; x += 24) r(x, 157, 12, 2, night ? "#77745e" : "#e8dca0");
  // lamps + bench
  for (const x of [100, 226]) {
    r(x, 96, 2, 36, "#2a2a33"); r(x - 2, 92, 6, 5, night ? "#ffd27a" : "#e9e2cf");
    if (night) { ctx.fillStyle = "rgba(255,210,122,.12)"; ctx.beginPath(); ctx.arc(x + 1, 120, 22, 0, Math.PI * 2); ctx.fill(); }
  }
  r(208, 124, 28, 2, "#7a4b2a"); r(208, 120, 28, 2, "#8c5a34"); r(210, 126, 2, 4, "#4a2e1a"); r(232, 126, 2, 4, "#4a2e1a");

  // actors
  for (const a of list) step(a, now);
  const sorted = [...list].sort((a, b) => a.dy - b.dy);
  for (const a of sorted) person(r, a, now);
  for (const a of sorted) {
    const y = GROUND + a.dy - TALL;
    if (a.inv?.overdue && !(a.bubble && now < a.bubble.until)) { r(a.x - 1, y - 7, 3, 5, BAD); r(a.x - 1, y - 1, 3, 2, BAD); }
    if (a.bubble && now < a.bubble.until) bubble(ctx, a.bubble.text, a.x, y - 2, a.bubble.color, font);
    else if (hoverId === a.id) bubble(ctx, a.inv ? `${a.name} · ${money(a.inv.amount)}` : a.name, a.x, y - 2, "#fff", font);
  }
  for (const c of coins) if (now < c.until) { c.y += c.vy; c.vy += 0.015; r(c.x, c.y, 2, 2, GOLD); r(c.x, c.y, 1, 1, "#fff6c2"); }
  if (coins.length && coins.every((c) => now >= c.until)) coins.length = 0;
}

function step(a: Actor, now: number) {
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
  a.x += Math.sign(d) * Math.min(Math.abs(d), a.kind === "folk" ? 0.45 : 0.7);
}

function person(draw: (x: number, y: number, w: number, h: number, c: string) => void, a: Actor, now: number) {
  const [hair, skin, shirt, pants] = a.look;
  // sprite is designed on a 7x13 grid; each grid pixel is drawn P world pixels wide
  const ox = Math.round(a.x) - Math.round(3.5 * P), oy = GROUND + a.dy - 13 * P;
  const r = (dx: number, dy: number, w: number, h: number, c: string) => draw(ox + dx * P, oy + dy * P, w * P, h * P, c);
  const x = 0, y = 0;
  const walking = Math.abs(a.tx - a.x) > 0.6, f = walking ? Math.floor(now / 140) % 2 : 0;
  const bob = f;
  r(x + 1, y + 13, 6, 1, "rgba(0,0,0,.25)");
  r(x + 1, y + bob, 5, 2, hair); r(x + 1, y + 2 + bob, 5, 3, skin); r(x + 1, y + 2 + bob, 1, 1, hair);
  r(x + 2, y + 3 + bob, 1, 1, "#1a1a1a"); r(x + 4, y + 3 + bob, 1, 1, "#1a1a1a");
  r(x, y + 5, 7, 4, shirt); r(x, y + 8, 1, 1, skin); r(x + 6, y + 8, 1, 1, skin);
  r(x + 1, y + 9, 2, f ? 3 : 4, pants); r(x + 4, y + 9, 2, f ? 4 : 3, pants);
  if (a.kind === "mira") { r(x + 1, y - 2, 5, 2, "#ffffff"); r(x + 2, y + 5, 3, 4, "#ffffff"); }
  if (a.kind === "ava") { r(x + 1, y + 3 + bob, 5, 1, "#2a2a2a"); r(x + 6, y + 5, 2, 3, "#f3ead8"); }
  if (a.kind === "cole") { r(x, y - 1, 6, 2, "#e76f51"); if (a.script.length) r(x + 5, y + 5, 4, 4, "#c8955a"); }
}

function bubble(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, color: string, font: string) {
  ctx.font = `6px ${font}`;
  const w = Math.ceil(ctx.measureText(s).width) + 6, bx = Math.max(1, Math.min(W - w - 1, Math.round(x - w / 2)));
  ctx.fillStyle = "#14172b"; ctx.fillRect(bx - 1, y - 10, w + 2, 10);
  ctx.fillStyle = color; ctx.fillRect(bx, y - 9, w, 8); ctx.fillRect(Math.round(x) - 1, y - 1, 2, 2);
  ctx.fillStyle = "#14172b"; ctx.textAlign = "left"; ctx.fillText(s, bx + 3, y - 3);
}
