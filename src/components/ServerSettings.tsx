import React, { useEffect, useState } from 'react';
import { View, Text, Alert } from 'react-native';
import { getBaseUrl, setBaseUrl } from '@/api/client';
import { FormInput, Button } from '@/components/Form';
import { colors } from '@/theme';

/** Lets you point the app at any backend URL without rebuilding it. */
export default function ServerSettings() {
  const [url, setUrl] = useState('');
  useEffect(() => { getBaseUrl().then(setUrl); }, []);
  return (
    <View>
      <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 8 }}>
        The address of your Free Invoice Maker backend, e.g. https://api.yourdomain.com or
        http://192.168.1.42:4000 (your PC's IP on the same Wi-Fi).
      </Text>
      <FormInput label="Server URL" value={url} onChangeText={setUrl} keyboardType="url" placeholder="https://..." />
      <Button
        title="Save server URL"
        variant="secondary"
        onPress={async () => { await setBaseUrl(url); Alert.alert('Saved', 'Server URL updated.'); }}
      />
    </View>
  );
}
