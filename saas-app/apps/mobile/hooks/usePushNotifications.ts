import { useEffect, useCallback } from 'react';
import { Platform, AppState } from 'react-native';
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

  // Sincroniza el globo rojo del icono de la app con el total real de no leídas en BD
  const syncAppIconBadge = useCallback(async () => {
    if (Platform.OS === 'web') return;
    try {
      const apiBase = params.apiUrl.replace(/\/$/, '');
      const isBusiness = params.role === 'tenant_owner' || params.role === 'staff';
      let unreadCount = 0;

      if (isBusiness && params.tenantId) {
        const res = await fetch(
          `${apiBase}/api/notifications?role=business&tenantId=${encodeURIComponent(params.tenantId)}`
        );
        if (res.ok) {
          const json = await res.json();
          const list = Array.isArray(json?.notifications) ? json.notifications : [];
          unreadCount = list.filter((n: any) => !(n.isRead ?? n.is_read)).length;
        }
      } else if (params.userId) {
        const res = await fetch(
          `${apiBase}/api/notifications?role=client&userId=${encodeURIComponent(params.userId)}`
        );
        if (res.ok) {
          const json = await res.json();
          const list = Array.isArray(json?.notifications) ? json.notifications : [];
          unreadCount = list.filter((n: any) => !(n.isRead ?? n.is_read)).length;
        }
      }

      await Notifications.setBadgeCountAsync(unreadCount);
    } catch (_err) {}
  }, [params.apiUrl, params.userId, params.tenantId, params.role]);

  // 1. Solicitar permisos (incluyendo allowBadge en iOS y showBadge en Android) y registrar token
  useEffect(() => {
    if (Platform.OS === 'web' || !Constants.isDevice) return;

    const register = async () => {
      try {
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.MAX,
            showBadge: true,
          });
        }

        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync({
            ios: {
              allowAlert: true,
              allowBadge: true,
              allowSound: true,
            },
          });
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

        await syncAppIconBadge();
      } catch (err) {
        console.warn('No se pudo registrar push token:', err);
      }
    };

    register();
  }, [
    params.apiUrl,
    params.userId,
    params.tenantId,
    params.role,
    params.zipCode,
    params.latitude,
    params.longitude,
    syncAppIconBadge,
  ]);

  // 2. Actualizar el contador del icono al volver a abrir la app desde segundo plano
  useEffect(() => {
    if (Platform.OS === 'web') return;
    syncAppIconBadge();

    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        syncAppIconBadge();
      }
    });
    return () => sub.remove();
  }, [syncAppIconBadge]);

  // 3. Actualizar badge al recibir push en primer plano y navegar al tocar la notificación
  useEffect(() => {
    if (Platform.OS === 'web') return;

    const recvSub = Notifications.addNotificationReceivedListener(() => {
      syncAppIconBadge();
    });

    const respSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as any;
      syncAppIconBadge();
      if (data?.tenantId) {
        router.push(`/${data.tenantId}${data.view ? `?view=${data.view}` : ''}` as any);
      }
    });

    return () => {
      recvSub.remove();
      respSub.remove();
    };
  }, [router, syncAppIconBadge]);
}