import React, { useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, TouchableOpacity, StyleSheet } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { FormInput, Button, ErrorText } from '@/components/Form';
import { colors, spacing, typography } from '@/theme';
import { ApiError } from '@/api/client';

export default function LoginScreen({ navigation }: any) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    if (!email || !password) {
      setError('Enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      await login(email, password);
      // No manual navigation needed — RootNavigator re-renders based on
      // the auth state this just updated.
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.title}>Free Invoice Maker</Text>
      <Text style={styles.subtitle}>Log in to your account</Text>

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
        placeholder="Your password"
      />

      <ErrorText message={error} />
      <Button title="Log in" onPress={handleSubmit} loading={loading} />

      <TouchableOpacity onPress={() => navigation.navigate('Signup')} style={{ marginTop: spacing.md }}>
        <Text style={styles.link}>Don't have an account? Sign up</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg, justifyContent: 'center' },
  title: { ...typography.h1, color: colors.text, textAlign: 'center', marginBottom: spacing.xs },
  subtitle: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xl },
  link: { color: colors.accent, textAlign: 'center', fontSize: 14 },
});
