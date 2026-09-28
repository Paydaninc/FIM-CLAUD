import React, { useState } from 'react';
import { Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { FormInput, Button, ErrorText } from '@/components/Form';
import ServerSettings from '@/components/ServerSettings';
import { errorMessage } from '@/components/ui';
import { colors, spacing, typography } from '@/theme';

export default function LoginScreen({ navigation }: any) {
  const { login, enterDemo } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showServer, setShowServer] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    if (!email || !password) { setError('Enter your email and password.'); return; }
    setLoading(true);
    try { await login(email, password); }
    catch (err) { setError(errorMessage(err)); }
    finally { setLoading(false); }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.lg, flexGrow: 1, justifyContent: 'center' }} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Free Invoice Maker</Text>
      <Text style={styles.subtitle}>Log in to your account</Text>

      <FormInput label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" placeholder="you@example.com" />
      <FormInput label="Password" value={password} onChangeText={setPassword} secureTextEntry placeholder="Your password" />
      <ErrorText message={error} />
      <Button title="Log in" onPress={handleSubmit} loading={loading} />
      <Button title="Explore the app in demo mode" variant="secondary" onPress={enterDemo} />

      <TouchableOpacity onPress={() => navigation.navigate('Signup')} style={{ marginTop: spacing.md }}>
        <Text style={styles.link}>Don't have an account? Sign up</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setShowServer(!showServer)} style={{ marginTop: spacing.lg }}>
        <Text style={[styles.link, { color: colors.textSecondary }]}>{showServer ? 'Hide server settings' : 'Server settings'}</Text>
      </TouchableOpacity>
      {showServer && <ServerSettings />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  title: { ...typography.h1, color: colors.text, textAlign: 'center', marginBottom: spacing.xs },
  subtitle: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xl },
  link: { color: colors.accent, textAlign: 'center', fontSize: 14 },
});
