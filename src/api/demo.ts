/**
 * Demo mode: an in-memory fake backend so the whole app can be explored
 * without a server. Mirrors the real API's response shapes exactly.
 */
type Json = any;
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const round2 = (n: number) => Math.round(n * 100) / 100;

const business = {
  id: 'demo-biz', business_name: "Jane's Landscaping", logo_url: null,
  address_line1: '123 Main St', address_line2: null, city: 'Springfield', state: 'CA',
  postal_code: '94103', country: 'US', phone: '(555) 555-0100', email: 'jane@example.com',
  default_tax_rate: '8.75', default_payment_terms: 'Net 15',
};

const clients: Json[] = [
  { id: 'c1', name: 'Acme Co', email: 'billing@acme.test', phone: '(555) 010-0001', city: 'Oakland', state: 'CA' },
  { id: 'c2', name: 'Riverside Cafe', email: 'owner@riverside.test', phone: null, city: 'Berkeley', state: 'CA' },
  { id: 'c3', name: 'Maya Rodriguez', email: 'maya@example.test', phone: null, city: null, state: null },
];

function totals(items: Json[], discountType?: string | null, discountValue?: number, invoiceTax?: number | null) {
  let subtotal = 0; let tax = 0;
  for (const it of items) {
    const line = Number(it.quantity) * Number(it.unit_price);
    const rate = it.tax_rate != null ? Number(it.tax_rate) : invoiceTax != null ? Number(invoiceTax) : Number(business.default_tax_rate);
    subtotal += line; tax += line * (rate / 100);
  }
  let discount = 0;
  if (discountType === 'percent') discount = subtotal * (Number(discountValue || 0) / 100);
  else if (discountType === 'fixed') discount = Number(discountValue || 0);
  discount = Math.min(discount, subtotal);
  return {
    subtotal: round2(subtotal).toFixed(2), tax_total: round2(tax).toFixed(2),
    discount_total: round2(discount).toFixed(2), total: round2(subtotal - discount + tax).toFixed(2),
  };
}

function makeInvoice(n: number, status: string, clientId: string, items: Json[], due: string, extra: Json = {}) {
  const t = totals(items, null, 0, null);
  return {
    id: `i${n}`, invoice_number: n, status, ...t, amount_paid: status === 'paid' ? t.total : '0.00',
    due_date: due, notes: null, payment_terms: 'Net 15', client_id: clientId,
    disputed: false, dispute_reason: null, last_payment_failure_reason: null,
    created_at: new Date(Date.now() - (2000 - n) * 3600 * 1000).toISOString(), line_items: items, ...extra,
  };
}

let invoices: Json[] = [
  makeInvoice(1007, 'draft', 'c3', [{ description: 'Spring cleanup estimate', quantity: 1, unit_price: 250 }], '2026-10-30'),
  makeInvoice(1006, 'sent', 'c1', [{ description: 'Lawn maintenance — October', quantity: 4, unit_price: 125 }], '2026-10-12'),
  makeInvoice(1005, 'overdue', 'c2', [{ description: 'Patio installation', quantity: 1, unit_price: 600 }, { description: 'Materials', quantity: 1, unit_price: 100, tax_rate: 0 }], '2026-09-20'),
  makeInvoice(1004, 'paid', 'c3', [{ description: 'Tree trimming', quantity: 3, unit_price: 500 }], '2026-09-10'),
  makeInvoice(1003, 'paid', 'c1', [{ description: 'Irrigation repair', quantity: 2, unit_price: 900 }], '2026-09-01'),
];
let nextNumber = 1008;

const withClient = (inv: Json) => ({ ...inv, client_name: clients.find((c) => c.id === inv.client_id)?.name });

export async function demoRequest(path: string, method: string, body: Json): Promise<Json> {
  await delay(200);
  const [p, qs = ''] = path.split('?');
  const q = new URLSearchParams(qs);
  const fail = (m: string) => { throw new Error(m); };

  if (p === '/auth/me') return { user: { id: 'demo', email: 'demo@example.com', emailVerified: true } };
  if (p === '/business/me') {
    if (method === 'PATCH') Object.assign(business, body);
    return { business };
  }
  if (p === '/stripe/connect/status') {
    return { connected: true, onboardingType: 'express', chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true, readyForPayments: true };
  }

  if (p === '/dashboard') {
    const counts: Json = { draft: 0, sent: 0, viewed: 0, processing: 0, paid: 0, overdue: 0, void: 0 };
    let out = 0; let paid = 0;
    for (const i of invoices) {
      counts[i.status] += 1;
      if (['sent', 'viewed', 'processing', 'overdue'].includes(i.status)) out += Number(i.total);
      if (i.status === 'paid') paid += Number(i.total);
    }
    return {
      stripeStatus: { connected: true, readyForPayments: true, chargesEnabled: true, payoutsEnabled: true },
      invoiceSummary: { counts, totalOutstanding: round2(out), totalPaid: round2(paid) },
      recentInvoices: invoices.slice(0, 10).map(withClient),
    };
  }

  if (p === '/clients') {
    if (method === 'POST') {
      const c = { id: `c${clients.length + 1}`, phone: null, city: null, state: null, ...body };
      clients.push(c); return { client: c };
    }
    const s = (q.get('search') || '').toLowerCase();
    return { clients: clients.filter((c) => !s || c.name.toLowerCase().includes(s)) };
  }

  if (p === '/invoices' && method === 'GET') {
    const st = q.get('status');
    return { invoices: invoices.filter((i) => !st || i.status === st).map(withClient) };
  }
  if (p === '/invoices' && method === 'POST') {
    const t = totals(body.line_items, body.discount_type, body.discount_value, body.tax_rate ?? null);
    const inv = {
      id: `i${nextNumber}`, invoice_number: nextNumber, status: 'draft', ...t, amount_paid: '0.00',
      due_date: body.due_date || null, notes: body.notes || null, payment_terms: body.payment_terms || 'Net 15',
      client_id: body.client_id || null, disputed: false, dispute_reason: null, last_payment_failure_reason: null,
      created_at: new Date().toISOString(),
      line_items: body.line_items.map((l: Json) => ({ ...l, quantity: Number(l.quantity), unit_price: Number(l.unit_price) })),
    };
    nextNumber += 1; invoices = [inv, ...invoices]; return { invoice: withClient(inv) };
  }

  const m = p.match(/^\/invoices\/([^/]+)(?:\/(.*))?$/);
  if (m) {
    const inv = invoices.find((i) => i.id === m[1]);
    if (!inv) return fail('Invoice not found.');
    const action = m[2];
    if (!action) return { invoice: withClient(inv) };
    if (action === 'send') { inv.status = 'sent'; return { invoice: withClient(inv) }; }
    if (action === 'void') { inv.status = 'void'; return { invoice: withClient(inv) }; }
    if (action === 'pay/cash') { inv.status = 'paid'; inv.amount_paid = inv.total; return { invoice: withClient(inv) }; }
    if (action === 'pay/link') return { checkoutUrl: `https://checkout.stripe.com/c/pay/demo_${inv.id}` };
    if (action === 'refund') {
      inv.status = 'sent'; inv.amount_paid = '0.00';
      return { refund: { id: 're_demo', status: 'succeeded', amount: Number(inv.total) } };
    }
  }
  return fail(`Demo mode: ${method} ${p} isn't available.`);
}
