import React, { useState } from 'react';
import { ScrollView, Text, StyleSheet } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { createBusiness } from '@/api/endpoints';
import { FormInput, Button, ErrorText } from '@/components/Form';
import { colors, spacing, typography } from '@/theme';
import { ApiError } from '@/api/client';

/**
 * Onboarding step 2 (per your spec's exact order): business name, address,
 * phone, email, default tax rate, default payment terms — appears on every
 * invoice. Step 3 (Stripe connection) only becomes reachable once this
 * completes, since RootNavigator gates on `business` being non-null.
 */
export default function BusinessProfileScreen() {
  const { refresh } = useAuth();
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [defaultTaxRate, setDefaultTaxRate] = useState('');
  const [defaultPaymentTerms, setDefaultPaymentTerms] = useState('Due on receipt');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    if (!businessName.trim()) {
      setError('Business name is required.');
      return;
    }
    setLoading(true);
    try {
      await createBusiness({
        business_name: businessName.trim(),
        email: email || undefined,
        phone: phone || undefined,
        address_line1: addressLine1 || undefined,
        city: city || undefined,
        state: state || undefined,
        postal_code: postalCode || undefined,
        country: 'US',
        default_tax_rate: defaultTaxRate ? Number(defaultTaxRate) : 0,
        default_payment_terms: defaultPaymentTerms || undefined,
      });
      await refresh(); // RootNavigator moves to the Stripe Connect step automatically
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Can't reach the server. Check your connection or server settings and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Tell us about your business</Text>
      <Text style={styles.subtitle}>This appears on every invoice you send.</Text>

      <FormInput label="Business name" value={businessName} onChangeText={setBusinessName} placeholder="Jane's Landscaping" />
      <FormInput label="Business email" value={email} onChangeText={setEmail} keyboardType="email-address" placeholder="jane@example.com" />
      <FormInput label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="(555) 555-0100" />
      <FormInput label="Address" value={addressLine1} onChangeText={setAddressLine1} placeholder="123 Main St" />
      <FormInput label="City" value={city} onChangeText={setCity} placeholder="Springfield" />
      <FormInput label="State" value={state} onChangeText={setState} placeholder="CA" autoCapitalize="characters" maxLength={2} />
      <FormInput label="ZIP code" value={postalCode} onChangeText={setPostalCode} keyboardType="number-pad" placeholder="94103" />
      <FormInput
        label="Default tax rate (%)"
        value={defaultTaxRate}
        onChangeText={setDefaultTaxRate}
        keyboardType="decimal-pad"
        placeholder="8.75"
      />
      <FormInput
        label="Default payment terms"
        value={defaultPaymentTerms}
        onChangeText={setDefaultPaymentTerms}
        placeholder="Due on receipt"
      />

      <ErrorText message={error} />
      <Button title="Continue" onPress={handleSubmit} loading={loading} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  title: { ...typography.h1, color: colors.text, marginBottom: spacing.xs },
  subtitle: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.xl },
});
