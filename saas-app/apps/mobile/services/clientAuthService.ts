import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';

export type ClientAuthProvider = 'apple' | 'google' | 'manual';

export interface AuthenticateClientDbParams {
  apiFetch: (url: string, options?: RequestInit) => Promise<Response>;
  provider: ClientAuthProvider;
  email?: string;
  password?: string;
  appleUserId?: string;
  fullName?: string;
  setPasswordIfEmpty?: boolean;
  fallbackError?: string;
  networkError?: string;
}

export interface AuthenticateClientDbResponse {
  ok: boolean;
  notRegistered?: boolean;
  needsPasswordSetup?: boolean;
  error?: string;
  data?: any;
}

export async function authenticateClientAgainstDb(
  params: AuthenticateClientDbParams
): Promise<AuthenticateClientDbResponse> {
  const {
    apiFetch,
    provider,
    email,
    password,
    appleUserId,
    fullName,
    setPasswordIfEmpty,
    fallbackError = 'No se pudo validar tu cuenta.',
    networkError = 'Error de conexión con el servidor al validar usuario.',
  } = params;

  try {
    const res = await apiFetch('/api/clients/auth', {
      method: 'POST',
      body: JSON.stringify({
        provider,
        email,
        password,
        appleUserId,
        fullName,
        setPasswordIfEmpty,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success && data.client) {
      return { ok: true, data };
    }
    return {
      ok: false,
      notRegistered: Boolean(data?.notRegistered),
      needsPasswordSetup: Boolean(data?.needsPasswordSetup),
      error: data?.error || fallbackError,
    };
  } catch (_err) {
    return { ok: false, error: networkError };
  }
}

export async function signInWithAppleAccount(): Promise<{
  fullName: string;
  email: string;
  appleUserId: string;
}> {
  if (Platform.OS !== 'ios') {
    throw new Error('APPLE_IOS_ONLY');
  }
  const available = await AppleAuthentication.isAvailableAsync();
  if (!available) {
    throw new Error('APPLE_NOT_AVAILABLE');
  }

  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });

  const fullName = [credential?.fullName?.givenName, credential?.fullName?.familyName]
    .filter(Boolean)
    .join(' ')
    .trim();
  const email = (credential?.email || '').trim().toLowerCase();
  const appleUserId = (credential?.user || '').trim();

  return { fullName, email, appleUserId };
}

export async function signInWithGoogleAccount(params: {
  supabaseClient: any;
  webRedirectUrl: string;
  nativeRedirectUrl?: string;
}): Promise<{ email: string; fullName: string } | null> {
  const {
    supabaseClient,
    webRedirectUrl,
    nativeRedirectUrl = 'picktimebook://auth/callback',
  } = params;

  const isWeb = Platform.OS === 'web' && typeof window !== 'undefined';
  const redirectTo = isWeb ? webRedirectUrl : nativeRedirectUrl;

  const { data, error } = await supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: !isWeb,
      queryParams: { prompt: 'select_account' },
    },
  });

  if (error) {
    throw error;
  }

  if (!isWeb && data?.url) {
    const authResult = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (authResult.type === 'success' && authResult.url) {
      const parsedUrl = new URL(authResult.url);
      const hashParams = new URLSearchParams(
        parsedUrl.hash ? parsedUrl.hash.replace(/^#/, '') : ''
      );
      const accessToken =
        parsedUrl.searchParams.get('access_token') || hashParams.get('access_token');
      const refreshToken =
        parsedUrl.searchParams.get('refresh_token') || hashParams.get('refresh_token');
      const authCode = parsedUrl.searchParams.get('code');

      let googleUser: any = null;
      if (accessToken && refreshToken) {
        const { data: sessData } = await supabaseClient.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        googleUser = sessData?.user || null;
      } else if (authCode) {
        const { data: exchData } = await supabaseClient.auth.exchangeCodeForSession(authCode);
        googleUser = exchData?.user || null;
      }

      if (!googleUser) {
        const { data: userData } = await supabaseClient.auth.getUser();
        googleUser = userData?.user || null;
      }

      const gEmail = String(googleUser?.email || '').trim().toLowerCase();
      const gFullName = String(
        googleUser?.user_metadata?.full_name ||
          googleUser?.user_metadata?.name ||
          (gEmail ? gEmail.split('@')[0].replace(/[._-]+/g, ' ') : '')
      ).trim();

      return { email: gEmail, fullName: gFullName };
    }
    return null;
  }

  return null;
}
