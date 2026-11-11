"use client";
import { useEffect, useRef, useState } from "react";
import type { Invoice } from "@/lib/paypal";
import {
  type Actor, type Kind, type View, BAD, GOOD, HOME, P, STAFF, TALL,
  coins, draw, drawFace, fireworks, fit, floatText, homeX, lookFor, money, newFx, zone,
} from "./scene";

type Msg = { role: "user" | "assistant"; content: string };
type Action = { tool: string; args: Record<string, unknown>; ok: boolean };
type Log = { id: number; t: string; text: string; tone?: "good" | "bad" };

const staffActor = (kind: "ava" | "mira" | "cole"): Actor =>
  ({ id: kind, name: `${STAFF[kind].name} · ${STAFF[kind].role.toLowerCase()}`, kind, x: HOME[kind], tx: HOME[kind], home: HOME[kind], dy: kind === "mira" ? -2 : 0, look: STAFF[kind].look, script: [] });
const PROMPTS = ["Chase everyone overdue over $50", "Bill Sam Lee (sam.lee@example.com) $18 for a sourdough box", "Who owes us the most?"];

export default function Town() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const actors = useRef(new Map<string, Actor>((["ava", "mira", "cole"] as const).map((k) => [k, staffActor(k)])));
  const fx = useRef(newFx());
  const view = useRef<View | null>(null);
  const seen = useRef<Map<string, string> | null>(null);
  const live = useRef({ night: true, hover: null as string | null, selected: null as string | null, paid: 0, muted: false });
  const audio = useRef<AudioContext | null>(null);
  const logId = useRef(0);

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [qr, setQr] = useState("");
  const [log, setLog] = useState<Log[]>([]);
  const [chat, setChat] = useState<Msg[]>([{ role: "assistant", content: "Morning, boss! Tell me what the shop needs and the staff will handle it in PayPal while you watch." }]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [night, setNight] = useState(true);
  const [muted, setMuted] = useState(false);
  const [tally, setTally] = useState({ ava: 0, mira: 0, cole: 0 });

  const note = (text: string, tone?: "good" | "bad") =>
    setLog((l) => [{ id: ++logId.current, t: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), text, tone }, ...l].slice(0, 30));

  function beep(notes: number[], type: OscillatorType = "square") {
    const ac = audio.current;
    if (!ac || live.current.muted) return;
    notes.forEach((f, i) => {
      const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + i * 0.09;
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(0.05, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      o.connect(g).connect(ac.destination); o.start(t); o.stop(t + 0.3);
    });
  }
  const wake = () => { try { audio.current ??= new AudioContext(); } catch { /* no audio: the town still works */ } };

  async function refresh() {
    const res = await fetch("/api/town").then((r) => r.json()).catch((e) => ({ error: String(e) }));
    if (res.error) return setError(res.error);
    setError("");
    const list: Invoice[] = res.invoices;
    const map = actors.current, first = !seen.current, prev = seen.current ?? new Map<string, string>();
    const halfW = (view.current?.W ?? 480) / 2, counts = { overdue: 0, open: 0, paid: 0 };
    for (const inv of list) {
      const z = zone(inv), i = counts[z]++, home = homeX(z, i, halfW);
      let actor = map.get(inv.id);
      if (!actor) {
        actor = { id: inv.id, name: inv.name, kind: "folk", x: first ? home : -halfW - 12, tx: home, home, dy: (i % 3) * 3, look: lookFor(inv.email || inv.name), script: [] };
        map.set(inv.id, actor);
        if (!first) note(`${inv.name} got an invoice for ${money(inv.amount)}.`);
      }
      actor.inv = inv;
      actor.home = home;
      if (!first && prev.get(inv.id) !== inv.status && z === "paid") {
        const who = actor;
        who.script.push({
          x: HOME.mira + 14, say: `${money(inv.amount)} paid!`, color: GOOD, ms: 2400,
          onArrive: () => {
            const now = performance.now();
            coins(fx.current, who.x, now); fireworks(fx.current, 0, now); floatText(fx.current, `+${money(inv.amount)}`, who.x, now);
            beep([988, 1319]); setTimeout(() => beep([523, 659, 784, 1047], "triangle"), 260);
          },
        });
        note(`${inv.name} walked in and paid ${money(inv.amount)}.`, "good");
      }
    }
    for (const id of [...map.keys()]) if (map.get(id)!.kind === "folk" && !list.some((i) => i.id === id)) map.delete(id);
    seen.current = new Map(list.map((i) => [i.id, i.status]));
    live.current.paid = list.filter((i) => zone(i) === "paid").reduce((s, i) => s + i.amount, 0);
    if (first) note(`Shop open. ${list.length} customers on the books, ${list.filter((i) => i.overdue).length} overdue.`);
    setInvoices(list);
    setSelected((s) => (s ? list.find((i) => i.id === s.id) ?? null : s));
  }

  function animate(actions: Action[]) {
    const m = actors.current, ava = m.get("ava")!, mira = m.get("mira")!, cole = m.get("cole")!;
    const halfW = (view.current?.W ?? 480) / 2, add = { ava: 0, mira: 0, cole: 0 };
    for (const a of actions) {
      const t = m.get(String(a.args.invoice_id));
      if (a.tool === "send_invoice_reminder") {
        add.ava++;
        ava.script.push(
          { x: (t?.x ?? -160) + 8 * P, say: a.ok ? "Friendly reminder sent" : "Reminder failed", color: a.ok ? "#fff" : BAD, ms: 2600,
            onArrive: () => { beep([660, 880], "triangle"); if (t) t.bubble = { text: a.ok ? "Oh! Paying soon" : "?", until: performance.now() + 3600, color: "#fff" }; } },
          { x: HOME.ava },
        );
      } else if (a.tool === "create_invoice" || a.tool === "send_invoice") {
        add.ava++;
        ava.script.push({ x: HOME.mira - 9 * P, say: a.tool === "create_invoice" ? "Invoice drafted" : "Invoice sent", ms: 1500 }, { x: HOME.ava });
      } else if (a.tool.includes("shipment")) {
        add.cole++;
        cole.script.push({ say: "Parcel tracked!", ms: 900 }, { x: halfW + 20 }, { ms: 1200 }, { x: HOME.cole, say: "Tracking is live", ms: 1600 });
      } else {
        add.mira++;
        mira.script.push({ say: a.tool === "record_payment_for_invoice" ? "Payment recorded" : a.tool.replace(/_/g, " "), ms: 1500, color: a.ok ? "#fff" : BAD });
      }
      note(`${a.ok ? "✓" : "✗"} ${a.tool.replace(/_/g, " ")}${t ? ` (${t.name})` : ""}`, a.ok ? undefined : "bad");
    }
    setTally((s) => ({ ava: s.ava + add.ava, mira: s.mira + add.mira, cole: s.cole + add.cole }));
  }

  async function ask(text: string) {
    if (!text.trim() || busy) return;
    wake();
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
    const saved = localStorage.getItem("theme");
    setNight(saved ? saved === "dark" : matchMedia("(prefers-color-scheme: dark)").matches);
    setMuted(localStorage.getItem("muted") === "1");
    refresh();
    const poll = setInterval(refresh, 4000);
    const ctx = canvas.current!.getContext("2d")!;
    const font = getComputedStyle(document.body).getPropertyValue("--font-pixelify") || "monospace";
    let raf = 0;
    const loop = (now: number) => {
      const v = (view.current = fit(canvas.current!)), s = live.current;
      draw(ctx, v, now, s.night, font, [...actors.current.values()], fx.current, s.hover, s.selected, s.paid);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { clearInterval(poll); cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { live.current.night = night; document.documentElement.dataset.theme = night ? "dark" : "light"; }, [night]);
  useEffect(() => { live.current.muted = muted; }, [muted]);
  useEffect(() => { live.current.selected = selected?.id ?? null; }, [selected]);

  function hit(e: React.MouseEvent<HTMLCanvasElement>) {
    const v = view.current;
    if (!v) return;
    const box = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * v.W - v.cx, y = ((e.clientY - box.top) / box.height) * v.H;
    // front-most person wins when sprites overlap
    return [...actors.current.values()].sort((a, b) => b.dy - a.dy).find((a) => Math.abs(a.x - x) < 4 * P + 1 && y > v.ground + a.dy - TALL && y < v.ground + a.dy + 2);
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
  const overdue = invoices.filter((i) => i.overdue).length;
  const lastUser = [...chat].reverse().find((m) => m.role === "user")?.content;
  const reply = chat[chat.length - 1].role === "assistant" ? chat[chat.length - 1].content : "";
  const z = selected && zone(selected);

  return (
    <div className="flex h-dvh flex-col overflow-clip" onPointerDown={wake}>
      <div className="relative min-h-0 flex-1">
        <canvas
          ref={canvas}
          className="absolute inset-0 block size-full [image-rendering:pixelated]"
          aria-label="Pixel town where each person is a PayPal invoice. Click a person to see their record."
          onMouseMove={(e) => { const a = hit(e); live.current.hover = a?.id ?? null; e.currentTarget.style.cursor = a?.inv ? "pointer" : "default"; }}
          onMouseLeave={() => (live.current.hover = null)}
          onClick={(e) => { const a = hit(e); if (a?.inv) inspect(a.inv); else setSelected(null); }}
        />

        <div className="intro pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center px-4 text-center" aria-hidden>
          <p className="intro-title font-pixel">
            {"MAIN STREET".split("").map((c, i) => <span key={i} style={{ animationDelay: `${i * 60}ms` }}>{c === " " ? " " : c}</span>)}
          </p>
          <p className="intro-sub mt-3 font-pixel text-base text-white sm:text-2xl">Your PayPal account, run as a town</p>
        </div>

        <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-wrap items-start gap-x-4 gap-y-2 p-3 sm:p-4">
          <div className="panel pointer-events-auto flex items-center gap-3 px-3 py-2">
            <LampIcon />
            <div>
              <h1 className="font-pixel text-xl leading-none text-ink sm:text-2xl">Main Street</h1>
              <p className="mt-0.5 hidden text-xs text-muted sm:block">Your PayPal account, run as a town</p>
            </div>
          </div>
          <nav className="pointer-events-auto ml-auto flex flex-wrap items-stretch justify-end gap-2" aria-label="Shop totals and settings">
            <Stat label="Paid" tone="good" icon={<CoinIcon />}><Count value={paid} /></Stat>
            <Stat label="Owed" icon={<ScrollIcon />}><Count value={owed} /></Stat>
            <Stat label="Overdue" tone={overdue ? "bad" : undefined} icon={<BangIcon />}>{overdue}</Stat>
            <button className="panel icon-btn" onClick={() => { const n = !night; setNight(n); localStorage.setItem("theme", n ? "dark" : "light"); }} aria-label={night ? "Switch to day" : "Switch to night"}>
              {night ? <SunIcon /> : <MoonIcon />}
            </button>
            <button className="panel icon-btn" onClick={() => { const m = !muted; setMuted(m); localStorage.setItem("muted", m ? "1" : "0"); }} aria-label={muted ? "Turn sound on" : "Turn sound off"} aria-pressed={!muted}>
              <SpeakerIcon off={muted} />
            </button>
          </nav>
          <section className="pointer-events-none basis-full [&>*]:max-w-72" aria-label="Town ledger">
            <h2 className="font-pixel text-sm text-white [text-shadow:0_2px_0_#12082a]">Town ledger</h2>
            <ol className="mt-1.5 space-y-1.5" aria-live="polite">
              {log.slice(0, 4).map((l, i) => (
                <li key={l.id} className="ledger-row panel px-2.5 py-1.5 text-xs" style={{ opacity: 1 - i * 0.2 }}>
                  <span className="mr-2 font-mono text-[10px] text-muted">{l.t}</span>
                  <span className={l.tone === "good" ? "text-good" : l.tone === "bad" ? "text-bad" : "text-ink"}>{l.text}</span>
                </li>
              ))}
            </ol>
          </section>
        </header>

        {error && <p role="alert" className="panel absolute left-1/2 top-20 z-20 w-[min(92vw,32rem)] -translate-x-1/2 px-3 py-2 text-sm text-bad">Can&apos;t reach PayPal: {error.slice(0, 200)}</p>}

        {selected && (
          <aside className="record panel absolute inset-x-3 bottom-3 z-20 p-4 md:inset-x-auto md:bottom-auto md:right-4 md:top-24 md:w-80" aria-label="PayPal record">
            <button className="absolute right-2 top-2 grid size-7 place-items-center font-pixel text-muted hover:text-ink" onClick={() => setSelected(null)} aria-label="Close record">✕</button>
            <div className="flex items-center gap-3">
              <Face look={lookFor(selected.email || selected.name)} kind="folk" className="size-14" />
              <div className="min-w-0">
                <h2 className="truncate font-pixel text-xl leading-tight text-ink">{selected.name}</h2>
                <p className="truncate text-xs text-muted">{selected.email || "no email"}</p>
              </div>
            </div>
            <div className="mt-3 flex items-end justify-between gap-3">
              <div>
                <p className="font-pixel text-4xl leading-none text-ink">{money(selected.amount)}</p>
                <p className="mt-1 font-mono text-[11px] text-muted">{selected.currency} · invoice {selected.number}</p>
              </div>
              <span className={`badge ${z === "paid" ? "bg-good" : z === "overdue" ? "bg-bad" : "bg-accent"}`}>{z === "paid" ? "Paid" : z === "overdue" ? "Overdue" : "Open"}</span>
            </div>
            <p className="mt-2 text-sm text-muted">
              {z === "paid" ? "Settled. A regular at the bakery." : <>Due <span className={`font-mono ${z === "overdue" ? "text-bad" : "text-ink"}`}>{selected.due ?? "on receipt"}</span></>}
            </p>
            {z !== "paid" && (
              <>
                <div className="mt-3 flex gap-3">
                  <div className="grid size-24 shrink-0 place-items-center rounded-md bg-white p-1">
                    {qr ? <img src={qr} alt={`PayPal QR code to pay ${selected.name}'s invoice`} className="size-full" /> : <span className="animate-pulse font-pixel text-xs text-[#12082a]">QR…</span>}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <button className="btn btn-hot" disabled={busy} onClick={() => ask(`Send ${selected.name} a friendly payment reminder.`)}>Send Ava over</button>
                    <button className="btn" disabled={busy} onClick={() => ask(`${selected.name} just paid ${money(selected.amount)} in cash at the counter. Record that payment on their invoice.`)}>Paid in cash</button>
                  </div>
                </div>
                {selected.payUrl && <a href={selected.payUrl} target="_blank" rel="noreferrer" className="mt-3 block text-center text-sm font-medium text-pp underline-offset-4 hover:underline">Open the PayPal pay page ↗</a>}
              </>
            )}
            <p className="mt-3 truncate border-t border-line pt-2 font-mono text-[10px] text-muted">PayPal id {selected.id}</p>
          </aside>
        )}

        <div className="pointer-events-none absolute bottom-2 left-3 z-10 hidden gap-3 text-[11px] text-white [text-shadow:0_1px_0_#12082a] lg:flex">
          <Legend color={BAD} text="! overdue" /><Legend color="#ffc247" text="by the post: open" /><Legend color={GOOD} text="by the bakery: paid" />
          <span className="opacity-80">Click anyone to see the PayPal record behind them</span>
        </div>
      </div>

      <footer className="dialog relative z-20 shrink-0 border-t-4 border-line bg-panel">
        <div className="mx-auto flex max-w-6xl gap-3 p-3 sm:gap-5 sm:p-4">
          <div className="shrink-0 text-center">
            <Face look={STAFF.mira.look} kind="mira" className={`size-14 sm:size-20 ${busy ? "animate-bounce" : ""}`} />
            <p className="mt-1 font-pixel text-sm leading-none text-accent">MIRA</p>
            <p className="hidden text-[10px] text-muted sm:block">Manager</p>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="min-h-[3.75rem]" aria-live="polite">
              {lastUser && <p className="truncate text-xs text-muted"><span className="font-pixel text-hot">YOU</span> {lastUser}</p>}
              <p className="text-sm leading-relaxed text-ink sm:text-base">
                {busy ? <span className="font-pixel text-muted">Mira is briefing the staff<span className="dots" /></span> : <Typed key={chat.length} text={reply} />}
              </p>
            </div>
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
              {PROMPTS.map((q) => <button key={q} onClick={() => ask(q)} disabled={busy} className="chip">{q}</button>)}
            </div>
            <form onSubmit={(e) => { e.preventDefault(); ask(draft); }} className="flex gap-2">
              <label htmlFor="ask" className="sr-only">Message Mira</label>
              <input id="ask" value={draft} onChange={(e) => setDraft(e.target.value)} autoComplete="off" placeholder="Tell Mira what to do…" className="field min-w-0 flex-1" />
              <button disabled={busy || !draft.trim()} className="btn btn-accent px-5">Send</button>
            </form>
          </div>
          <ul className="hidden w-52 shrink-0 flex-col justify-center gap-2 lg:flex" aria-label="Staff">
            {(["ava", "cole"] as const).map((k) => (
              <li key={k} className="flex items-center gap-2.5 rounded-md border-2 border-line px-2 py-1.5">
                <Face look={STAFF[k].look} kind={k} className="size-9" />
                <div className="min-w-0 leading-tight">
                  <p className="font-pixel text-sm text-ink">{STAFF[k].name} <span className="font-sans text-[11px] text-muted">{STAFF[k].role}</span></p>
                  <p className="text-[11px] text-muted">{tally[k]} {k === "ava" ? "invoice jobs" : "deliveries"} today</p>
                </div>
              </li>
            ))}
            <li className="text-center text-[10px] text-muted">PayPal Agent Toolkit · Claude Haiku 5.5 · sandbox</li>
          </ul>
        </div>
      </footer>
    </div>
  );
}

/* ---------- small pieces ---------- */

function Typed({ text }: { text: string }) {
  const [n, setN] = useState(() => (typeof window !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches ? text.length : 0));
  useEffect(() => {
    const id = setInterval(() => setN((k) => (k >= text.length ? (clearInterval(id), k) : k + 2)), 22);
    return () => clearInterval(id);
  }, [text]);
  return <><span aria-hidden>{text.slice(0, n)}</span><span className="sr-only">{text}</span></>;
}

function Count({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const a = from.current, start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / 700), val = a + (value - a) * (1 - Math.pow(1 - k, 3));
      from.current = val; setShown(val);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{money(Math.round(shown))}</>;
}

function Face({ look, kind, className = "" }: { look: string[]; kind: Kind; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null), key = look.join();
  useEffect(() => { drawFace(ref.current!.getContext("2d")!, key.split(","), kind, kind === "folk" ? "#3ee7ff" : "#ffc247"); }, [key, kind]);
  return <canvas ref={ref} width={12} height={12} aria-hidden className={`face shrink-0 [image-rendering:pixelated] ${className}`} />;
}

const Stat = ({ label, tone, icon, children }: { label: string; tone?: "good" | "bad"; icon: React.ReactNode; children: React.ReactNode }) => (
  <div className="panel flex items-center gap-2 px-2.5 py-1.5">
    {icon}
    <div className="leading-none">
      <p className="text-[10px] uppercase tracking-wider text-muted">{label}</p>
      <p className={`mt-0.5 font-pixel text-lg leading-none ${tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : "text-ink"}`}>{children}</p>
    </div>
  </div>
);
const Legend = ({ color, text }: { color: string; text: string }) => (
  <span className="flex items-center gap-1.5"><span className="size-2" style={{ background: color }} />{text}</span>
);

// 16x16 pixel icons, drawn as rects so they stay crisp at any size
const Px = ({ d, className = "size-6" }: { d: [number, number, number, number, string][]; className?: string }) => (
  <svg viewBox="0 0 16 16" className={`shrink-0 ${className}`} aria-hidden shapeRendering="crispEdges">
    {d.map(([x, y, w, h, c], i) => <rect key={i} x={x} y={y} width={w} height={h} fill={c} />)}
  </svg>
);
const INK = "var(--ink)";
const LampIcon = () => <Px className="size-9" d={[[7, 7, 2, 8, "var(--muted)"], [4, 15, 8, 1, INK], [5, 2, 6, 5, "var(--accent)"], [4, 1, 8, 1, INK], [6, 3, 2, 2, "#fff"]]} />;
const CoinIcon = () => <Px d={[[5, 2, 6, 12, "#ffd24a"], [3, 4, 10, 8, "#ffd24a"], [7, 4, 2, 8, "#b8860b"], [5, 3, 2, 1, "#fff6c2"], [4, 5, 1, 2, "#fff6c2"]]} />;
const ScrollIcon = () => <Px d={[[3, 2, 10, 12, "#fff4e0"], [2, 2, 12, 2, "#e0c890"], [2, 12, 12, 2, "#e0c890"], [5, 6, 6, 1, "#8a7350"], [5, 8, 6, 1, "#8a7350"], [5, 10, 4, 1, "#8a7350"]]} />;
const BangIcon = () => <Px d={[[6, 2, 4, 8, "var(--bad)"], [6, 12, 4, 3, "var(--bad)"]]} />;
const SunIcon = () => <Px d={[[5, 5, 6, 6, "#ffd24a"], [7, 1, 2, 2, "#ffd24a"], [7, 13, 2, 2, "#ffd24a"], [1, 7, 2, 2, "#ffd24a"], [13, 7, 2, 2, "#ffd24a"], [3, 3, 1, 1, "#ffd24a"], [12, 3, 1, 1, "#ffd24a"], [3, 12, 1, 1, "#ffd24a"], [12, 12, 1, 1, "#ffd24a"]]} />;
const MoonIcon = () => <Px d={[[5, 2, 6, 12, "#6a52b0"], [3, 4, 10, 8, "#6a52b0"], [8, 3, 4, 5, "var(--panel-solid)"], [10, 5, 3, 4, "var(--panel-solid)"]]} />;
const SpeakerIcon = ({ off }: { off: boolean }) => (
  <Px d={[[2, 6, 3, 4, INK], [5, 5, 2, 6, INK], [7, 3, 2, 10, INK], ...(off ? ([[11, 5, 1, 1, "var(--bad)"], [12, 6, 1, 1, "var(--bad)"], [13, 7, 1, 1, "var(--bad)"], [13, 5, 1, 1, "var(--bad)"], [11, 7, 1, 1, "var(--bad)"], [12, 8, 1, 1, "var(--bad)"], [11, 9, 1, 1, "var(--bad)"], [13, 9, 1, 1, "var(--bad)"]] as [number, number, number, number, string][]) : ([[11, 6, 1, 4, INK], [13, 4, 1, 8, INK]] as [number, number, number, number, string][]))]} />
);
