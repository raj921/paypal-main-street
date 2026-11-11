import { PayPalAgentToolkit } from "@paypal/agent-toolkit/openai";

// Only non-destructive actions: the live demo URL is public, so no delete/cancel/refund.
export const toolkit = new PayPalAgentToolkit({
  clientId: process.env.PAYPAL_CLIENT_ID!,
  clientSecret: process.env.PAYPAL_CLIENT_SECRET!,
  configuration: {
    actions: {
      invoices: { create: true, list: true, get: true, send: true, sendReminder: true, search: true, generateQRC: true, generateInvoiceNumber: true, recordPayment: true },
      shipment: { create: true, get: true },
      orders: { create: true, get: true },
      products: { list: true, show: true },
      subscriptionPlans: { list: true, show: true },
      transactions: { list: true },
      insights: { get: true },
    },
    context: { sandbox: true },
  },
});

export async function paypal(path: string, init: RequestInit = {}) {
  const res = await fetch(toolkit.client.getBaseUrl() + path, {
    ...init,
    headers: { ...(await toolkit.client.getHeaders()), "Content-Type": "application/json", ...init.headers },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`PayPal ${res.status} ${path}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

export type Invoice = {
  id: string; number: string; status: string; amount: number; currency: string;
  name: string; email: string; due: string | null; overdue: boolean; payUrl: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toInvoice(i: any, today = new Date().toISOString().slice(0, 10)): Invoice {
  const r = i.primary_recipients?.[0]?.billing_info ?? {};
  const due = i.detail?.payment_term?.due_date ?? null;
  const open = ["SENT", "UNPAID", "PARTIALLY_PAID"].includes(i.status);
  return {
    id: i.id,
    number: i.detail?.invoice_number ?? i.id,
    status: i.status,
    amount: Number(i.amount?.value ?? 0),
    currency: i.amount?.currency_code ?? "USD",
    name: [r.name?.given_name, r.name?.surname].filter(Boolean).join(" ") || r.email_address || "Guest",
    email: r.email_address ?? "",
    due,
    overdue: open && !!due && due < today,
    // list results omit recipient_view_url; it is derived from the id the same way PayPal builds it
    payUrl: i.detail?.metadata?.recipient_view_url ?? `https://www.sandbox.paypal.com/invoice/p/#${String(i.id).replace(/^INV2-/, "").replace(/-/g, "")}`,
  };
}

export async function getInvoices(): Promise<Invoice[]> {
  const data = await paypal("/v2/invoicing/invoices?page_size=50&total_required=false&fields=all");
  return (data.items ?? []).map((i: unknown) => toInvoice(i)).filter((i: Invoice) => i.status !== "DRAFT" && i.status !== "CANCELLED");
}
