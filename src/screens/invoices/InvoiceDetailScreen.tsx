import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Alert, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import { initStripe, initPaymentSheet, presentPaymentSheet } from '@stripe/stripe-react-native';
import {
  getInvoice, Invoice, sendInvoice, voidInvoice, payCash, createCardPaymentIntent,
  createPaymentLink, createAchPaymentIntent, refundInvoice,
} from '@/api/endpoints';
import { isDemoMode } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/Form';
import { Card, Banner, Row, SectionTitle, StatusBadge, money, shortDate, errorMessage } from '@/components/ui';
import { colors, spacing, typography } from '@/theme';

// API version the Stripe mobile SDK expects for ephemeral keys (ACH / saved-customer flows).
const STRIPE_MOBILE_API_VERSION = '2020-08-27';

const confirm = (title: string, message: string) =>
  new Promise<boolean>((resolve) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Continue', onPress: () => resolve(true) },
    ])
  );

export default function InvoiceDetailScreen({ route, navigation }: any) {
  const { id } = route.params;
  const { business, stripeStatus } = useAuth();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setInvoice((await getInvoice(id)).invoice); setError(null); }
    catch (e) { setError(errorMessage(e)); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  /** Payment success is confirmed by Stripe webhooks server-side; poll briefly for the status flip. */
  const pollForUpdate = async () => {
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      await load();
    }
  };

  const act = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); } catch (e) { Alert.alert('Something went wrong', errorMessage(e)); }
    finally { setBusy(null); }
  };

  const doSend = () => act('send', async () => { await sendInvoice(id); await load(); });
  const doVoid = () => act('void', async () => {
    if (await confirm('Void this invoice?', 'A voided invoice can no longer be paid.')) { await voidInvoice(id); await load(); }
  });
  const doCash = () => act('cash', async () => {
    if (await confirm('Mark as paid (cash)?', 'No card is charged and no platform fee applies.')) { await payCash(id); await load(); }
  });
  const doLink = () => act('link', async () => { setLink((await createPaymentLink(id)).checkoutUrl); });
  const copyLink = async () => { if (link) { await Clipboard.setStringAsync(link); Alert.alert('Copied', 'Payment link copied. Paste it into a text or email to your customer.'); } };

  const doCard = () => act('card', async () => {
    if (isDemoMode()) { await payCash(id); await load(); Alert.alert('Demo mode', "In the live app, Stripe's secure card sheet opens here. Marked as paid for the demo."); return; }
    const { clientSecret, publishableKey, connectedAccountId } = await createCardPaymentIntent(id);
    await initStripe({ publishableKey, stripeAccountId: connectedAccountId });
    const init = await initPaymentSheet({ merchantDisplayName: business?.business_name || 'Invoice', paymentIntentClientSecret: clientSecret });
    if (init.error) throw new Error(init.error.message);
    const res = await presentPaymentSheet();
    if (res.error) { if (res.error.code !== 'Canceled') throw new Error(res.error.message); return; }
    Alert.alert('Payment submitted', 'Updating invoice status…');
    await pollForUpdate();
  });

  const doAch = () => act('ach', async () => {
    const ok = await confirm('Bank payment (ACH)', 'ACH payments typically take 4–5 business days to complete. The invoice will show as "Processing" until it settles.');
    if (!ok) return;
    if (isDemoMode()) { Alert.alert('Demo mode', 'In the live app, Stripe Financial Connections opens here to link a bank account.'); return; }
    const a = await createAchPaymentIntent(id, STRIPE_MOBILE_API_VERSION);
    await initStripe({ publishableKey: a.publishableKey, stripeAccountId: a.connectedAccountId });
    const init = await initPaymentSheet({
      merchantDisplayName: business?.business_name || 'Invoice',
      paymentIntentClientSecret: a.clientSecret,
      customerId: a.customerId,
      customerEphemeralKeySecret: a.ephemeralKey,
      allowsDelayedPaymentMethods: true,
    });
    if (init.error) throw new Error(init.error.message);
    const res = await presentPaymentSheet();
    if (res.error) { if (res.error.code !== 'Canceled') throw new Error(res.error.message); return; }
    Alert.alert('Bank payment started', a.disclosure);
    await pollForUpdate();
  });

  const doRefund = () => act('refund', async () => {
    if (await confirm('Refund this invoice?', 'The full amount is returned to the customer and the platform fee is reversed.')) {
      await refundInvoice(id);
      Alert.alert('Refund started', 'The invoice updates automatically once Stripe confirms it.');
      await pollForUpdate();
    }
  });

  if (!invoice) {
    return <View style={styles.container}><Text style={{ padding: spacing.md, color: error ? colors.danger : colors.textSecondary }}>{error || 'Loading…'}</Text></View>;
  }

  const payable = ['sent', 'viewed', 'overdue'].includes(invoice.status);
  const ready = !!stripeStatus?.readyForPayments;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs }}>
        <Text style={styles.title}>Invoice #{invoice.invoice_number}</Text>
        <StatusBadge status={invoice.status} />
      </View>
      <Text style={styles.sub}>{invoice.client_name || 'No client'} · Due {shortDate(invoice.due_date)}</Text>

      {invoice.last_payment_failure_reason && <Banner tone="danger" text={`Last payment failed: ${invoice.last_payment_failure_reason}`} />}
      {invoice.disputed && <Banner tone="danger" text={`Disputed: ${invoice.dispute_reason || 'A customer opened a dispute.'}`} />}
      {invoice.status === 'processing' && <Banner tone="info" text="Bank (ACH) payment is processing — this can take several business days." />}
      {error && <Banner tone="danger" text={error} />}

      <Card>
        {invoice.line_items?.map((li, i) => (
          <Row key={i} left={`${li.description}  ×${li.quantity}`} right={money(Number(li.quantity) * Number(li.unit_price))} />
        ))}
        <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 8 }} />
        <Row left="Subtotal" right={money(invoice.subtotal)} />
        {Number(invoice.discount_total) > 0 && <Row left="Discount" right={`-${money(invoice.discount_total)}`} />}
        {Number(invoice.tax_total) > 0 && <Row left="Tax" right={money(invoice.tax_total)} />}
        <Row left="Total" right={money(invoice.total)} bold />
        {invoice.status === 'paid' && <Row left="Paid" right={money(invoice.amount_paid)} />}
      </Card>

      {invoice.status === 'draft' && (
        <>
          <Button title="Mark as sent" onPress={doSend} loading={busy === 'send'} />
          <Button title="Void invoice" variant="secondary" onPress={doVoid} loading={busy === 'void'} />
        </>
      )}

      {payable && (
        <>
          <SectionTitle>Collect payment</SectionTitle>
          <Text style={styles.note}>Full payment only — partial payments aren't supported.</Text>
          <Button title="Mark as paid (cash)" variant="secondary" onPress={doCash} loading={busy === 'cash'} />
          {ready ? (
            <>
              <Button title="Pay by card" onPress={doCard} loading={busy === 'card'} />
              <Button title="Pay by bank (ACH)" variant="secondary" onPress={doAch} loading={busy === 'ach'} />
              <Button title={link ? 'Regenerate payment link' : 'Get payment link'} variant="secondary" onPress={doLink} loading={busy === 'link'} />
              {link && (
                <Card>
                  <Text selectable style={{ color: colors.text, fontSize: 12, marginBottom: spacing.sm }}>{link}</Text>
                  <Button title="Copy link" onPress={copyLink} />
                  <Text style={styles.note}>Paste it into your own text or email — the app doesn't send it for you. The invoice flips to Paid automatically once your customer pays.</Text>
                </Card>
              )}
              <Button title="Tap to Pay (coming soon)" variant="secondary" disabled onPress={() => {}} />
            </>
          ) : (
            <Banner tone="warning" text="Finish connecting Stripe (Settings) to accept card, bank, and link payments." />
          )}
          <Button title="Void invoice" variant="secondary" onPress={doVoid} loading={busy === 'void'} />
        </>
      )}

      {invoice.status === 'paid' && <Button title="Refund" variant="danger" onPress={doRefund} loading={busy === 'refund'} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  title: { ...typography.h1, color: colors.text },
  sub: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.md },
  note: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.sm },
});
