import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { listClients, Client } from '@/api/endpoints';
import { Button, FormInput } from '@/components/Form';
import { Card, Banner, errorMessage } from '@/components/ui';
import { colors, spacing } from '@/theme';

export default function ClientListScreen({ navigation }: any) {
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setClients((await listClients(search || undefined)).clients); setError(null); }
    catch (e) { setError(errorMessage(e)); }
  }, [search]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.md }} keyboardShouldPersistTaps="handled">
      <Button title="+ Add client" onPress={() => navigation.navigate('ClientCreate')} />
      <FormInput value={search} onChangeText={setSearch} placeholder="Search clients" />
      {error && <Banner tone="danger" text={error} />}
      <Card>
        {clients.length === 0 && <Text style={{ color: colors.textSecondary }}>No clients yet.</Text>}
        {clients.map((c) => (
          <View key={c.id} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>{c.name}</Text>
            <Text style={{ fontSize: 12, color: colors.textSecondary }}>{[c.email, c.phone].filter(Boolean).join(' · ') || 'No contact info'}</Text>
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: colors.background } });
