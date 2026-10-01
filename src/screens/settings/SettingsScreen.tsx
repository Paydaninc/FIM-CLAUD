import React, { useState } from 'react';
import { View, Text, Image, ScrollView, StyleSheet } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { isDemoMode } from '@/api/client';
import { bootstrapAdmin } from '@/api/endpoints';
import { Button, ErrorText } from '@/components/Form';
import ServerSettings from '@/components/ServerSettings';
import { Card, Banner, Row, SectionTitle, errorMessage } from '@/components/ui';
import { colors, spacing } from '@/theme';

export default function SettingsScreen({ navigation }: any) {
  const { user, business, stripeStatus, refresh, logout } = useAuth();
  const [checking, setChecking] = useState(false);
  const [claimingAdmin, setClaimingAdmin] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);

  const claimAdmin = async () => {
    setClaimingAdmin(true); setAdminError(null);
    try { await bootstrapAdmin(); await refresh(); }
    catch (e) { setAdminError(errorMessage(e)); }
    finally { setClaimingAdmin(false); }
  };
  const stripeReady = !!stripeStatus?.readyForPayments;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.md }} keyboardShouldPersistTaps="handled">
      {isDemoMode() && <Banner tone="info" text="You're in demo mode — everything here is sample data and nothing is saved to a server." />}

      <SectionTitle>Business</SectionTitle>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {business?.logo_url ? (
            <Image source={{ uri: business.logo_url }} style={styles.logo} resizeMode="contain" />
          ) : null}
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>{business?.business_name}</Text>
            <Text style={{ color: colors.textSecondary, marginTop: 2 }}>{[business?.address_line1, business?.city, business?.state].filter(Boolean).join(', ')}</Text>
          </View>
        </View>
        <Row left="Default tax rate" right={`${business?.default_tax_rate ?? 0}%`} />
        <Row left="Payment terms" right={business?.default_payment_terms || '—'} />
        <Button title="Edit business info" variant="secondary" onPress={() => navigation.navigate('BusinessEdit')} />
      </Card>

      <SectionTitle>Stripe</SectionTitle>
      <Card>
        <Row left="Status" right={stripeReady ? 'Connected' : 'Not connected'} />
        <Row left="Charges" right={stripeStatus?.chargesEnabled ? 'Enabled' : 'Not enabled'} />
        <Row left="Payouts" right={stripeStatus?.payoutsEnabled ? 'Enabled' : 'Not enabled'} />
        <Row left="Platform fee" right="1% per card/bank payment" />
        {!stripeReady && (
          <Banner tone="warning" text="Card, bank, payment-link, and Tap to Pay all need Stripe connected. Cash works without it." />
        )}
        <Button
          title={stripeReady ? 'Manage Stripe connection' : 'Connect Stripe'}
          onPress={() => navigation.navigate('StripeConnect')}
        />
        <Button title="Refresh Stripe status" variant="secondary" loading={checking} onPress={async () => { setChecking(true); await refresh(); setChecking(false); }} />
      </Card>

      <SectionTitle>Account</SectionTitle>
      <Card><Text style={{ color: colors.text }}>{user?.email}</Text></Card>

      {!isDemoMode() && user?.is_admin && (
        <>
          <SectionTitle>Admin</SectionTitle>
          <Card>
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: spacing.sm }}>
              View every account, edit a business for support, or deactivate access.
            </Text>
            <Button title="Admin accounts" onPress={() => navigation.navigate('AdminAccounts')} />
          </Card>
        </>
      )}

      {!isDemoMode() && !user?.is_admin && (
        <>
          <SectionTitle>Admin</SectionTitle>
          <Card>
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: spacing.sm }}>
              If no admin exists yet, you can claim the owner role here. This only works once.
            </Text>
            <ErrorText message={adminError} />
            <Button title="Become admin" variant="secondary" onPress={claimAdmin} loading={claimingAdmin} />
          </Card>
        </>
      )}

      {!isDemoMode() && (
        <>
          <SectionTitle>Server</SectionTitle>
          <Card><ServerSettings /></Card>
        </>
      )}
      <View style={{ height: spacing.sm }} />
      <Button title={isDemoMode() ? 'Exit demo' : 'Log out'} variant="danger" onPress={logout} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  logo: { width: 48, height: 48, marginRight: spacing.md, borderRadius: 8 },
});
