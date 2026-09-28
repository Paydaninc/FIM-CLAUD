import React, { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { createClient } from '@/api/endpoints';
import { FormInput, Button, ErrorText } from '@/components/Form';
import { errorMessage } from '@/components/ui';
import { colors, spacing } from '@/theme';

export default function ClientCreateScreen({ navigation }: any) {
  const [f, setF] = useState({ name: '', email: '', phone: '', address_line1: '', city: '', state: '', postal_code: '' });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });

  const save = async () => {
    setError(null);
    if (!f.name.trim()) { setError('Client name is required.'); return; }
    setSaving(true);
    try {
      const body: any = {};
      Object.entries(f).forEach(([k, v]) => { if (v.trim()) body[k] = v.trim(); });
      await createClient(body);
      navigation.goBack();
    } catch (e) { setError(errorMessage(e)); }
    finally { setSaving(false); }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.md }} keyboardShouldPersistTaps="handled">
      <FormInput label="Name" value={f.name} onChangeText={set('name')} autoCapitalize="words" placeholder="Acme Co" />
      <FormInput label="Email" value={f.email} onChangeText={set('email')} keyboardType="email-address" placeholder="billing@acme.com" />
      <FormInput label="Phone" value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
      <FormInput label="Address" value={f.address_line1} onChangeText={set('address_line1')} autoCapitalize="words" />
      <FormInput label="City" value={f.city} onChangeText={set('city')} autoCapitalize="words" />
      <FormInput label="State" value={f.state} onChangeText={set('state')} autoCapitalize="characters" maxLength={2} />
      <FormInput label="ZIP" value={f.postal_code} onChangeText={set('postal_code')} keyboardType="number-pad" />
      <ErrorText message={error} />
      <Button title="Save client" onPress={save} loading={saving} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: colors.background } });
