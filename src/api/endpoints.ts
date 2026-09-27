import { apiRequest, setToken, BASE_URL } from './client';

// ── Types (mirroring the backend's response shapes) ──────────────────────
export interface User {
  id: string;
  email: string;
  emailVerified: boolean;
}

export interface Business {
  id: string;
  business_name: string;
  logo_url: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  default_tax_rate: string;
  default_payment_terms: string | null;
}

export interface StripeStatus {
  connected: boolean;
  onboardingType?: 'express' | 'standard';
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
  detailsSubmitted?: boolean;
  readyForPayments: boolean;
}

export interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
}

export interface LineItem {
  id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate?: number | null;
}

export interface Invoice {
  id: string;
  invoice_number: number;
  status: 'draft' | 'sent' | 'viewed' | 'processing' | 'paid' | 'overdue' | 'void';
  subtotal: string;
  tax_total: string;
  discount_total: string;
  total: string;
  amount_paid: string;
  due_date: string | null;
  notes: string | null;
  payment_terms: string | null;
  client_id: string | null;
  client_name?: string;
  disputed: boolean;
  dispute_reason: string | null;
  last_payment_failure_reason: string | null;
  line_items?: LineItem[];
}

export interface DashboardSummary {
  stripeStatus: StripeStatus;
  invoiceSummary: {
    counts: Record<string, number>;
    totalOutstanding: number;
    totalPaid: number;
  };
  recentInvoices: Invoice[];
}

// ── Auth ───────────────────────────────────────────────────────────────
export async function signup(email: string, password: string) {
  const result = await apiRequest<{ user: User; accessToken: string }>('/auth/signup', {
    method: 'POST',
    body: { email, password },
    skipAuth: true,
  });
  await setToken(result.accessToken);
  return result;
}

export async function login(email: string, password: string) {
  const result = await apiRequest<{ user: User; accessToken: string }>('/auth/login', {
    method: 'POST',
    body: { email, password },
    skipAuth: true,
  });
  await setToken(result.accessToken);
  return result;
}

export async function logout() {
  await setToken(null);
}

export async function getMe() {
  return apiRequest<{ user: User }>('/auth/me');
}

// ── Business ───────────────────────────────────────────────────────────
export async function getMyBusiness() {
  return apiRequest<{ business: Business }>('/business/me');
}

export async function createBusiness(data: Partial<Business>) {
  return apiRequest<{ business: Business }>('/business', { method: 'POST', body: data });
}

// ── Stripe Connect ───────────────────────────────────────────────────────
export async function getStripeStatus() {
  return apiRequest<StripeStatus>('/stripe/connect/status');
}

export async function startExpressOnboarding() {
  return apiRequest<{ onboardingUrl: string }>('/stripe/connect/express/start', { method: 'POST' });
}

export async function startStandardOnboarding() {
  return apiRequest<{ onboardingUrl: string }>('/stripe/connect/standard/start', { method: 'POST' });
}

// ── Dashboard ────────────────────────────────────────────────────────────
export async function getDashboard() {
  return apiRequest<DashboardSummary>('/dashboard');
}

// ── Clients ──────────────────────────────────────────────────────────────
export async function listClients(search?: string) {
  const qs = search ? `?search=${encodeURIComponent(search)}` : '';
  return apiRequest<{ clients: Client[] }>(`/clients${qs}`);
}

export async function createClient(data: Partial<Client>) {
  return apiRequest<{ client: Client }>('/clients', { method: 'POST', body: data });
}

// ── Invoices ─────────────────────────────────────────────────────────────
export async function listInvoices(filters?: { status?: string; clientId?: string }) {
  const params = new URLSearchParams(filters as Record<string, string>).toString();
  return apiRequest<{ invoices: Invoice[] }>(`/invoices${params ? `?${params}` : ''}`);
}

export async function getInvoice(id: string) {
  return apiRequest<{ invoice: Invoice }>(`/invoices/${id}`);
}

export async function createInvoice(data: {
  client_id?: string; due_date?: string; notes?: string; payment_terms?: string;
  tax_rate?: number; discount_type?: 'percent' | 'fixed'; discount_value?: number;
  line_items: LineItem[];
}) {
  return apiRequest<{ invoice: Invoice }>('/invoices', { method: 'POST', body: data });
}

export async function sendInvoice(id: string) {
  return apiRequest<{ invoice: Invoice }>(`/invoices/${id}/send`, { method: 'POST' });
}

export async function voidInvoice(id: string) {
  return apiRequest<{ invoice: Invoice }>(`/invoices/${id}/void`, { method: 'POST' });
}

// ── Payments ─────────────────────────────────────────────────────────────
export async function payCash(invoiceId: string) {
  return apiRequest<{ invoice: Invoice }>(`/invoices/${invoiceId}/pay/cash`, { method: 'POST' });
}

export async function createCardPaymentIntent(invoiceId: string) {
  return apiRequest<{ clientSecret: string; publishableKey: string; connectedAccountId: string }>(
    `/invoices/${invoiceId}/pay/card/intent`, { method: 'POST' }
  );
}

export async function createPaymentLink(invoiceId: string) {
  return apiRequest<{ checkoutUrl: string }>(`/invoices/${invoiceId}/pay/link`, { method: 'POST' });
}

export async function createAchPaymentIntent(invoiceId: string, stripeVersion: string) {
  return apiRequest<{
    clientSecret: string; ephemeralKey: string; customerId: string;
    publishableKey: string; connectedAccountId: string; disclosure: string;
  }>(`/invoices/${invoiceId}/pay/ach/intent`, { method: 'POST', body: { stripe_version: stripeVersion } });
}

export async function createTapToPayIntent(invoiceId: string) {
  return apiRequest<{ clientSecret: string; connectedAccountId: string }>(
    `/invoices/${invoiceId}/pay/tap-to-pay/intent`, { method: 'POST' }
  );
}

export async function getTerminalConnectionToken() {
  return apiRequest<{ secret: string; locationId: string; connectedAccountId: string }>(
    '/stripe/terminal/connection-token', { method: 'POST' }
  );
}

export async function refundInvoice(invoiceId: string, amount?: number) {
  return apiRequest<{ refund: { id: string; status: string; amount: number } }>(
    `/invoices/${invoiceId}/refund`, { method: 'POST', body: amount ? { amount } : {} }
  );
}

export function getInvoicePdfUrl(invoiceId: string) {
  // Used directly as a URI (e.g. by expo-print/share or a WebView) rather
  // than through apiRequest, since it's a binary PDF stream, not JSON.
  return `${BASE_URL}/invoices/${invoiceId}/pdf`;
}
