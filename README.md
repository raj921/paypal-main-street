# Main Street

Your PayPal account, run as a pixel town. Every customer you invoice is a person on the street, and AI staff do the PayPal work while you watch.

- Overdue invoices stand on the left side of the street with a red "!".
- Open invoices wait by the bench.
- Paid customers hang around the bakery. When an invoice gets paid, that person walks into the shop and coins pop.
- Click anyone to see the real PayPal invoice behind them, with PayPal's own QR code and pay page.
- Tell Mira, the manager, what you need ("chase everyone overdue over $50"). She calls PayPal through the Agent Toolkit, and you see Ava the accountant walk over to each debtor as each reminder goes out.

**Who it's for:** small shop owners who don't read payment dashboards and don't trust an AI touching their money where they can't see it. Main Street shows every action on screen as a person doing a job.

## Run it

```bash
npm install
cp .env.example .env.local   # add your PayPal sandbox app keys and an Anthropic API key
npm run seed                 # creates Hearth Bakery's overdue, open and paid invoices in your sandbox
npm run dev
```

`npm run seed` cancels the open invoices first, so you can run it again for a fresh street.

## How PayPal and AI are used

| Piece | What it does |
|---|---|
| PayPal Agent Toolkit (`@paypal/agent-toolkit/openai`) | Mira's tools: invoices (list, search, create, send, remind, QR), shipment tracking, orders, products, plans, transactions, merchant insights. Delete, cancel and refund are switched off because the demo URL is public. |
| PayPal Invoicing v2 REST | The town polls invoices every 4 s; `generate-qr-code` shows the QR code; the seed script records cash payments for the regulars. |
| Claude Haiku 5.5 (`@anthropic-ai/sdk`) | Mira's brain: reads the request, picks PayPal tools, and loops until the job is done. The current invoice list goes into its prompt so it can act in one step. |

Sandbox only. Note: PayPal blocks invoices to India-based buyer accounts, so pay the demo invoice with a US sandbox personal account.

## Hackathon checklist (PayPal AI Hackathon on Devpost)

Deadline: **12 Nov 2026, 3:00 pm EST** (12:00 pm PT, 01:30 IST on 13 Nov). Don't change the repo after the deadline.

Submission needs:
- [ ] Text description of features and functionality
- [ ] Functional demo: hosted URL or full run instructions (this README)
- [ ] Tools used: which models and AI services, and how
- [ ] Public GitHub repo with all code and an open-source licence shown in the About section
- [ ] Demo video under 3 minutes on YouTube, public, showing it working end to end, with no third-party music or trademarks used without permission

Judged on: technological implementation, design, potential impact, innovation, presentation.

## Licence

MIT
