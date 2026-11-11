import { getInvoices } from "@/lib/paypal";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({ invoices: await getInvoices() });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 502 });
  }
}
