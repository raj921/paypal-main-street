// Seeds Hearth Bakery's sandbox: overdue, open and paid invoices. Run: npm run seed
const B = "https://api-m.sandbox.paypal.com";
const { PAYPAL_CLIENT_ID: id, PAYPAL_CLIENT_SECRET: secret, PAYPAL_BUYER_EMAIL: buyer } = process.env;
const { access_token } = await fetch(`${B}/v1/oauth2/token`, {
  method: "POST",
  headers: { Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
  body: "grant_type=client_credentials",
}).then((r) => r.json());
const H = { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json", Prefer: "return=representation" };
const call = async (path, body, method = "POST") => {
  const r = await fetch(B + path, { method, headers: H, body: body && JSON.stringify(body) });
  if (!r.ok) throw new Error(`${r.status} ${path} ${await r.text()}`);
  return r.status === 204 ? null : r.json();
};
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

// Cancel whatever is still open so re-running gives a clean street.
const { items = [] } = await call("/v2/invoicing/invoices?page_size=100", null, "GET");
for (const i of items) {
  if (["SENT", "UNPAID", "PARTIALLY_PAID"].includes(i.status)) await call(`/v2/invoicing/invoices/${i.id}/cancel`, { send_to_recipient: false, send_to_invoicer: false });
}

// [given, surname, email, item, amount, invoiced days ago, due in days, paid]
const people = [
  ["Dana", "Okafor", "dana.okafor@example.com", "Wedding cake deposit", 180, 40, -25],
  ["Luis", "Mendes", "luis@cafe-mendes.example.com", "Weekly croissant order (café)", 96, 30, -12],
  ["Hana", "Kim", "hana.kim@example.com", "Birthday cake", 64, 21, -6],
  ["Tom", "Becker", "tom.becker@example.com", "Rye loaves x6", 27, 18, -3],
  ["Priya", "Nair", buyer, "Sourdough subscription box", 24, 1, 14],
  ["Oscar", "Reyes", "oscar.reyes@example.com", "Office breakfast tray", 75, 2, 10],
  ["Mei", "Chen", "mei.chen@example.com", "Macaron tower", 120, 10, 5, true],
  ["Ana", "Silva", "ana.silva@example.com", "Bread class ticket", 45, 7, 7, true],
  ["Jon", "Park", "jon.park@example.com", "Pastry box", 32, 5, 9, true],
];
for (const [given_name, surname, email_address, name, value, ago, due, paid] of people) {
  const inv = await call("/v2/invoicing/invoices", {
    detail: { currency_code: "USD", invoice_date: day(-ago), payment_term: { term_type: "DUE_ON_DATE_SPECIFIED", due_date: day(due) }, note: "Thank you for buying local. Hearth Bakery, Main Street" },
    invoicer: { business_name: "Hearth Bakery" },
    primary_recipients: [{ billing_info: { name: { given_name, surname }, email_address } }],
    items: [{ name, quantity: "1", unit_amount: { currency_code: "USD", value: value.toFixed(2) } }],
  });
  await call(`/v2/invoicing/invoices/${inv.id}/send`, { send_to_invoicer: false });
  if (paid) await call(`/v2/invoicing/invoices/${inv.id}/payments`, { method: "CASH", payment_date: day(-1), amount: { currency_code: "USD", value: value.toFixed(2) }, note: "Paid at the counter" });
  console.log(`${paid ? "paid   " : due < 0 ? "overdue" : "open   "} ${given_name} ${surname} $${value} ${inv.id}`);
}
