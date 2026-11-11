import Anthropic from "@anthropic-ai/sdk";
import { getInvoices, toolkit } from "@/lib/paypal";

export const maxDuration = 120;
const client = new Anthropic(); // ANTHROPIC_API_KEY
const MODEL = "claude-haiku-5-5";

// The PayPal toolkit ships OpenAI-shaped tool specs; Claude takes the same JSON Schema as input_schema.
const tools: Anthropic.Tool[] = toolkit.getTools().map((t) => ({
  name: t.function.name,
  description: t.function.description ?? "",
  input_schema: t.function.parameters as Anthropic.Tool.InputSchema,
}));

const SYSTEM = `You are Mira, manager of Hearth Bakery on Main Street. You run the owner's real PayPal account (sandbox) with your tools.
Staff you direct: Ava the accountant (invoices, reminders), Cole the courier (shipment tracking), and you (orders, reports).
Act with tools rather than describing what you would do. Use invoice ids from the invoice list you are given; never invent ids or amounts.
To bill someone, create the invoice and then send it, so the customer shows up in town; if you have no email for them, ask for it before creating anything.
Reply in 1-3 short sentences, warm and plain, saying what the staff did and naming customers. Leave out raw PayPal ids.`;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const history = Array.isArray(body?.messages) ? body.messages : [];
  const chat: Anthropic.MessageParam[] = history
    .filter((m: { role?: string; content?: unknown }) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-12)
    .map((m: { role: "user" | "assistant"; content: string }) => ({ role: m.role, content: m.content.slice(0, 2000) }));
  while (chat.length && chat[0].role !== "user") chat.shift(); // Claude requires the first turn to be the user's
  if (!chat.length) return Response.json({ error: "no message" }, { status: 400 });

  try {
    return Response.json(await run(chat));
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return Response.json({ error: "The staff are on a break: the AI rate limit was reached. Try again in a minute." }, { status: 429 });
    if (e instanceof Anthropic.AuthenticationError) return Response.json({ error: "The AI key is missing or invalid (ANTHROPIC_API_KEY)." }, { status: 502 });
    return Response.json({ error: String(e).slice(0, 300) }, { status: 502 });
  }
}

async function run(messages: Anthropic.MessageParam[]) {
  const invoices = await getInvoices();
  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: SYSTEM },
    { type: "text", text: `Today is ${new Date().toISOString().slice(0, 10)}. Current invoices (JSON): ${JSON.stringify(invoices)}` },
  ];

  const actions: { tool: string; args: Record<string, unknown>; ok: boolean }[] = [];
  for (let step = 0; step < 8; step++) {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: "low" }, // short chat turns; low effort keeps the walk-over animation snappy
      cache_control: { type: "ephemeral" },
      system,
      tools,
      messages,
    });
    if (res.stop_reason === "refusal") return { reply: "I can't help with that one.", actions };
    messages.push({ role: "assistant", content: res.content }); // full content, so thinking blocks are passed back
    const calls = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (res.stop_reason !== "tool_use" || !calls.length) {
      const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join(" ");
      return { reply: text, actions };
    }
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const call of calls) {
      const args = (call.input ?? {}) as Record<string, unknown>;
      let text: string, ok: boolean;
      try {
        const out = await toolkit.handleToolCall({ id: call.id, type: "function", function: { name: call.name, arguments: JSON.stringify(args) } });
        text = String(out.content);
        ok = !/^error|"error"|failed/i.test(text.slice(0, 300));
      } catch (e) {
        text = `error: ${e}`;
        ok = false;
      }
      actions.push({ tool: call.name, args, ok });
      results.push({ type: "tool_result", tool_use_id: call.id, content: text.slice(0, 6000) || "done", is_error: !ok });
    }
    messages.push({ role: "user", content: results }); // all results in one turn
  }
  return { reply: "That took more steps than I'd like. Here's what got done so far.", actions };
}
