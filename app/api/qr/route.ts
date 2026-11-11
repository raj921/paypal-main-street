import { toolkit } from "@/lib/paypal";

// PayPal returns the QR as base64 PNG text; the client renders it as a data: URL.
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[A-Za-z0-9_-]{1,127}$/.test(id)) return new Response("bad id", { status: 400 });
  const res = await fetch(`${toolkit.client.getBaseUrl()}/v2/invoicing/invoices/${id}/generate-qr-code`, {
    method: "POST",
    headers: await toolkit.client.getHeaders(),
    body: JSON.stringify({ width: 240, height: 240 }),
  });
  return new Response(await res.text(), { status: res.status, headers: { "Content-Type": "text/plain" } });
}
