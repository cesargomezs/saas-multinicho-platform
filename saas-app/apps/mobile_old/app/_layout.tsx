// apps/mobile/app/_layout.tsx
import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#05070C' } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[tenantId]/index" />
    </Stack>
  );
}