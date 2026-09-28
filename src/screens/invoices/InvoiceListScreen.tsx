import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { listInvoices, Invoice } from '@/api/endpoints';
import { Button } from '@/components/Form';
import { Card, Chip, InvoiceRow, Banner, errorMessage } from '@/components/ui';
import { colors, spacing } from '@/theme';

const FILTERS: [string, string | undefined][] = [
  ['All', undefined], ['Draft', 'draft'], ['Sent', 'sent'], ['Overdue', 'overdue'], ['Paid', 'paid'],
];

export default function InvoiceListScreen({ navigation }: any) {
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setInvoices((await listInvoices(status ? { status } : undefined)).invoices); setError(null); }
    catch (e) { setError(errorMessage(e)); }
  }, [status]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: spacing.md }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      <Button title="+ New invoice" onPress={() => navigation.navigate('InvoiceCreate')} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.sm }}>
        {FILTERS.map(([label, value]) => (
          <Chip key={label} label={label} active={status === value} onPress={() => setStatus(value)} />
        ))}
      </View>
      {error && <Banner tone="danger" text={error} />}
      <Card>
        {invoices.length === 0 && <Text style={{ color: colors.textSecondary }}>No invoices match.</Text>}
        {invoices.map((inv) => (
          <InvoiceRow key={inv.id} inv={inv} onPress={() => navigation.navigate('InvoiceDetail', { id: inv.id })} />
        ))}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: colors.background } });
