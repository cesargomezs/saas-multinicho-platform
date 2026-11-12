import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Platform } from 'react-native';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <Stack 
        screenOptions={{ 
          headerShown: false, 
          contentStyle: { backgroundColor: '#05070C' },
          // 🌟 FIX: Apagamos la animación solo en web para evitar el error 'animationName'
          animation: Platform.OS === 'web' ? 'none' : 'fade'
        }} 
      />
    </SafeAreaProvider>
  );
}