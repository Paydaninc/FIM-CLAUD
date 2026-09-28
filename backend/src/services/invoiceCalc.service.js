/**
 * Computes subtotal / tax_total / discount_total / total for an invoice.
 *
 * ASSUMPTION (documented, not hidden): discounts do NOT reduce the tax base.
 * Tax is computed per line on that line's full (pre-discount) amount; the
 * invoice-level discount is subtracted afterwards as its own line.
 *   total = subtotal - discount_total + tax_total
 *
 * Effective tax rate per line, in priority order:
 *   line.tax_rate  →  invoice.tax_rate (override)  →  business.default_tax_rate  →  0
 */
function computeInvoiceTotals({ lineItems, invoiceTaxRate, businessDefaultTaxRate, discountType, discountValue }) {
  let subtotal = 0;
  let taxTotal = 0;

  for (const item of lineItems) {
    const lineAmount = Number(item.quantity) * Number(item.unit_price);
    const effectiveTaxRate =
      item.tax_rate != null ? Number(item.tax_rate)
      : invoiceTaxRate != null ? Number(invoiceTaxRate)
      : Number(businessDefaultTaxRate || 0);

    subtotal += lineAmount;
    taxTotal += lineAmount * (effectiveTaxRate / 100);
  }

  let discountTotal = 0;
  if (discountType === 'percent') {
    discountTotal = subtotal * (Number(discountValue || 0) / 100);
  } else if (discountType === 'fixed') {
    discountTotal = Number(discountValue || 0);
  }
  // Never let a fixed discount exceed the subtotal.
  discountTotal = Math.min(discountTotal, subtotal);

  const total = subtotal - discountTotal + taxTotal;

  const round2 = (n) => Math.round(n * 100) / 100;
  return {
    subtotal: round2(subtotal),
    tax_total: round2(taxTotal),
    discount_total: round2(discountTotal),
    total: round2(total),
  };
}

module.exports = { computeInvoiceTotals };
