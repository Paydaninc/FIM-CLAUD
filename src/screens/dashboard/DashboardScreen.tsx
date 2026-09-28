import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getDashboard, DashboardSummary } from '@/api/endpoints';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/Form';
import { Card, Banner, InvoiceRow, SectionTitle, money, errorMessage } from '@/components/ui';
import { colors, spacing, typography } from '@/theme';

export default function DashboardScreen({ navigation }: any) {
  const { business } = useAuth();
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setData(await getDashboard()); setError(null); }
    catch (e) { setError(errorMessage(e)); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const c = data?.invoiceSummary.counts;
  const open = c ? c.sent + c.viewed + c.processing + c.overdue : 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: spacing.md }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      <Text style={styles.biz}>{business?.business_name}</Text>
      {error && <Banner tone="danger" text={error} />}
      {data && !data.stripeStatus.readyForPayments && (
        <Banner tone="warning" text="Finish connecting Stripe to collect card and bank payments." />
      )}

      <Button title="+ Create invoice" onPress={() => navigation.navigate('InvoiceCreate')} />

      <View style={{ flexDirection: 'row', marginTop: spacing.sm }}>
        <Card style={{ flex: 1, marginRight: 8 }}>
          <Text style={styles.statLabel}>Outstanding</Text>
          <Text style={styles.statValue}>{money(data?.invoiceSummary.totalOutstanding)}</Text>
          <Text style={styles.statSub}>{open} open</Text>
        </Card>
        <Card style={{ flex: 1, marginLeft: 8 }}>
          <Text style={styles.statLabel}>Paid</Text>
          <Text style={[styles.statValue, { color: colors.success }]}>{money(data?.invoiceSummary.totalPaid)}</Text>
          <Text style={styles.statSub}>{c?.paid ?? 0} invoices</Text>
        </Card>
      </View>

      {c && c.overdue > 0 && <Banner tone="warning" text={`${c.overdue} overdue invoice${c.overdue > 1 ? 's' : ''} need attention.`} />}

      <SectionTitle>Recent invoices</SectionTitle>
      <Card>
        {data?.recentInvoices.length === 0 && <Text style={{ color: colors.textSecondary }}>No invoices yet — create your first one.</Text>}
        {data?.recentInvoices.map((inv) => (
          <InvoiceRow key={inv.id} inv={inv} onPress={() => navigation.navigate('InvoiceDetail', { id: inv.id })} />
        ))}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  biz: { ...typography.h1, color: colors.text, marginBottom: spacing.md },
  statLabel: { ...typography.caption, color: colors.textSecondary },
  statValue: { fontSize: 22, fontWeight: '700', color: colors.text, marginVertical: 2 },
  statSub: { ...typography.caption, color: colors.textSecondary },
});
