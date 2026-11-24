import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import Constants from 'expo-constants';

WebBrowser.maybeCompleteAuthSession();

export interface SafeGoogleAuthResult {
  success: boolean;
  email?: string;
  fullName?: string;
  userId?: string;
  error?: string;
}

function buildSafeRedirectUri(scheme = 'picktimebook', path = 'auth/callback'): string {
  try {
    const cleanPath = path.replace(/^\/+/, '');
    if (Constants.appOwnership === 'expo') {
      return Linking.createURL(cleanPath);
    }
    return `${scheme}://${cleanPath}`;
  } catch (_err) {
    const cleanPath = path.replace(/^\/+/, '');
    return `${scheme}://${cleanPath}`;
  }
}

/**
 * Abre el flujo OAuth de Google con Supabase via WebBrowser sin requerir 'expo-auth-session'
 * ni disparar NativeEventEmitter en iOS.
 */
export async function signInWithGoogleViaSupabaseUrl(opts: {
  supabaseUrl: string;
  scheme?: string;
  path?: string;
}): Promise<SafeGoogleAuthResult> {
  try {
    const cleanSupabaseUrl = String(opts?.supabaseUrl || '').trim().replace(/\/+$/, '');
    if (!cleanSupabaseUrl) {
      return { success: false, error: 'Falta la URL de Supabase para Google OAuth.' };
    }

    const redirectTo = buildSafeRedirectUri(
      opts?.scheme || 'picktimebook',
      opts?.path || 'auth/callback'
    );

    const authUrl = `${cleanSupabaseUrl}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectTo)}`;
    const authResult = await WebBrowser.openAuthSessionAsync(authUrl, redirectTo);

    if (authResult.type !== 'success' || !authResult.url) {
      return {
        success: false,
        error: authResult.type === 'cancel' ? 'Inicio de sesión cancelado.' : 'No se completó el retorno desde Google.',
      };
    }

    const returnedUrl = authResult.url;
    const hashPart = returnedUrl.includes('#') ? returnedUrl.split('#')[1] : '';
    const queryPart = returnedUrl.includes('?') ? returnedUrl.split('?')[1].split('#')[0] : '';
    const params = new URLSearchParams(hashPart || queryPart);

    const accessToken = params.get('access_token');
    const errorDesc = params.get('error_description') || params.get('error');

    if (errorDesc) {
      return { success: false, error: decodeURIComponent(errorDesc) };
    }

    if (!accessToken && !params.get('code')) {
      return { success: false, error: 'Google no devolvió tokens de sesión en la URL de retorno.' };
    }

    let email = '';
    let fullName = 'Cliente Google';
    let userId = '';

    if (accessToken && accessToken.split('.').length === 3) {
      try {
        const base64Url = accessToken.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(
          atob(base64)
            .split('')
            .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
            .join('')
        );
        const decoded = JSON.parse(jsonPayload);
        userId = String(decoded?.sub || '');
        email = String(decoded?.email || '').trim().toLowerCase();
        fullName = String(
          decoded?.user_metadata?.full_name ||
          decoded?.user_metadata?.name ||
          (email ? email.split('@')[0] : 'Cliente Google')
        ).trim();
      } catch (_jwtErr) {}
    }

    return {
      success: true,
      email,
      fullName,
      userId,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Error inesperado durante el inicio de sesión con Google.',
    };
  }
}

/**
 * Obtiene un ExpoPushToken real de forma segura evitando PushNotificationIOS en Expo Go iOS.
 */
export async function getSafeExpoPushToken(): Promise<string | null> {
  try {
    const isExpoGo = Constants.appOwnership === 'expo';
    if (Platform.OS === 'ios' && isExpoGo) {
      return null;
    }

    const Notifications = await import('expo-notifications');
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      return null;
    }

    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ||
      Constants?.easConfig?.projectId ||
      undefined;

    const tokenRes = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    const token = String(tokenRes?.data || '').trim();
    return token.startsWith('ExponentPushToken[') ? token : null;
  } catch (_err) {
    return null;
  }
}
