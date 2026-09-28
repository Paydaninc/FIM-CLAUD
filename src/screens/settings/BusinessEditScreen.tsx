import React, { useState } from 'react';
import { ScrollView, Image, View, Text, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '@/context/AuthContext';
import { updateBusinessProfile } from '@/api/endpoints';
import { isDemoMode } from '@/api/client';
import { FormInput, Button, ErrorText } from '@/components/Form';
import { errorMessage } from '@/components/ui';
import { colors, spacing } from '@/theme';

/** Edits the business profile, including an optional logo that then shows on the invoice
 *  detail screen and in Settings. The logo is stored as a data URI on the business record —
 *  fine for a photo-library picture, no separate file upload endpoint needed. */
export default function BusinessEditScreen({ navigation }: any) {
  const { business, refresh } = useAuth();
  const [f, setF] = useState({
    business_name: business?.business_name || '',
    address_line1: business?.address_line1 || '',
    city: business?.city || '',
    state: business?.state || '',
    postal_code: business?.postal_code || '',
    phone: business?.phone || '',
    email: business?.email || '',
    default_tax_rate: business?.default_tax_rate != null ? String(business.default_tax_rate) : '',
    default_payment_terms: business?.default_payment_terms || '',
  });
  const [logo, setLogo] = useState<string | null>(business?.logo_url || null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });

  const pickLogo = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Allow photo access to add a logo.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.5,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!result.canceled && result.assets?.[0]?.base64) {
      const mime = result.assets[0].mimeType || 'image/jpeg';
      setLogo(`data:${mime};base64,${result.assets[0].base64}`);
    }
  };

  const save = async () => {
    setError(null);
    if (!f.business_name.trim()) { setError('Business name is required.'); return; }
    setSaving(true);
    try {
      await updateBusinessProfile({
        ...f,
        default_tax_rate: (f.default_tax_rate || '0') as any,
        logo_url: logo,
      });
      await refresh();
      navigation.goBack();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.md }} keyboardShouldPersistTaps="handled">
      {isDemoMode() && <Text style={styles.demoNote}>Demo mode — changes here aren't saved to a server.</Text>}

      <TouchableOpacity onPress={pickLogo} style={styles.logoBox}>
        {logo ? (
          <Image source={{ uri: logo }} style={styles.logoImg} resizeMode="contain" />
        ) : (
          <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center' }}>+ Add logo</Text>
        )}
      </TouchableOpacity>
      {logo && (
        <TouchableOpacity onPress={() => setLogo(null)} style={{ alignSelf: 'center', marginBottom: spacing.lg }}>
          <Text style={{ color: colors.danger, fontSize: 13 }}>Remove logo</Text>
        </TouchableOpacity>
      )}

      <FormInput label="Business name" value={f.business_name} onChangeText={set('business_name')} autoCapitalize="words" />
      <FormInput label="Address" value={f.address_line1} onChangeText={set('address_line1')} autoCapitalize="words" />
      <FormInput label="City" value={f.city} onChangeText={set('city')} autoCapitalize="words" />
      <FormInput label="State" value={f.state} onChangeText={set('state')} autoCapitalize="characters" maxLength={2} />
      <FormInput label="ZIP" value={f.postal_code} onChangeText={set('postal_code')} keyboardType="number-pad" />
      <FormInput label="Phone" value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
      <FormInput label="Email" value={f.email} onChangeText={set('email')} keyboardType="email-address" />
      <FormInput label="Default tax rate (%)" value={f.default_tax_rate} onChangeText={set('default_tax_rate')} keyboardType="decimal-pad" />
      <FormInput label="Default payment terms" value={f.default_payment_terms} onChangeText={set('default_payment_terms')} placeholder="Net 15" />

      <ErrorText message={error} />
      <Button title="Save" onPress={save} loading={saving} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  demoNote: { color: colors.textSecondary, fontSize: 12, textAlign: 'center', marginBottom: spacing.md },
  logoBox: {
    width: 96, height: 96, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1,
    borderColor: colors.border, alignItems: 'center', justifyContent: 'center', alignSelf: 'center',
    marginBottom: spacing.sm, overflow: 'hidden',
  },
  logoImg: { width: 96, height: 96 },
});
