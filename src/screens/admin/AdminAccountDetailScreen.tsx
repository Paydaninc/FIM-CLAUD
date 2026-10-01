import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Alert, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  getAdminAccount, updateAdminAccountBusiness, deactivateAdminAccount, reactivateAdminAccount,
  getAdminAccountTransactions, AdminTransaction,
} from '@/api/endpoints';
import { FormInput, Button, ErrorText } from '@/components/Form';
import { Card, Banner, Row, SectionTitle, money, shortDate, errorMessage } from '@/components/ui';
import { colors, spacing } from '@/theme';

const BIZ_FIELDS: [string, string][] = [
  ['business_name', 'Business name'],
  ['email', 'Business email'],
  ['phone', 'Phone'],
  ['address_line1', 'Address'],
  ['address_line2', 'Address line 2'],
  ['city', 'City'],
  ['state', 'State'],
  ['postal_code', 'ZIP'],
  ['default_tax_rate', 'Default tax rate (%)'],
  ['default_payment_terms', 'Payment terms'],
];

export default function AdminAccountDetailScreen({ route, navigation }: any) {
  const { userId } = route.params;
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof getAdminAccount>> | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [transactions, setTransactions] = useState<AdminTransaction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await getAdminAccount(userId);
      setDetail(res);
      const f: Record<string, string> = {};
      BIZ_FIELDS.forEach(([key]) => { f[key] = (res.business as any)?.[key] != null ? String((res.business as any)[key]) : ''; });
      setForm(f);
      setError(null);
    } catch (e) { setError(errorMessage(e)); }
    try { setTransactions((await getAdminAccountTransactions(userId)).invoices); } catch { /* non-fatal */ }
  }, [userId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const setField = (key: string) => (v: string) => setForm({ ...form, [key]: v });

  const saveBusiness = async () => {
    setBusy('save'); setError(null);
    try {
      const res = await updateAdminAccountBusiness(userId, form as any);
      setDetail((d) => (d ? { ...d, business: res.business } : d));
      Alert.alert('Saved', 'Business info updated.');
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(null); }
  };

  const toggleActive = async (active: boolean) => {
    setBusy('toggle'); setError(null);
    try {
      if (active) await reactivateAdminAccount(userId);
      else await deactivateAdminAccount(userId);
      setDetail((d) => (d ? { ...d, user: { ...d.user, is_active: active } } : d));
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(null); }
  };

  const confirmDeactivate = () => {
    Alert.alert('Deactivate this account?', 'They will be signed out immediately and unable to log back in until reactivated.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Deactivate', style: 'destructive', onPress: () => toggleActive(false) },
    ]);
  };

  if (!detail) {
    return <View style={styles.container}><Text style={{ padding: spacing.md, color: error ? colors.danger : colors.textSecondary }}>{error || 'Loading…'}</Text></View>;
  }

  const { user, business, stripeAccount, clientCount } = detail;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.md }} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>{user.email}</Text>
      <Text style={styles.sub}>Joined {shortDate(user.created_at)}{!user.email_verified ? ' · email not verified' : ''}</Text>
      {error && <Banner tone="danger" text={error} />}

      <SectionTitle>Account</SectionTitle>
      <Card>
        <Row left="Status" right={user.is_active ? 'Active' : 'Deactivated'} bold />
        {user.is_active ? (
          <Button title="Deactivate account" variant="danger" onPress={confirmDeactivate} loading={busy === 'toggle'} />
        ) : (
          <Button title="Reactivate account" variant="secondary" onPress={() => toggleActive(true)} loading={busy === 'toggle'} />
        )}
      </Card>

      <SectionTitle>Stripe</SectionTitle>
      <Card>
        {stripeAccount ? (
          <>
            <Row left="Charges" right={stripeAccount.charges_enabled ? 'Enabled' : 'Not enabled'} />
            <Row left="Payouts" right={stripeAccount.payouts_enabled ? 'Enabled' : 'Not enabled'} />
            <Row left="Type" right={stripeAccount.onboarding_type} />
          </>
        ) : (
          <Text style={{ color: colors.textSecondary }}>Not connected.</Text>
        )}
        <Row left="Clients" right={String(clientCount)} />
      </Card>

      <SectionTitle>Business info</SectionTitle>
      <Card>
        {business ? (
          <>
            {BIZ_FIELDS.map(([key, label]) => (
              <FormInput key={key} label={label} value={form[key] || ''} onChangeText={setField(key)} />
            ))}
            <Button title="Save changes" onPress={saveBusiness} loading={busy === 'save'} />
          </>
        ) : (
          <Text style={{ color: colors.textSecondary }}>This account hasn't created a business profile yet.</Text>
        )}
      </Card>

      <SectionTitle>Transaction log</SectionTitle>
      <Card>
        {transactions.length === 0 && <Text style={{ color: colors.textSecondary }}>No invoices yet.</Text>}
        {transactions.map((inv) => (
          <View key={inv.id} style={styles.txRow}>
            <Row left={`#${inv.invoice_number} · ${inv.client_name || 'No client'}`} right={money(inv.total)} bold />
            <Row left={`${inv.status} · ${shortDate(inv.created_at)}`} right={`Paid ${money(inv.amount_paid)}`} />
            {inv.payments.map((p) => (
              <Text key={p.id} style={styles.payLine}>
                {p.method} {money(p.amount)} — {p.status}
                {p.failure_reason ? ` (${p.failure_reason})` : ''}
                {Number(p.refunded_amount) > 0 ? ` · refunded ${money(p.refunded_amount)}` : ''}
              </Text>
            ))}
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  sub: { fontSize: 13, color: colors.textSecondary, marginBottom: spacing.md },
  txRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  payLine: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
});
