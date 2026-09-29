import React, { useState } from 'react';
import { Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { FormInput, Button, ErrorText } from '@/components/Form';
import { colors, spacing, typography } from '@/theme';
import { ApiError } from '@/api/client';

export default function SignupScreen({ navigation }: any) {
  const { signup, enterDemo } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    if (!email || !password) {
      setError('Enter an email and password.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    try {
      await signup(email, password);
      // RootNavigator will move to onboarding automatically once `business`
      // comes back null from the post-signup refresh.
    } catch (err) {
      // A network failure (no backend reachable) throws a plain Error, not an ApiError —
      // that's the most common cause here, so say so plainly instead of a bare "went wrong".
      setError(
        err instanceof ApiError
          ? err.message
          : "Can't reach the server. If no backend is set up yet, try demo mode below instead."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.lg, flexGrow: 1, justifyContent: 'center' }} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Create your account</Text>
      <Text style={styles.subtitle}>Start invoicing in a couple of minutes</Text>

      <FormInput
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        placeholder="you@example.com"
      />
      <FormInput
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholder="At least 8 characters"
      />

      <ErrorText message={error} />
      <Button title="Sign up" onPress={handleSubmit} loading={loading} />
      <Button title="Explore the app in demo mode" variant="secondary" onPress={enterDemo} />

      <TouchableOpacity onPress={() => navigation.navigate('Login')} style={{ marginTop: spacing.md }}>
        <Text style={styles.link}>Already have an account? Log in</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  title: { ...typography.h1, color: colors.text, textAlign: 'center', marginBottom: spacing.xs },
  subtitle: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xl },
  link: { color: colors.accent, textAlign: 'center', fontSize: 14 },
});
