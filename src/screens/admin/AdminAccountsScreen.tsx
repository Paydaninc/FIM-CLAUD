import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { listAdminAccounts, AdminAccount } from '@/api/endpoints';
import { FormInput } from '@/components/Form';
import { Card, Banner, money, shortDate, errorMessage } from '@/components/ui';
import { colors, spacing } from '@/theme';

/** Owner-only: every account that's ever signed up. */
export default function AdminAccountsScreen({ navigation }: any) {
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (q?: string) => {
    try { setAccounts((await listAdminAccounts(q)).accounts); setError(null); }
    catch (e) { setError(errorMessage(e)); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  let t: ReturnType<typeof setTimeout>;
  const onSearch = (v: string) => {
    setQuery(v);
    clearTimeout(t);
    t = setTimeout(() => load(v), 300);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.md }} keyboardShouldPersistTaps="handled">
      <FormInput placeholder="Search by email or business name" value={query} onChangeText={onSearch} autoCapitalize="none" />
      {error && <Banner tone="danger" text={error} />}
      <Card>
        {accounts.length === 0 && <Text style={{ color: colors.textSecondary }}>No accounts match.</Text>}
        {accounts.map((a) => (
          <TouchableOpacity key={a.id} style={styles.row} onPress={() => navigation.navigate('AdminAccountDetail', { userId: a.id })}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{a.business_name || 'No business yet'}</Text>
              <Text style={styles.sub}>{a.email} · {a.invoice_count} invoices · {money(a.total_paid)} paid</Text>
              <Text style={styles.sub}>Joined {shortDate(a.created_at)}{a.charges_enabled ? ' · Stripe connected' : ''}</Text>
            </View>
            <View style={[styles.badge, a.is_active ? styles.badgeActive : styles.badgeInactive]}>
              <Text style={[styles.badgeText, { color: a.is_active ? colors.success : colors.danger }]}>
                {a.is_active ? 'Active' : 'Deactivated'}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  row: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  name: { fontSize: 15, fontWeight: '600', color: colors.text },
  sub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  badgeActive: { backgroundColor: '#E1F5EE' },
  badgeInactive: { backgroundColor: '#FCEBEB' },
  badgeText: { fontSize: 12, fontWeight: '600' },
});
