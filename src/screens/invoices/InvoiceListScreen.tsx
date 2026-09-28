import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Share, TouchableOpacity, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { listInvoices, getInvoicePdfUrl, Invoice } from '@/api/endpoints';
import { FormInput, Button } from '@/components/Form';
import { Card, Chip, InvoiceRow, Banner, errorMessage } from '@/components/ui';
import { colors, spacing } from '@/theme';

const FILTERS: [string, string | undefined][] = [
  ['All', undefined], ['Draft', 'draft'], ['Sent', 'sent'], ['Overdue', 'overdue'], ['Paid', 'paid'],
];

export default function InvoiceListScreen({ navigation }: any) {
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [query, setQuery] = useState('');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setInvoices((await listInvoices(status ? { status } : undefined)).invoices); setError(null); }
    catch (e) { setError(errorMessage(e)); }
  }, [status]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return invoices;
    return invoices.filter(
      (inv) => String(inv.invoice_number).includes(q) || (inv.client_name || '').toLowerCase().includes(q)
    );
  }, [invoices, query]);

  const shareInvoice = async (inv: Invoice) => {
    setSendingId(inv.id);
    try {
      const url = await getInvoicePdfUrl(inv.id);
      await Share.share({ message: `Invoice #${inv.invoice_number}${inv.client_name ? ` for ${inv.client_name}` : ''} — ${url}`, url });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSendingId(null);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: spacing.md }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      keyboardShouldPersistTaps="handled"
    >
      <Button title="+ New invoice" onPress={() => navigation.navigate('InvoiceCreate')} />
      <FormInput placeholder="Search by invoice # or customer name" value={query} onChangeText={setQuery} autoCapitalize="none" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.sm }}>
        {FILTERS.map(([label, value]) => (
          <Chip key={label} label={label} active={status === value} onPress={() => setStatus(value)} />
        ))}
      </View>
      {error && <Banner tone="danger" text={error} />}
      <Card>
        {visible.length === 0 && <Text style={{ color: colors.textSecondary }}>No invoices match.</Text>}
        {visible.map((inv) => (
          <View key={inv.id}>
            <InvoiceRow inv={inv} onPress={() => navigation.navigate('InvoiceDetail', { id: inv.id })} />
            {inv.status === 'paid' && (
              <View style={styles.paidActions}>
                <TouchableOpacity onPress={() => navigation.navigate('InvoiceDetail', { id: inv.id })}>
                  <Text style={styles.actionText}>View</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => shareInvoice(inv)} disabled={sendingId === inv.id}>
                  <Text style={styles.actionText}>{sendingId === inv.id ? 'Preparing link…' : 'Send'}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  paidActions: {
    flexDirection: 'row', gap: 20, paddingBottom: 10, marginTop: -6,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  actionText: { color: colors.accent, fontSize: 13, fontWeight: '600' },
});
