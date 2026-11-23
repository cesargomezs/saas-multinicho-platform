import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export function usePushNotifications(params: {
  apiUrl: string;
  userId?: string | null;
  tenantId?: string | null;
  role?: 'client' | 'tenant_owner' | 'staff';
  zipCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}) {
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS === 'web' || !Device.isDevice) return;

    const register = async () => {
      try {
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.MAX,
          });
        }

        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        if (finalStatus !== 'granted') return;

        const projectId =
          Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
        const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });

        await fetch(`${params.apiUrl.replace(/\/$/, '')}/api/push-tokens/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            expoPushToken: tokenData.data,
            userId: params.userId || null,
            tenantId: params.tenantId || null,
            role: params.role || 'client',
            zipCode: params.zipCode || null,
            latitude: params.latitude ?? null,
            longitude: params.longitude ?? null,
          }),
        });
      } catch (err) {
        console.warn('No se pudo registrar push token:', err);
      }
    };

    register();
  }, [params.userId, params.tenantId, params.role, params.zipCode, params.latitude, params.longitude]);

  // Navegar directo al negocio o al portal interno cuando el usuario toca la notificación
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as any;
      if (data?.tenantId) {
        router.push(`/${data.tenantId}${data.view ? `?view=${data.view}` : ''}` as any);
      }
    });
    return () => sub.remove();
  }, [router]);
}