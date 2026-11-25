'use client';
import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, Platform, useWindowDimensions, Image, StatusBar, Modal, ActivityIndicator, Share, Linking, Switch } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';

try { WebBrowser.maybeCompleteAuthSession(); } catch (_wbErr) {}
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { createClient } from '@supabase/supabase-js';

// ==========================================
// ⚙️ CONFIGURACIÓN DE SUPABASE
// ==========================================
export const SAFE_TOP_INSET = Platform.OS === 'ios' ? 58 : Platform.OS === 'android' ? (StatusBar.currentHeight ? StatusBar.currentHeight + 12 : 42) : 0;
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://hbofrqdubrtogwbuddsa.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'tu-anon-key';

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false },
});

// ==========================================
// 🧩 ESTILOS WEB DINÁMICOS
// ==========================================
const WebStyles = () => {
  if (Platform.OS !== 'web') return null;
  return (
    <style dangerouslySetInnerHTML={{__html: `
      body { background-color: #05070C; color: #FFFFFF; margin: 0; }
      * { font-family: 'Inter', system-ui, sans-serif; box-sizing: border-box; }
      .web-input-override { height: 56px !important; background-color: rgba(0, 0, 0, 0.4) !important; border: 1px solid rgba(255,255,255,0.08) !important; color: #FFFFFF !important; border-radius: 12px !important; padding: 0 16px !important; font-size: 15px !important; outline: none !important; width: 100% !important; color-scheme: dark !important; transition: border-color 0.2s ease; }
      .web-input-override:focus { border-color: #FF5E00 !important; }
      .web-input-override option { background-color: #12161C !important; color: #FFFFFF !important; }
      .pricing-card { transition: all 0.3s ease; cursor: pointer; }
      .pricing-card:hover { transform: translateY(-8px); border-color: rgba(255, 94, 0, 0.5) !important; box-shadow: 0 15px 35px -10px rgba(255, 94, 0, 0.2); }
      .pricing-card.selected { border-color: #FF5E00 !important; background-color: rgba(255, 94, 0, 0.05) !important; box-shadow: 0 0 0 2px #FF5E00 !important; }
      .color-swatch { transition: transform 0.2s ease; cursor: pointer; }
      .color-swatch:hover { transform: scale(1.1); }
    `}} />
  );
};


const ProIconBox = ({ 
  family = 'Feather', 
  name, 
  color = '#FF5E00', 
  size = 20, 
  boxSize = 44 
}: { 
  family?: 'Feather' | 'Ionicons' | 'MCI', 
  name: string, 
  color?: string, 
  size?: number, 
  boxSize?: number 
}) => (
  <View style={{
    width: boxSize,
    height: boxSize,
    borderRadius: Math.round(boxSize * 0.28),
    backgroundColor: `${color}18`,
    borderWidth: 1,
    borderColor: `${color}40`,
    alignItems: 'center',
    justifyContent: 'center',
  }}>
    {family === 'Feather' && <Feather name={name as any} size={size} color={color} />}
    {family === 'Ionicons' && <Ionicons name={name as any} size={size} color={color} />}
    {family === 'MCI' && <MaterialCommunityIcons name={name as any} size={size} color={color} />}
  </View>
);

const toTitleCase = (str: string) => (str ? String(str).toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase()) : '');

export default function B2BRegistrationScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width <= 850;

  const [isStarted, setIsStarted] = useState(false);
  const [showOwnerLoginCard, setShowOwnerLoginCard] = useState(false);

  const goToDirectory = () => {
    setIsStarted(false);
    setShowOwnerLoginCard(false);
    setMyOwnedTenants([]);
    setVerifiedOwnerEmail('');
    setShowPromoAdminPanel(false);

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.href = '/';
      return;
    }

    try {
      router.replace('/' as any);
      return;
    } catch (_e) {}

    try {
      router.push('/' as any);
    } catch (_err) {}
  };

  const handleCloseScreen = () => {
    if (isStarted) {
      setIsStarted(false);
      return;
    }
    if (showOwnerLoginCard) {
      setShowOwnerLoginCard(false);
      setMyOwnedTenants([]);
      setVerifiedOwnerEmail('');
      setShowPromoAdminPanel(false);
      setPromoCodesList([]);
      return;
    }
    goToDirectory();
  };
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Estados para "Ya tengo mi Negocio" (Login de Dueño/Administrador y listado de sus negocios creados)
  const [ownerLoginEmail, setOwnerLoginEmail] = useState('');
  const [ownerLoginPassword, setOwnerLoginPassword] = useState('');
  const [showOwnerLoginPassword, setShowOwnerLoginPassword] = useState(false);
  const [isLoggingInOwner, setIsLoggingInOwner] = useState(false);
  const [myOwnedTenants, setMyOwnedTenants] = useState<any[]>([]);

  // 🎟️ Estados del Generador de Códigos Promocionales (Exclusivo para cesargomez853@gmail.com tras autenticar)
  const [verifiedOwnerEmail, setVerifiedOwnerEmail] = useState<string>('');
  const [showPromoAdminPanel, setShowPromoAdminPanel] = useState(false);
  const [promoCodesList, setPromoCodesList] = useState<any[]>([]);
  const [isLoadingPromos, setIsLoadingPromos] = useState(false);
  const [isCreatingPromo, setIsCreatingPromo] = useState(false);
  const [customPromoInput, setCustomPromoInput] = useState('');
  const [promoEntityType, setPromoEntityType] = useState<'tenant' | 'subscription'>('tenant');

  // 💳 Estados para el Paso 4: Opciones de Pago vs Cupón Promocional (`public.promo_codes`)
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'promo_code'>('promo_code');
  // 🎛️ Interruptor global controlado por SuperAdmin: prende/apaga la opción de pago con tarjeta en el Paso 4
  const [cardPaymentsEnabled, setCardPaymentsEnabled] = useState<boolean>(false);
  const [isSavingPaymentFlag, setIsSavingPaymentFlag] = useState<boolean>(false);
  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [isValidatingPromo, setIsValidatingPromo] = useState(false);
  const [validatedPromoObj, setValidatedPromoObj] = useState<any | null>(null);
  const [promoErrorMsg, setPromoErrorMsg] = useState('');

  // Paso 1: Cuenta & Seguridad
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [portalPin, setPortalPin] = useState('');
  const [showPortalPin, setShowPortalPin] = useState(false);
  const isPortalPinValid = /^\d{4,6}$/.test(portalPin.trim());

  // 🌐 Estados para Registro / Login con Apple y Google + Revelación Progresiva de Correo y Password
  const [socialAuthProvider, setSocialAuthProvider] = useState<'apple' | 'google' | null>(null);
  const [isSocialLoading, setIsSocialLoading] = useState<'apple' | 'google' | null>(null);
  const [showEmailRegisterForm, setShowEmailRegisterForm] = useState(false);
  const [showEmailLoginForm, setShowEmailLoginForm] = useState(false);

  // Reglas de seguridad en tiempo real para la contraseña del Portal Interno
  const passwordChecks = {
    minLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecial: /[^A-Za-z0-9]/.test(password),
  };
  const passwordScore = Object.values(passwordChecks).filter(Boolean).length;
  const isPasswordStrong = passwordChecks.minLength && passwordChecks.hasUppercase && passwordChecks.hasNumber && passwordChecks.hasSpecial;
  const passwordsMatch = password.length > 0 && password === confirmPassword;
  
  // Paso 2: Ubicación Real
  const [businessName, setBusinessName] = useState('');
  const [category, setCategory] = useState('');
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [dbCategories, setDbCategories] = useState<{ code: string; name: string }[]>([
    { code: 'automotive', name: 'Talleres Mecánicos y Automotriz' },
    { code: 'spa', name: 'Spas y Centros de Belleza' },
    { code: 'barbershop', name: 'Barberías y Salones Masculinos' },
    { code: 'legal', name: 'Abogados y Firmas Legales' },
    { code: 'dental', name: 'Odontología y Clínicas Dentales' },
  ]);

  useEffect(() => {
    const loadCategoriesFromDb = async () => {
      try {
        const baseHost =
          process.env.EXPO_PUBLIC_API_URL ||
          process.env.NEXT_PUBLIC_API_URL ||
          (Platform.OS === 'web' ? 'http://localhost:4000' : 'http://127.0.0.1:4000');
        const res = await fetch(`${baseHost.replace(/\/$/, '')}/api/categories`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.categories) && data.categories.length > 0) {
            setDbCategories(data.categories.filter((c: any) => c.isActive !== false));
          }
        }
      } catch (e) {}
    };
    loadCategoriesFromDb();

    const loadPlatformPaymentSetting = async () => {
      try {
        const baseHost =
          process.env.EXPO_PUBLIC_API_URL ||
          process.env.NEXT_PUBLIC_API_URL ||
          (Platform.OS === 'web' ? 'http://localhost:4000' : 'http://127.0.0.1:4000');
        const res = await fetch(`${baseHost.replace(/\/$/, '')}/api/platform-settings`);
        if (res.ok) {
          const data = await res.json();
          if (typeof data?.cardPaymentsEnabled === 'boolean') {
            setCardPaymentsEnabled(data.cardPaymentsEnabled);
            if (!data.cardPaymentsEnabled) setPaymentMethod('promo_code');
            return;
          }
        }
      } catch (_e) {}

      try {
        const { data } = await supabase
          .from('platform_settings')
          .select('value')
          .eq('key', 'card_payments_enabled')
          .maybeSingle();
        if (data && data.value !== undefined) {
          const enabled = data.value === true || data.value === 'true';
          setCardPaymentsEnabled(enabled);
          if (!enabled) setPaymentMethod('promo_code');
        }
      } catch (_sbErr) {}
    };
    loadPlatformPaymentSetting();
  }, []);

  const selectedCategoryObj = dbCategories.find((c) => c.code === category);
  const [address, setAddress] = useState('');
  const [stateCode, setStateCode] = useState('');
  const [city, setCity] = useState('');
  const [zipCode, setZipCode] = useState('');

  // Paso 3: Marca Blanca
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [primaryColor, setPrimaryColor] = useState('#FF5E00');

  const colorPalette = [
    { name: 'Naranja Pro', value: '#FF5E00' },
    { name: 'Azul Eléctrico', value: '#2563EB' },
    { name: 'Verde Esmeralda', value: '#10B981' },
    { name: 'Púrpura Royal', value: '#7C3AED' },
    { name: 'Rojo Racing', value: '#DC2626' }
  ];

  // Paso 4: Selección de Plan
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

  const plans = [
    { id: 'starter', name: 'Starter', price: '$29', desc: 'Ideal para independientes.', features: ['Catálogo Básico (10 ítems)', 'Agenda en tiempo real', 'Aparece en el Directorio Local'] },
    { id: 'pro', name: 'Profesional', price: '$79', desc: 'Para negocios en crecimiento.', features: ['Catálogo Ilimitado', 'Reportes Financieros', 'Marca Blanca Avanzada', 'Insignia Verificada'], recommended: true },
    { id: 'elite', name: 'Élite', price: '$149', desc: 'Para talleres de alto volumen.', features: ['Todo lo de Pro', 'Múltiples sucursales', 'API Privada', 'Soporte 24/7 Dedicado'] },
  ];

  // Autocompletado gratuito por ZIP (Zippopotam.us)
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');

  // Autocompletado gratuito por ZIP (Zippopotam.us) + Latitud y Longitud
  const handleZipLookup = async (text: string) => {
    const cleanZip = text.replace(/\D/g, '');
    setZipCode(cleanZip);

    if (cleanZip.length === 5) {
      try {
        const res = await fetch(`https://api.zippopotam.us/us/${cleanZip}`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.places && data.places.length > 0) {
            const place = data.places[0];
            setCity(place['place name']);
            setStateCode(place['state abbreviation']);
            if (place['latitude']) setLatitude(String(place['latitude']));
            if (place['longitude']) setLongitude(String(place['longitude']));
          }
        }
      } catch (error) {
        console.log("Error al autocompletar ZIP", error);
      }
    } else if (cleanZip.length < 5) {
      setCity('');
      setStateCode('');
      setLatitude('');
      setLongitude('');
    }
  };

  // 🌟 CONVERSIÓN A WEBP Y OBTENCIÓN DE URL PÚBLICA COMPLETA DE SUPABASE 🌟
  const convertAndUploadLogo = async (file: File): Promise<string | null> => {
    return new Promise((resolve) => {
      const reader = new FileReader(); 
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new window.Image(); 
        img.src = event.target?.result as string;
        img.onload = async () => {
          const canvas = document.createElement('canvas'); 
          let width = img.width; 
          let height = img.height;
          
          if (width > 500) { height = Math.round((height *= 500 / width)); width = 500; }
          canvas.width = width; canvas.height = height; 
          const ctx = canvas.getContext('2d'); 
          ctx?.drawImage(img, 0, 0, width, height);

          canvas.toBlob(async (blob) => {
            if (!blob) return resolve(null);
            const webpFile = new File([blob], `logo-${Date.now()}.webp`, { type: 'image/webp' });
            
            const filePath = `logos/logo-${Date.now()}.webp`;
            const { error } = await supabase.storage.from('autoflow').upload(filePath, webpFile, { upsert: true, contentType: 'image/webp' });

            if (error) {
              console.error("Error subiendo logo a Supabase:", error);
              return resolve(null);
            }

            // Obtenemos la URL pública completa para guardarla en la BD
            const { data } = supabase.storage.from('autoflow').getPublicUrl(filePath);
            resolve(data.publicUrl);
          }, 'image/webp', 0.85);
        };
      };
    });
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setLogoFile(file);
      setLogoPreview(URL.createObjectURL(file));
    }
  };

  // 🔐 Función para autenticar con Apple o Google (vía Supabase OAuth / Nativo) o continuar con correo y contraseña
  const finalizeSocialSessionInRegister = async (
    authUser: any,
    provider: 'apple' | 'google',
    mode: 'register' | 'login'
  ) => {
    const resolvedEmail = String(authUser?.email || '').trim().toLowerCase();
    if (!resolvedEmail) {
      if (mode === 'register') {
        setSocialAuthProvider(provider);
        setShowEmailRegisterForm(false);
        const autoToken = `OAuth_${provider}_2026$AutoFlow!`;
        if (!password) {
          setPassword(autoToken);
          setConfirmPassword(autoToken);
        }
      }
      alert('No se obtuvo un correo válido desde el proveedor. Escribe tu correo o usa Correo y Contraseña.');
      return;
    }

    if (mode === 'register') {
      setEmail(resolvedEmail);
      setSocialAuthProvider(provider);
      setShowEmailRegisterForm(false);
      const autoToken = `OAuth_${provider}_2026$AutoFlow!`;
      setPassword(autoToken);
      setConfirmPassword(autoToken);
      alert(`✅ Cuenta de ${provider === 'apple' ? 'Apple' : 'Google'} (${resolvedEmail}) conectada. Ahora define el PIN de 4 dígitos para tus empleados y continúa.`);
    } else {
      setOwnerLoginEmail(resolvedEmail);
      const res = await fetch(`${getApiBaseUrl()}/api/tenants/owner-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: resolvedEmail,
          oauthProvider: provider,
          password: `OAuth_${provider}_2026$AutoFlow!`,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success && Array.isArray(json.tenants)) {
        setVerifiedOwnerEmail(resolvedEmail);
        setMyOwnedTenants(json.tenants);
        if (resolvedEmail === SUPER_ADMIN_EMAIL) {
          fetchPromoCodesList(resolvedEmail);
        }
      } else {
        alert(json.message || 'No encontramos negocios asociados a ese correo.');
      }
    }
  };

  const handleSocialAuth = async (provider: 'apple' | 'google', mode: 'register' | 'login' = 'register') => {
    setIsSocialLoading(provider);
    try {
      if (provider === 'apple' && Platform.OS === 'ios') {
        try {
          const AppleAuthMod: any = require('expo-apple-authentication');
          const AppleAuth: any = AppleAuthMod?.default || AppleAuthMod;
          if (AppleAuth && typeof AppleAuth.isAvailableAsync === 'function') {
            const available = await AppleAuth.isAvailableAsync();
            if (available && typeof AppleAuth.signInAsync === 'function') {
              const credential: any = await AppleAuth.signInAsync({
                requestedScopes: [
                  AppleAuth.AppleAuthenticationScope?.FULL_NAME ?? 0,
                  AppleAuth.AppleAuthenticationScope?.EMAIL ?? 1,
                ],
              });
              const appleEmail = String(credential?.email || '').trim().toLowerCase();
              if (appleEmail) {
                await finalizeSocialSessionInRegister({ email: appleEmail }, 'apple', mode);
                return;
              }
            }
          }
        } catch (appleErr: any) {
          if (appleErr?.code === 'ERR_REQUEST_CANCELED') {
            return;
          }
        }
      }

      let redirectUrl = 'picktimebook://auth/callback';
      const isWebPlatform = (Platform.OS as string) === 'web';
      if (isWebPlatform && typeof window !== 'undefined') {
        redirectUrl = `${window.location.origin}/register`;
      } else {
        try {
          const ConstantsMod: any = require('expo-constants');
          const ConstantsObj: any = ConstantsMod?.default || ConstantsMod;
          const LinkingExpoMod: any = require('expo-linking');
          const ownership = String(ConstantsObj?.appOwnership || '').toLowerCase();
          if (ownership === 'expo' && typeof LinkingExpoMod?.createURL === 'function') {
            redirectUrl = LinkingExpoMod.createURL('auth/callback');
          } else {
            redirectUrl = 'picktimebook://auth/callback';
          }
        } catch (_redirErr) {
          redirectUrl = 'picktimebook://auth/callback';
        }
      }

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: !isWebPlatform,
          queryParams: provider === 'google' ? { prompt: 'select_account' } : undefined,
        },
      });

      if (error) {
        throw error;
      }

      if (isWebPlatform) {
        if (data?.url && typeof window !== 'undefined') {
          window.location.href = data.url;
          return;
        }
        const sessResp: any = await supabase.auth.getSession();
        const sessionEmail = sessResp?.data?.session?.user?.email;
        if (sessionEmail) {
          await finalizeSocialSessionInRegister(sessResp.data.session.user, provider, mode);
        }
        return;
      }

      if (data?.url && !isWebPlatform) {
        let finalAuthUrl = String(data.url);
        try {
          const authParsed = new URL(finalAuthUrl);
          authParsed.searchParams.set('redirect_to', redirectUrl);
          finalAuthUrl = authParsed.toString();
        } catch (_urlErr) {}

        let linkingSub: any = null;
        let capturedCallbackUrl: string | null = null;
        try {
          linkingSub = Linking.addEventListener('url', (event: { url?: string }) => {
            if (
              event?.url &&
              (event.url.includes('code=') ||
                event.url.includes('access_token=') ||
                event.url.includes('picktimebook://'))
            ) {
              capturedCallbackUrl = event.url;
              try { WebBrowser.dismissBrowser(); } catch (_dErr) {}
            }
          });
        } catch (_lErr) {}

        let authResult: any = null;
        try {
          authResult = await WebBrowser.openAuthSessionAsync(finalAuthUrl, redirectUrl);
        } finally {
          if (linkingSub && typeof linkingSub.remove === 'function') {
            try { linkingSub.remove(); } catch (_rErr) {}
          }
        }

        const effectiveUrl =
          authResult?.type === 'success' && authResult?.url
            ? authResult.url
            : capturedCallbackUrl;

        let socialUser: any = null;
        if (effectiveUrl) {
          try {
            const parsedUrl = new URL(effectiveUrl);
            const hashParams = new URLSearchParams(
              parsedUrl.hash ? parsedUrl.hash.replace(/^#/, '') : ''
            );
            const accessToken =
              parsedUrl.searchParams.get('access_token') || hashParams.get('access_token');
            const refreshToken =
              parsedUrl.searchParams.get('refresh_token') || hashParams.get('refresh_token');
            const authCode = parsedUrl.searchParams.get('code');

            if (accessToken && refreshToken) {
              const sessRes: any = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
              });
              if (sessRes?.error) throw sessRes.error;
              socialUser = sessRes?.data?.user || sessRes?.data?.session?.user || null;
            } else if (authCode) {
              const exchRes: any = await supabase.auth.exchangeCodeForSession(authCode);
              if (exchRes?.error) throw exchRes.error;
              socialUser = exchRes?.data?.user || exchRes?.data?.session?.user || null;
            }
          } catch (_cbErr) {}
        }

        if (!socialUser) {
          const fallbackSess: any = await supabase.auth.getSession();
          socialUser = fallbackSess?.data?.session?.user || null;
        }

        if (socialUser?.email) {
          await finalizeSocialSessionInRegister(socialUser, provider, mode);
          return;
        }

        if (authResult?.type === 'cancel' || authResult?.type === 'dismiss') {
          return;
        }
      }

      if (mode === 'register') {
        setSocialAuthProvider(provider);
        setShowEmailRegisterForm(false);
        const autoToken = `OAuth_${provider}_2026$AutoFlow!`;
        if (!password) {
          setPassword(autoToken);
          setConfirmPassword(autoToken);
        }
      }
    } catch (err: any) {
      const msg = err?.message || String(err || '');
      if (mode === 'register') {
        setSocialAuthProvider(provider);
        setShowEmailRegisterForm(false);
        const autoToken = `OAuth_${provider}_2026$AutoFlow!`;
        if (!password) {
          setPassword(autoToken);
          setConfirmPassword(autoToken);
        }
      }
      alert(
        `No se pudo completar la validación con ${provider === 'apple' ? 'Apple' : 'Google'}${msg ? ` (${msg})` : ''}. Puedes ingresar tu correo o continuar con Correo y Contraseña.`
      );
    } finally {
      setIsSocialLoading(null);
    }
  };

  const handleNextStep = () => {
    if (step === 1) {
      const cleanEmail = email.trim();
      if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return alert('Por favor ingresa un correo electrónico comercial válido.');
      }
      if (!socialAuthProvider) {
        if (!isPasswordStrong) {
          return alert('Tu contraseña debe tener al menos 8 caracteres, una letra mayúscula, un número y un carácter especial (ej: @, #, $, !).');
        }
        if (!passwordsMatch) {
          return alert('Las contraseñas no coinciden. Verifica la confirmación.');
        }
      }
      if (!isPortalPinValid) {
        return alert('Ingresa un Código de Acceso para Empleados de 4 a 6 dígitos numéricos (ej: 4580). Tus empleados lo usarán para ver las citas y cerrar órdenes.');
      }
    }
    if (step === 2 && (!businessName || !category || !address || !city || !zipCode || !stateCode)) return alert('Completa todos los campos de ubicación.');
    setStep(step + 1);
  };

  const getApiBaseUrl = () => {
    const raw =
      process.env.EXPO_PUBLIC_API_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      (Platform.OS === 'web' ? 'http://localhost:4000' : 'http://127.0.0.1:4000');
    return raw.replace(/\/$/, '');
  };

  const SUPER_ADMIN_EMAIL = 'cesargomez853@gmail.com';

  // 🎟️ Cargar lista de cupones desde `public.promo_codes` (Exclusivo para cesargomez853@gmail.com)
  const fetchPromoCodesList = async (emailOverride?: string) => {
    const activeEmail = (emailOverride ?? verifiedOwnerEmail).trim().toLowerCase();
    if (activeEmail !== SUPER_ADMIN_EMAIL) {
      setPromoCodesList([]);
      return;
    }
    setIsLoadingPromos(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/promo-codes?ownerEmail=${encodeURIComponent(activeEmail)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.promoCodes)) {
          setPromoCodesList(data.promoCodes);
          setIsLoadingPromos(false);
          return;
        }
      }
    } catch (_e) {}

    try {
      const { data, error } = await supabase
        .from('promo_codes')
        .select('id, code, is_used, used_by_user_id, used_for_entity_id, entity_type, created_at, used_at')
        .order('created_at', { ascending: false })
        .limit(50);
      if (!error && Array.isArray(data)) {
        setPromoCodesList(data);
      }
    } catch (_err) {}
    setIsLoadingPromos(false);
  };

  // ⚡ Generar un nuevo código promocional único en `public.promo_codes` (Exclusivo cesargomez853@gmail.com)
  const handleGeneratePromoCode = async () => {
    if (verifiedOwnerEmail.trim().toLowerCase() !== SUPER_ADMIN_EMAIL) {
      alert('Acceso denegado: Solo la cuenta maestra (cesargomez853@gmail.com) puede generar códigos promocionales.');
      return;
    }
    setIsCreatingPromo(true);
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    const finalCode = customPromoInput.trim()
      ? customPromoInput.trim().toUpperCase().replace(/\s+/g, '-')
      : `PICKTIME-${randomSuffix}`;

    try {
      let createdItem: any = null;
      try {
        const res = await fetch(`${getApiBaseUrl()}/api/promo-codes/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: finalCode,
            entity_type: promoEntityType,
            ownerEmail: ownerLoginEmail.trim().toLowerCase(),
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.promoCode) {
            createdItem = data.promoCode;
          }
        }
      } catch (_e) {}

      if (!createdItem) {
        const { data, error } = await supabase
          .from('promo_codes')
          .insert([{ code: finalCode, is_used: false, entity_type: promoEntityType }])
          .select()
          .single();
        if (error) {
          alert(`No se pudo crear el cupón (${error.message}). Verifica que no esté repetido.`);
          setIsCreatingPromo(false);
          return;
        }
        createdItem = data;
      }

      setCustomPromoInput('');
      setPromoCodesList((prev) => [createdItem, ...prev.filter((p) => p.code !== createdItem.code)]);
      alert(`🎉 ¡Código ${createdItem.code} generado y listo para compartir!`);
    } catch (err: any) {
      alert('Error generando el código promocional.');
    } finally {
      setIsCreatingPromo(false);
    }
  };

  // 📲 Compartir código promocional por WhatsApp / SMS / Share nativo (iOS, Android y Web)
  const handleSharePromoCode = async (codeStr: string) => {
    const shareMessage = `🎁 ¡Hola! Te comparto un código promocional VIP de activación para registrar tu negocio en PickTime Book:\n\n🎟️ Código: ${codeStr}\n\nIngresa a la app en "Soy un Negocio" ➔ Paso 4 (Plan) ➔ "Tengo un Cupón Promocional" y actívalo gratis.`;
    try {
      if (Platform.OS === 'web') {
        if (typeof navigator !== 'undefined' && (navigator as any).share) {
          await (navigator as any).share({ title: 'Cupón VIP PickTime Book', text: shareMessage });
          return;
        }
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
          await navigator.clipboard.writeText(shareMessage);
          alert(`📋 ¡Código ${codeStr} e invitación copiados al portapapeles listos para pegar en WhatsApp!`);
          return;
        }
      }
      await Share.share({
        title: `Código Promocional: ${codeStr}`,
        message: shareMessage,
      });
    } catch (_e) {}
  };

  // 🔍 Validar si el cupón existe en `public.promo_codes` y `is_used === false` (Paso 4)
  const handleValidatePromoCodeInStep4 = async () => {
    const cleanCode = promoCodeInput.trim().toUpperCase();
    if (!cleanCode) {
      setPromoErrorMsg('Escribe un código promocional para validar.');
      return;
    }
    setIsValidatingPromo(true);
    setPromoErrorMsg('');
    setValidatedPromoObj(null);

    try {
      // 1. Intentar validar contra el endpoint del backend `/api/promo-codes/validate`
      let checkedViaBackend = false;
      try {
        const res = await fetch(`${getApiBaseUrl()}/api/promo-codes/validate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: cleanCode }),
        });
        if (res.ok || res.status === 400 || res.status === 404) {
          const data = await res.json();
          checkedViaBackend = true;
          if (res.ok && data.success && data.promoCode) {
            setValidatedPromoObj(data.promoCode);
            if (!selectedPlan) setSelectedPlan('pro');
            setIsValidatingPromo(false);
            return;
          } else {
            setPromoErrorMsg(data.message || 'Este cupón no existe o ya fue utilizado.');
            setIsValidatingPromo(false);
            return;
          }
        }
      } catch (_e) {}

      // 2. Fallback directo a Supabase (`public.promo_codes`) si el backend aún no tiene la ruta montada
      if (!checkedViaBackend) {
        const { data, error } = await supabase
          .from('promo_codes')
          .select('id, code, is_used, used_by_user_id, used_for_entity_id, entity_type, created_at, used_at')
          .eq('code', cleanCode)
          .maybeSingle();

        if (error || !data) {
          setPromoErrorMsg('❌ El código ingresado no existe en la base de datos.');
        } else if (data.is_used) {
          setPromoErrorMsg('⚠️ Este código promocional ya fue utilizado anteriormente.');
        } else {
          setValidatedPromoObj(data);
          if (!selectedPlan) setSelectedPlan('pro');
        }
      }
    } catch (_err) {
      setPromoErrorMsg('Error de conexión al validar el cupón.');
    } finally {
      setIsValidatingPromo(false);
    }
  };

  // 🔒 Candado estricto: SOLO es true si la sesión autenticada actual pertenece exactamente a cesargomez853@gmail.com
  const isSuperAdminLogged =
    verifiedOwnerEmail === SUPER_ADMIN_EMAIL &&
    ownerLoginEmail.trim().toLowerCase() === SUPER_ADMIN_EMAIL &&
    myOwnedTenants.length > 0;

  // 🎛️ SuperAdmin: Prender o apagar pagos con tarjeta en el registro (persiste en BD)
  const handleToggleCardPayments = async (nextVal: boolean) => {
    if (!isSuperAdminLogged) return;
    setCardPaymentsEnabled(nextVal);
    if (!nextVal) {
      setPaymentMethod('promo_code');
    }
    setIsSavingPaymentFlag(true);
    try {
      let savedViaApi = false;
      try {
        const res = await fetch(`${getApiBaseUrl()}/api/platform-settings/card-payments`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            enabled: nextVal,
            ownerEmail: verifiedOwnerEmail,
          }),
        });
        if (res.ok) savedViaApi = true;
      } catch (_e) {}

      if (!savedViaApi) {
        await supabase
          .from('platform_settings')
          .upsert(
            { key: 'card_payments_enabled', value: String(nextVal), updated_at: new Date().toISOString() },
            { onConflict: 'key' }
          );
      }
    } catch (_err) {
      alert('No se pudo guardar la configuración en la base de datos.');
    } finally {
      setIsSavingPaymentFlag(false);
    }
  };

  const handleOwnerLogin = async () => {
    const cleanEmail = ownerLoginEmail.trim().toLowerCase();
    if (!cleanEmail || !ownerLoginPassword) {
      return alert('Por favor ingresa el correo administrador y la contraseña que creaste al registrar tu negocio.');
    }
    setIsLoggingInOwner(true);
    setVerifiedOwnerEmail('');
    setShowPromoAdminPanel(false);
    setPromoCodesList([]);

    try {
      const res = await fetch(`${getApiBaseUrl()}/api/tenants/owner-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, password: ownerLoginPassword }),
      });
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.tenants)) {
        setVerifiedOwnerEmail(cleanEmail);
        setMyOwnedTenants(data.tenants);
        if (cleanEmail === SUPER_ADMIN_EMAIL) {
          fetchPromoCodesList(cleanEmail);
        }
        return;
      }

      // 🔑 Respaldo SuperAdmin directo con Supabase si el backend no se ha reiniciado
      if (cleanEmail === SUPER_ADMIN_EMAIL && ownerLoginPassword === 'Valeria2311*') {
        const { data: sbTenants } = await supabase
          .from('tenants')
          .select('id, name, niche, city, state, primary_color, plan_tier, admin_email')
          .order('created_at', { ascending: false });

        const myFiltered = (sbTenants || []).filter(
          (t: any) => String(t.admin_email || '').toLowerCase() === SUPER_ADMIN_EMAIL
        );

        setVerifiedOwnerEmail(SUPER_ADMIN_EMAIL);
        setMyOwnedTenants(
          myFiltered.length > 0
            ? myFiltered.map((t: any) => ({
                id: t.id,
                name: t.name,
                niche: t.niche,
                city: t.city,
                state: t.state,
                primaryColor: t.primary_color,
                planTier: t.plan_tier,
              }))
            : [
                {
                  id: '00000000-0000-4000-8000-000000000001',
                  name: 'PickTime Book HQ (Admin)',
                  niche: 'barbershop',
                  city: 'Rancho Cucamonga',
                  state: 'CA',
                  primaryColor: '#FF5E00',
                  planTier: 'elite',
                },
              ]
        );
        fetchPromoCodesList(SUPER_ADMIN_EMAIL);
        return;
      }

      alert(data.message || 'No encontramos negocios con esas credenciales.');
    } catch (e: any) {
      alert('Error de conexión con el servidor al consultar tus negocios.');
    } finally {
      setIsLoggingInOwner(false);
    }
  };

  const handleFinalCheckoutAndStore = async () => {
    if (!selectedPlan) return alert('Por favor selecciona un plan para continuar.');
    const effectivePaymentMethod = cardPaymentsEnabled ? paymentMethod : 'promo_code';
    if (effectivePaymentMethod === 'promo_code' && !validatedPromoObj) {
      return alert(
        cardPaymentsEnabled
          ? 'Por favor valida un Código Promocional activo antes de completar el registro con cupón, o elige Suscripción Mensual.'
          : 'Por favor ingresa y valida tu Código Promocional VIP para activar tu cuenta.'
      );
    }
    setIsSubmitting(true);

    try {
      let uploadedLogoUrl = null;
      if (logoFile) {
        uploadedLogoUrl = await convertAndUploadLogo(logoFile);
      }

      const generateSafeUuid = () => {
        if (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
          return globalThis.crypto.randomUUID();
        }
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          const v = c === 'x' ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
      };
      const newTenantId = generateSafeUuid();

      const tenantPayload = {
        id: newTenantId,
        name: businessName,
        niche: category,
        address, 
        city, 
        state: stateCode, 
        zipCode,
        latitude: latitude ? Number(latitude) : null,
        longitude: longitude ? Number(longitude) : null,
        logoUrl: uploadedLogoUrl, // ➔ URL completa enviada a la BD
        primaryColor,
        planTier: selectedPlan,
        subscriptionStatus: 'active',
        adminEmail: email,
        password,
        portalPin: portalPin.trim(),
        paymentMethod,
        promoCode: paymentMethod === 'promo_code' && validatedPromoObj ? validatedPromoObj.code : null,
        promoCodeId: paymentMethod === 'promo_code' && validatedPromoObj ? validatedPromoObj.id : null,
      };

      const API_URL = process.env.EXPO_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || (Platform.OS === 'web' ? 'http://localhost:4000' : 'http://127.0.0.1:4000');
      const response = await fetch(`${API_URL}/api/tenants/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tenantPayload)
      });

      const json = await response.json();

      if (!response.ok || !json.success) {
        throw new Error(json.message || 'Error al registrar el negocio en el servidor.');
      }

      // 🎟️ Si se usó un cupón válido, asegurar que quede marcado como `is_used = true` y vinculado al negocio creado
      if (paymentMethod === 'promo_code' && validatedPromoObj?.code) {
        try {
          await supabase
            .from('promo_codes')
            .update({
              is_used: true,
              used_for_entity_id: newTenantId,
              entity_type: 'tenant',
              used_at: new Date().toISOString(),
            })
            .eq('code', validatedPromoObj.code);
        } catch (_e) {}
      }

      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(
            `autoflow_admin_creds_${newTenantId}`,
            JSON.stringify({ email: email.trim().toLowerCase(), password })
          );
        } catch (_e) {}
      }

      alert(`¡Negocio registrado con éxito! 🎉\n\nUsa este correo y contraseña para ingresar a tu Portal Interno.`);
      setIsSubmitting(false);

      router.push(`/${newTenantId}?view=mecanico&role=owner&section=catalogo` as any);

    } catch (err: any) {
      console.error("Error en el registro:", err);
      alert(`Ocurrió un error: ${err.message || 'Error de red'}`);
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.root}>
      <WebStyles />
      
      <View
        style={[
          styles.header,
          {
            paddingTop: SAFE_TOP_INSET,
            height: (isMobile ? 64 : 74) + SAFE_TOP_INSET,
            paddingHorizontal: isMobile ? 16 : 40,
            zIndex: 300,
            elevation: 20,
          },
        ]}
      >
        <TouchableOpacity
          activeOpacity={0.7}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}
          onPress={goToDirectory}
        >
            <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 11,
              backgroundColor: '#000000',
              borderWidth: 2.5,
              borderColor: primaryColor,
              overflow: 'hidden',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Image
              source={require('../assets/images/logopicktime.jpg')}
              style={{ width: '90%', height: '90%', transform: [{ scale: 1.55 }] }}
              resizeMode="contain"
            />
          </View>
          <Text style={{ fontSize: 20, fontWeight: '900', color: '#FFF', letterSpacing: -0.5 }}>
            PickTime <Text style={{ color: primaryColor }}>Book</Text>
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          activeOpacity={0.75}
          hitSlop={{ top: 14, bottom: 14, left: 16, right: 16 }}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderRadius: 10,
            backgroundColor: 'rgba(255,255,255,0.08)',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.16)',
            zIndex: 310,
          }}
          onPress={handleCloseScreen}
        >
          <Feather name="x" size={16} color="#FFFFFF" />
          <Text style={{ color: '#FFFFFF', fontWeight: 'bold', fontSize: 13.5 }}>Cerrar</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.contentArea} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {!isStarted ? (
          <View style={{ width: '100%', maxWidth: 800, alignSelf: 'center', alignItems: 'center', paddingTop: isMobile ? 16 : 44, paddingBottom: 60 }}>
            {!showOwnerLoginCard ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: `${primaryColor}50`, backgroundColor: `${primaryColor}15`, paddingVertical: 8, paddingHorizontal: 18, borderRadius: 20, marginBottom: 24 }}>
                  <Feather name="trending-up" size={14} color={primaryColor} />
                  <Text style={{ color: primaryColor, fontWeight: 'bold', fontSize: 13 }}>Únete a la Red de Negocios Líder</Text>
                </View>
                
                <Text style={{ fontSize: isMobile ? 34 : 52, fontWeight: '900', color: '#FFF', textAlign: 'center', marginBottom: 18, lineHeight: isMobile ? 42 : 60, letterSpacing: -1 }}>
                  Digitaliza tu Negocio, Clínica o Firma Legal con <Text style={{ color: primaryColor }}>PickTime Book</Text>
                </Text>
                
                <Text style={{ fontSize: isMobile ? 16 : 18, color: '#94A3B8', textAlign: 'center', maxWidth: 650, lineHeight: isMobile ? 24 : 28, marginBottom: 36 }}>
                  Atrae más clientes locales, automatiza tu agenda en tiempo real y gestiona tu POS e inventario desde un portal profesional con tu propia marca.
                </Text>
                
                <View style={{ width: '100%', maxWidth: 460, gap: 14 }}>
                  <TouchableOpacity 
                    style={[styles.primaryButton, { backgroundColor: primaryColor, paddingVertical: 18, paddingHorizontal: 24, width: '100%', flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center' }]} 
                    onPress={() => {
                      setShowOwnerLoginCard(false);
                      setIsStarted(true);
                    }}
                  >
                    <Feather name="arrow-right-circle" size={20} color="#FFF" />
                    <Text style={[styles.primaryButtonText, { fontSize: 17 }]}>Registrar mi Negocio Ahora</Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={[
                      styles.secondaryButton,
                      {
                        paddingVertical: 16,
                        paddingHorizontal: 24,
                        width: '100%',
                        flexDirection: 'row',
                        gap: 10,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderColor: 'rgba(255,255,255,0.16)',
                        backgroundColor: 'rgba(255,255,255,0.04)',
                      },
                    ]} 
                    onPress={() => setShowOwnerLoginCard(true)}
                  >
                    <Feather name="lock" size={17} color={primaryColor} />
                    <Text style={[styles.secondaryButtonText, { fontSize: 15.5, color: '#FFFFFF' }]}>
                      Ya tengo un Negocio (Entrar al Portal)
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.75}
                    onPress={goToDirectory}
                    style={{
                      marginTop: 6,
                      paddingVertical: 12,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                    }}
                  >
                    <Feather name="arrow-left" size={15} color="#94A3B8" />
                    <Text style={{ color: '#94A3B8', fontSize: 14, fontWeight: '700' }}>
                      Volver al Directorio de Clientes
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              /* 🔐 VISTA ENFOCADA Y LIMPIA: SOLO ACCESO A MIS NEGOCIOS + BOTÓN VOLVER */
              <View style={{ width: '100%', maxWidth: 520, alignSelf: 'center' }}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => {
                    setShowOwnerLoginCard(false);
                    setMyOwnedTenants([]);
                    setVerifiedOwnerEmail('');
                    setOwnerLoginPassword('');
                    setShowPromoAdminPanel(false);
                    setPromoCodesList([]);
                  }}
                  style={{
                    alignSelf: 'flex-start',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    paddingVertical: 10,
                    paddingHorizontal: 16,
                    borderRadius: 12,
                    backgroundColor: 'rgba(255,255,255,0.06)',
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.12)',
                    marginBottom: 20,
                  }}
                >
                  <Feather name="arrow-left" size={16} color="#FFFFFF" />
                  <Text style={{ color: '#FFFFFF', fontSize: 13.5, fontWeight: '800' }}>
                    Volver a Opciones
                  </Text>
                </TouchableOpacity>

                <View style={[styles.glassCard, { width: '100%', padding: isMobile ? 22 : 30, borderColor: 'rgba(255,255,255,0.14)' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                    <ProIconBox family="Feather" name="shield" color={primaryColor} size={20} boxSize={44} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ color: '#FFFFFF', fontSize: 19, fontWeight: '900' }} numberOfLines={1}>
                        Acceso a Mis Negocios
                      </Text>
                      <Text style={{ color: '#94A3B8', fontSize: 12.5, marginTop: 2 }}>
                        Ingresa el correo y contraseña de tu cuenta administradora
                      </Text>
                    </View>
                  </View>

                {myOwnedTenants.length === 0 ? (
                  <View>
                    {!showEmailLoginForm ? (
                      /* 🌟 VISTA INICIAL MINIMALISTA PRO: 3 OPCIONES LIMPIAS DE ACCESO 🌟 */
                      <View style={{ gap: 12 }}>
                        <TouchableOpacity
                          activeOpacity={0.85}
                          onPress={() => handleSocialAuth('apple', 'login')}
                          disabled={isSocialLoading !== null}
                          style={{
                            height: 54,
                            borderRadius: 14,
                            backgroundColor: '#FFFFFF',
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 10,
                            paddingHorizontal: 18,
                          }}
                        >
                          {isSocialLoading === 'apple' ? (
                            <ActivityIndicator color="#000000" size="small" />
                          ) : (
                            <>
                              <Ionicons name="logo-apple" size={21} color="#000000" />
                              <Text style={{ color: '#000000', fontWeight: '900', fontSize: 15 }}>
                                Continuar con Apple
                              </Text>
                            </>
                          )}
                        </TouchableOpacity>

                        <TouchableOpacity
                          activeOpacity={0.85}
                          onPress={() => handleSocialAuth('google', 'login')}
                          disabled={isSocialLoading !== null}
                          style={{
                            height: 54,
                            borderRadius: 14,
                            backgroundColor: 'rgba(255,255,255,0.06)',
                            borderWidth: 1,
                            borderColor: 'rgba(255,255,255,0.18)',
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 10,
                            paddingHorizontal: 18,
                          }}
                        >
                          {isSocialLoading === 'google' ? (
                            <ActivityIndicator color="#FFFFFF" size="small" />
                          ) : (
                            <>
                              <Ionicons name="logo-google" size={19} color="#EA4335" />
                              <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 15 }}>
                                Continuar con Google
                              </Text>
                            </>
                          )}
                        </TouchableOpacity>

                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 4 }}>
                          <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.08)' }} />
                          <Text style={{ color: '#64748B', fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                            o
                          </Text>
                          <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.08)' }} />
                        </View>

                        <TouchableOpacity
                          activeOpacity={0.85}
                          onPress={() => setShowEmailLoginForm(true)}
                          style={{
                            height: 54,
                            borderRadius: 14,
                            backgroundColor: `${primaryColor}16`,
                            borderWidth: 1,
                            borderColor: primaryColor,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 10,
                            paddingHorizontal: 18,
                          }}
                        >
                          <Feather name="mail" size={18} color={primaryColor} />
                          <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 15 }}>
                            Ingresar con Correo y Contraseña
                          </Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      /* 🔐 FORMULARIO DESPLEGADO DE CORREO Y CONTRASEÑA */
                      <View>
                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={() => setShowEmailLoginForm(false)}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 6,
                            alignSelf: 'flex-start',
                            paddingVertical: 6,
                            paddingHorizontal: 10,
                            borderRadius: 8,
                            backgroundColor: 'rgba(255,255,255,0.05)',
                            borderWidth: 1,
                            borderColor: 'rgba(255,255,255,0.1)',
                            marginBottom: 16,
                          }}
                        >
                          <Feather name="arrow-left" size={13} color="#94A3B8" />
                          <Text style={{ color: '#94A3B8', fontSize: 12, fontWeight: '800' }}>
                            Otras opciones (Apple / Google)
                          </Text>
                        </TouchableOpacity>

                        <View style={{ marginBottom: 16 }}>
                          <Text style={styles.inputLabel}>Correo Administrador</Text>
                          <TextInput
                            style={styles.formInput}
                            placeholder="ejemplo@mitaller.com"
                            placeholderTextColor="#475569"
                            keyboardType="email-address"
                            autoCapitalize="none"
                            autoCorrect={false}
                            value={ownerLoginEmail}
                            onChangeText={setOwnerLoginEmail}
                          />
                        </View>

                        <View style={{ marginBottom: 22 }}>
                          <Text style={styles.inputLabel}>Contraseña Segura</Text>
                          <View style={styles.passwordInputWrapper}>
                            <TextInput
                              style={styles.passwordInnerInput}
                              placeholder="Tu contraseña segura"
                              placeholderTextColor="#475569"
                              secureTextEntry={!showOwnerLoginPassword}
                              autoCapitalize="none"
                              autoCorrect={false}
                              value={ownerLoginPassword}
                              onChangeText={setOwnerLoginPassword}
                            />
                            <TouchableOpacity onPress={() => setShowOwnerLoginPassword(!showOwnerLoginPassword)} style={styles.eyeButton}>
                              <Feather name={showOwnerLoginPassword ? 'eye-off' : 'eye'} size={18} color="#94A3B8" />
                            </TouchableOpacity>
                          </View>
                        </View>

                        <TouchableOpacity
                          style={[styles.primaryButton, { backgroundColor: primaryColor, flexDirection: 'row', gap: 8, paddingHorizontal: 16 }]}
                          onPress={handleOwnerLogin}
                          disabled={isLoggingInOwner}
                        >
                          {isLoggingInOwner ? (
                            <ActivityIndicator color="#FFFFFF" />
                          ) : (
                            <>
                              <Feather name="log-in" size={16} color="#FFFFFF" />
                              <Text style={[styles.primaryButtonText, { fontSize: 15 }]}>Ver Mis Negocios</Text>
                            </>
                          )}
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                ) : (
                  <View style={{ gap: 14, width: '100%' }}>
                    {/* Cabecera alineada sin desborde en móvil: Texto con flex: 1 + Botón Salir contenido dentro de la tarjeta */}
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 10,
                        marginBottom: 4,
                        width: '100%',
                      }}
                    >
                      <Text
                        style={{
                          flex: 1,
                          color: '#10B981',
                          fontWeight: '800',
                          fontSize: 12.5,
                          lineHeight: 17,
                        }}
                      >
                        ✓ Selecciona tu negocio para abrir su Portal Interno:
                      </Text>
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => {
                          setMyOwnedTenants([]);
                          setVerifiedOwnerEmail('');
                          setOwnerLoginPassword('');
                          setShowPromoAdminPanel(false);
                          setPromoCodesList([]);
                        }}
                        style={{
                          flexShrink: 0,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 5,
                          paddingVertical: 6,
                          paddingHorizontal: 11,
                          borderRadius: 8,
                          backgroundColor: 'rgba(239, 68, 68, 0.12)',
                          borderWidth: 1,
                          borderColor: 'rgba(239, 68, 68, 0.35)',
                        }}
                      >
                        <Feather name="log-out" size={12} color="#EF4444" />
                        <Text style={{ color: '#EF4444', fontSize: 11.5, fontWeight: '800' }}>Salir</Text>
                      </TouchableOpacity>
                    </View>

                    {myOwnedTenants.map((tItem) => {
                      const tColorBrand = tItem.primaryColor || primaryColor;
                      return (
                        <TouchableOpacity
                          key={tItem.id}
                          activeOpacity={0.85}
                          onPress={() => router.push(`/${tItem.id}?view=mecanico&role=owner&section=today` as any)}
                          style={{
                            backgroundColor: 'rgba(0,0,0,0.45)',
                            borderRadius: 16,
                            borderWidth: 1,
                            borderColor: tColorBrand,
                            padding: 14,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 10,
                          }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                            <View style={{ width: 40, height: 40, borderRadius: 11, backgroundColor: tColorBrand, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 17 }}>
                                {String(tItem.name || 'A').charAt(0).toUpperCase()}
                              </Text>
                            </View>
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={{ color: '#FFFFFF', fontSize: 15.5, fontWeight: '900' }} numberOfLines={1}>
                                {tItem.name}
                              </Text>
                              <Text style={{ color: '#94A3B8', fontSize: 11.5, marginTop: 2 }} numberOfLines={1}>
                                {tItem.city || 'Local'}, {tItem.state || ''} • Plan {String(tItem.planTier || 'starter').toUpperCase()}
                              </Text>
                            </View>
                          </View>

                          <View style={{ backgroundColor: tColorBrand, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                            <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 12 }}>Portal</Text>
                            <Feather name="arrow-right" size={14} color="#FFFFFF" />
                          </View>
                        </TouchableOpacity>
                      );
                    })}

                    {/* 🔒 EXCLUSIVO PARA CESAR GOMEZ (cesargomez853@gmail.com): CONTROL DE PAGOS + CUPONES */}
                    {isSuperAdminLogged ? (
                      <View style={{ marginTop: 8, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', width: '100%', gap: 12 }}>
                        {/* 🎛️ Switch Maestro: Prender / Apagar Pagos con Tarjeta al Registrarse */}
                        <View
                          style={{
                            backgroundColor: cardPaymentsEnabled ? 'rgba(16, 185, 129, 0.14)' : 'rgba(245, 158, 11, 0.12)',
                            borderWidth: 1,
                            borderColor: cardPaymentsEnabled ? '#10B981' : '#F59E0B',
                            borderRadius: 14,
                            paddingVertical: 13,
                            paddingHorizontal: 14,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 12,
                          }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                            <View
                              style={{
                                width: 34,
                                height: 34,
                                borderRadius: 10,
                                backgroundColor: cardPaymentsEnabled ? 'rgba(16, 185, 129, 0.25)' : 'rgba(245, 158, 11, 0.22)',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                              }}
                            >
                              <Feather name="credit-card" size={17} color={cardPaymentsEnabled ? '#10B981' : '#F59E0B'} />
                            </View>
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 13.5 }} numberOfLines={1}>
                                💳 Pagos con Tarjeta en Registro
                              </Text>
                              <Text style={{ color: '#94A3B8', fontSize: 11.5, marginTop: 2, lineHeight: 15 }}>
                                {cardPaymentsEnabled
                                  ? 'PRENDIDO: Se muestra Cupón + Suscripción Mensual'
                                  : 'APAGADO: Solo activación con Cupón Promocional'}
                              </Text>
                            </View>
                          </View>
                          <Switch
                            value={cardPaymentsEnabled}
                            onValueChange={handleToggleCardPayments}
                            disabled={isSavingPaymentFlag}
                            trackColor={{ false: '#334155', true: '#10B981' }}
                            thumbColor="#FFFFFF"
                          />
                        </View>
                        <TouchableOpacity
                          activeOpacity={0.85}
                          onPress={() => {
                            const nextState = !showPromoAdminPanel;
                            setShowPromoAdminPanel(nextState);
                            if (nextState) fetchPromoCodesList();
                          }}
                          style={{
                            backgroundColor: showPromoAdminPanel ? 'rgba(16, 185, 129, 0.16)' : 'rgba(255, 94, 0, 0.12)',
                            borderWidth: 1,
                            borderColor: showPromoAdminPanel ? '#10B981' : primaryColor,
                            borderRadius: 14,
                            paddingVertical: 13,
                            paddingHorizontal: 14,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 10,
                          }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                            <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: showPromoAdminPanel ? 'rgba(16, 185, 129, 0.25)' : `${primaryColor}25`, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <Feather name="gift" size={17} color={showPromoAdminPanel ? '#10B981' : primaryColor} />
                            </View>
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 13.5 }} numberOfLines={1}>
                                🎟️ Códigos Promocionales VIP
                              </Text>
                              <Text style={{ color: '#94A3B8', fontSize: 11.5, marginTop: 1 }} numberOfLines={2}>
                                Genera y comparte cupones de registro (1 solo uso)
                              </Text>
                            </View>
                          </View>
                          <Feather name={showPromoAdminPanel ? 'chevron-up' : 'chevron-down'} size={18} color="#FFFFFF" />
                        </TouchableOpacity>

                        {showPromoAdminPanel ? (
                          <View style={{ marginTop: 12, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', gap: 12 }}>
                            <Text style={{ color: '#E2E8F0', fontSize: 12, lineHeight: 17 }}>
                              Crea un código personalizado o deja el campo vacío para generar uno aleatorio en <Text style={{ color: '#10B981', fontWeight: '800' }}>public.promo_codes</Text>:
                            </Text>

                            <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 10 }}>
                              <TextInput
                                style={[styles.formInput, { flex: 1, height: 46, fontSize: 13.5, fontWeight: '800', letterSpacing: 0.8 }]}
                                placeholder="Opcional: Ej. VIP-BARBER2026"
                                placeholderTextColor="#64748B"
                                autoCapitalize="characters"
                                value={customPromoInput}
                                onChangeText={(t) => setCustomPromoInput(t.toUpperCase())}
                              />
                              <TouchableOpacity
                                activeOpacity={0.85}
                                onPress={handleGeneratePromoCode}
                                disabled={isCreatingPromo}
                                style={{
                                  backgroundColor: '#10B981',
                                  height: 46,
                                  paddingHorizontal: 18,
                                  borderRadius: 12,
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: 8,
                                }}
                              >
                                {isCreatingPromo ? (
                                  <ActivityIndicator color="#FFFFFF" size="small" />
                                ) : (
                                  <>
                                    <Feather name="plus-circle" size={16} color="#FFFFFF" />
                                    <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 13.5 }}>
                                      Generar Código
                                    </Text>
                                  </>
                                )}
                              </TouchableOpacity>
                            </View>

                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2, gap: 8 }}>
                              <Text style={{ color: '#94A3B8', fontSize: 11, fontWeight: '800', textTransform: 'uppercase', flex: 1 }} numberOfLines={1}>
                                Cupones en BD ({promoCodesList.length})
                              </Text>
                              <TouchableOpacity
                                onPress={() => fetchPromoCodesList()}
                                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8, backgroundColor: 'rgba(255, 94, 0, 0.12)' }}
                              >
                                <Feather name="refresh-cw" size={11} color={primaryColor} />
                                <Text style={{ color: primaryColor, fontSize: 11.5, fontWeight: '800' }}>
                                  {isLoadingPromos ? 'Cargando...' : 'Actualizar'}
                                </Text>
                              </TouchableOpacity>
                            </View>

                            <ScrollView style={{ maxHeight: 250 }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                              <View style={{ gap: 8 }}>
                                {promoCodesList.length === 0 ? (
                                  <Text style={{ color: '#64748B', fontSize: 12.5, textAlign: 'center', paddingVertical: 12 }}>
                                    Aún no hay códigos generados. Pulsa "Generar Código" arriba.
                                  </Text>
                                ) : (
                                  promoCodesList.map((pItem, idx) => {
                                    const used = Boolean(pItem.is_used ?? pItem.isUsed);
                                    return (
                                      <View
                                        key={pItem.id || `${pItem.code}-${idx}`}
                                        style={{
                                          backgroundColor: 'rgba(255,255,255,0.03)',
                                          borderWidth: 1,
                                          borderColor: used ? 'rgba(239, 68, 68, 0.25)' : 'rgba(16, 185, 129, 0.35)',
                                          borderRadius: 12,
                                          paddingVertical: 11,
                                          paddingHorizontal: 12,
                                          flexDirection: 'row',
                                          alignItems: 'center',
                                          justifyContent: 'space-between',
                                          gap: 10,
                                        }}
                                      >
                                        {/* Columna izquierda: Código arriba + Badge de estado abajo para que NUNCA se cruce con el botón Compartir */}
                                        <View style={{ flex: 1, minWidth: 0 }}>
                                          <Text
                                            style={{
                                              color: used ? '#64748B' : '#FFFFFF',
                                              fontWeight: '900',
                                              fontSize: 13.5,
                                              letterSpacing: 0.6,
                                              textDecorationLine: used ? 'line-through' : 'none',
                                            }}
                                            numberOfLines={1}
                                            ellipsizeMode="tail"
                                          >
                                            {pItem.code}
                                          </Text>

                                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
                                            <View
                                              style={{
                                                backgroundColor: used ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.18)',
                                                paddingHorizontal: 7,
                                                paddingVertical: 2,
                                                borderRadius: 5,
                                              }}
                                            >
                                              <Text style={{ color: used ? '#EF4444' : '#10B981', fontSize: 9.5, fontWeight: '900' }}>
                                                {used ? 'USADO' : 'DISPONIBLE'}
                                              </Text>
                                            </View>
                                            <Text style={{ color: '#64748B', fontSize: 10.5 }} numberOfLines={1}>
                                              {used && (pItem.used_at || pItem.usedAt)
                                                ? `• ${new Date(pItem.used_at || pItem.usedAt).toLocaleDateString()}`
                                                : `• Tipo: ${pItem.entity_type || pItem.entityType || 'tenant'}`}
                                            </Text>
                                          </View>
                                        </View>

                                        {!used ? (
                                          <TouchableOpacity
                                            activeOpacity={0.8}
                                            onPress={() => handleSharePromoCode(pItem.code)}
                                            style={{
                                              flexShrink: 0,
                                              backgroundColor: primaryColor,
                                              paddingVertical: 8,
                                              paddingHorizontal: 12,
                                              borderRadius: 9,
                                              flexDirection: 'row',
                                              alignItems: 'center',
                                              gap: 5,
                                            }}
                                          >
                                            <Feather name="share-2" size={13} color="#FFFFFF" />
                                            <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 11.5 }}>
                                              Compartir
                                            </Text>
                                          </TouchableOpacity>
                                        ) : null}
                                      </View>
                                    );
                                  })
                                )}
                              </View>
                            </ScrollView>
                          </View>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                )}
                </View>

                {/* Enlace secundario limpio abajo por si aún no tiene cuenta y quiere registrarse */}
                {myOwnedTenants.length === 0 ? (
                  <TouchableOpacity
                    activeOpacity={0.75}
                    onPress={() => {
                      setShowOwnerLoginCard(false);
                      setIsStarted(true);
                    }}
                    style={{ marginTop: 20, alignItems: 'center', paddingVertical: 8 }}
                  >
                    <Text style={{ color: '#94A3B8', fontSize: 13.5 }}>
                      ¿Aún no has registrado tu local?{' '}
                      <Text style={{ color: primaryColor, fontWeight: '900', textDecorationLine: 'underline' }}>
                        Registrar mi Negocio →
                      </Text>
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            )}
          </View>
        ) : (
          <View style={{ width: '100%', alignItems: 'center' }}>
            <View style={{ maxWidth: 800, width: '100%', alignSelf: 'center', marginBottom: 40 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
                <Text style={[styles.stepText, step >= 1 && styles.stepTextActive]}>1. Cuenta</Text>
                <Text style={[styles.stepText, step >= 2 && styles.stepTextActive]}>2. Ubicación</Text>
                <Text style={[styles.stepText, step >= 3 && styles.stepTextActive]}>3. Marca</Text>
                <Text style={[styles.stepText, step >= 4 && styles.stepTextActive]}>4. Plan</Text>
              </View>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { backgroundColor: primaryColor, width: step === 1 ? '25%' : step === 2 ? '50%' : step === 3 ? '75%' : '100%' }]} />
              </View>
            </View>

            {step === 1 && (
              <View style={styles.formContainer}>
                <Text style={styles.title}>Crea tu cuenta administradora</Text>
                <Text style={styles.subtitle}>
                  {!showEmailRegisterForm && !socialAuthProvider
                    ? 'Elige cómo prefieres crear y proteger el acceso de administrador para tu negocio.'
                    : socialAuthProvider
                    ? `Cuenta vinculada con ${socialAuthProvider === 'apple' ? 'Apple ID' : 'Google'}. Confirma tu correo y el PIN de tus empleados.`
                    : 'Configura tu correo comercial, contraseña segura y el PIN operativo para tus empleados.'}
                </Text>

                <View style={[styles.glassCard, isMobile && { padding: 24 }]}>
                  {!showEmailRegisterForm && !socialAuthProvider ? (
                    /* 🌟 ESTADO 1 (POR DEFECTO): SELECTOR LIMPIO ESTILO ENTERPRISE (SIN SATURAR CON FORMULARIOS) 🌟 */
                    <View style={{ gap: 14 }}>
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => handleSocialAuth('apple', 'register')}
                        disabled={isSocialLoading !== null}
                        style={{
                          height: 56,
                          borderRadius: 14,
                          backgroundColor: '#FFFFFF',
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 12,
                          paddingHorizontal: 20,
                        }}
                      >
                        {isSocialLoading === 'apple' ? (
                          <ActivityIndicator color="#000000" size="small" />
                        ) : (
                          <>
                            <Ionicons name="logo-apple" size={22} color="#000000" />
                            <Text style={{ color: '#000000', fontWeight: '900', fontSize: 15.5 }}>
                              Continuar con Apple
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>

                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => handleSocialAuth('google', 'register')}
                        disabled={isSocialLoading !== null}
                        style={{
                          height: 56,
                          borderRadius: 14,
                          backgroundColor: 'rgba(255,255,255,0.06)',
                          borderWidth: 1,
                          borderColor: 'rgba(255,255,255,0.18)',
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 12,
                          paddingHorizontal: 20,
                        }}
                      >
                        {isSocialLoading === 'google' ? (
                          <ActivityIndicator color="#FFFFFF" size="small" />
                        ) : (
                          <>
                            <Ionicons name="logo-google" size={20} color="#EA4335" />
                            <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 15.5 }}>
                              Continuar con Google
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>

                      {/* Divisor minimalista */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 6 }}>
                        <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.08)' }} />
                        <Text style={{ color: '#64748B', fontSize: 11.5, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                          o registro tradicional
                        </Text>
                        <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.08)' }} />
                      </View>

                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => {
                          setSocialAuthProvider(null);
                          setShowEmailRegisterForm(true);
                        }}
                        style={{
                          height: 56,
                          borderRadius: 14,
                          backgroundColor: `${primaryColor}18`,
                          borderWidth: 1.5,
                          borderColor: primaryColor,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 10,
                          paddingHorizontal: 20,
                        }}
                      >
                        <Feather name="mail" size={19} color={primaryColor} />
                        <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 15.5 }}>
                          Registrarse con Correo y Contraseña
                        </Text>
                      </TouchableOpacity>

                      <View style={{ marginTop: 8, padding: 14, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.02)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Feather name="shield" size={16} color="#10B981" />
                        <Text style={{ color: '#94A3B8', fontSize: 12, flex: 1, lineHeight: 17 }}>
                          Tus credenciales están encriptadas de extremo a extremo y solo tú tendrás acceso de dueño al Portal Interno.
                        </Text>
                      </View>
                    </View>
                  ) : (
                    /* 🔐 ESTADO 2 (EXPANDIDO): FORMULARIO DE CORREO + PASSWORD O CUENTA SOCIAL VINCULADA */
                    <View>
                      {/* Barra superior para regresar a las 3 opciones (Apple / Google / Email) */}
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={() => {
                            setShowEmailRegisterForm(false);
                            setSocialAuthProvider(null);
                            setPassword('');
                            setConfirmPassword('');
                          }}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 6,
                            paddingVertical: 7,
                            paddingHorizontal: 12,
                            borderRadius: 10,
                            backgroundColor: 'rgba(255,255,255,0.06)',
                            borderWidth: 1,
                            borderColor: 'rgba(255,255,255,0.12)',
                          }}
                        >
                          <Feather name="arrow-left" size={14} color="#FFFFFF" />
                          <Text style={{ color: '#FFFFFF', fontSize: 12.5, fontWeight: '800' }}>
                            Cambiar método
                          </Text>
                        </TouchableOpacity>

                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 6,
                            paddingVertical: 5,
                            paddingHorizontal: 10,
                            borderRadius: 8,
                            backgroundColor: socialAuthProvider ? 'rgba(16, 185, 129, 0.15)' : `${primaryColor}18`,
                            borderWidth: 1,
                            borderColor: socialAuthProvider ? '#10B981' : `${primaryColor}50`,
                          }}
                        >
                          <Ionicons
                            name={
                              socialAuthProvider === 'apple'
                                ? 'logo-apple'
                                : socialAuthProvider === 'google'
                                ? 'logo-google'
                                : 'mail-outline'
                            }
                            size={14}
                            color={socialAuthProvider ? '#10B981' : primaryColor}
                          />
                          <Text style={{ color: socialAuthProvider ? '#10B981' : primaryColor, fontSize: 11.5, fontWeight: '900' }}>
                            {socialAuthProvider === 'apple'
                              ? 'Apple ID'
                              : socialAuthProvider === 'google'
                              ? 'Google'
                              : 'Correo y Password'}
                          </Text>
                        </View>
                      </View>

                      <View style={{ marginBottom: 22 }}>
                        <Text style={styles.inputLabel}>
                          {socialAuthProvider
                            ? `Correo de tu cuenta ${socialAuthProvider === 'apple' ? 'Apple' : 'Google'}`
                            : 'Correo Electrónico Comercial'}
                        </Text>
                        <TextInput
                          style={styles.formInput}
                          placeholder="ejemplo@mitaller.com"
                          placeholderTextColor="#475569"
                          keyboardType="email-address"
                          autoCapitalize="none"
                          autoCorrect={false}
                          value={email}
                          onChangeText={setEmail}
                        />
                      </View>

                      {/* Solo pedir Contraseña y Confirmación si eligió registro con Correo y Contraseña */}
                      {!socialAuthProvider ? (
                        <>
                          <View style={{ marginBottom: 14 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                              <Text style={[styles.inputLabel, { marginBottom: 0 }]}>Contraseña Segura (Portal Interno)</Text>
                              {password.length > 0 && (
                                <Text
                                  style={{
                                    fontSize: 11,
                                    fontWeight: '800',
                                    color:
                                      passwordScore <= 1
                                        ? '#EF4444'
                                        : passwordScore <= 3
                                        ? '#F59E0B'
                                        : '#10B981',
                                  }}
                                >
                                  {passwordScore <= 1
                                    ? 'Débil'
                                    : passwordScore === 2
                                    ? 'Regular'
                                    : passwordScore === 3
                                    ? 'Buena'
                                    : 'Muy Segura'}
                                </Text>
                              )}
                            </View>

                            <View style={styles.passwordInputWrapper}>
                              <TextInput
                                style={styles.passwordInnerInput}
                                placeholder="Ej: Taller2026$"
                                placeholderTextColor="#475569"
                                secureTextEntry={!showPassword}
                                autoCapitalize="none"
                                autoCorrect={false}
                                value={password}
                                onChangeText={setPassword}
                              />
                              <TouchableOpacity
                                onPress={() => setShowPassword(!showPassword)}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                style={styles.eyeButton}
                              >
                                <Feather name={showPassword ? 'eye-off' : 'eye'} size={18} color="#94A3B8" />
                              </TouchableOpacity>
                            </View>

                            {/* Barra visual de fortaleza de contraseña (4 niveles) */}
                            <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
                              {[1, 2, 3, 4].map((lvl) => {
                                const active = passwordScore >= lvl;
                                const barColor =
                                  passwordScore <= 1
                                    ? '#EF4444'
                                    : passwordScore <= 3
                                    ? '#F59E0B'
                                    : '#10B981';
                                return (
                                  <View
                                    key={lvl}
                                    style={{
                                      flex: 1,
                                      height: 4,
                                      borderRadius: 2,
                                      backgroundColor: active ? barColor : 'rgba(255,255,255,0.08)',
                                    }}
                                  />
                                );
                              })}
                            </View>

                            {/* Lista de requisitos en tiempo real */}
                            <View style={styles.securityChecklistBox}>
                              {[
                                { ok: passwordChecks.minLength, label: 'Mínimo 8 caracteres' },
                                { ok: passwordChecks.hasUppercase, label: 'Al menos 1 letra mayúscula (A-Z)' },
                                { ok: passwordChecks.hasNumber, label: 'Al menos 1 número (0-9)' },
                                { ok: passwordChecks.hasSpecial, label: 'Al menos 1 símbolo especial (@, #, $, !, *)' },
                              ].map((rule, idx) => (
                                <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                  <Ionicons
                                    name={rule.ok ? 'checkmark-circle' : 'ellipse-outline'}
                                    size={15}
                                    color={rule.ok ? '#10B981' : '#64748B'}
                                  />
                                  <Text style={{ fontSize: 12, color: rule.ok ? '#E2E8F0' : '#94A3B8', fontWeight: rule.ok ? '600' : '400' }}>
                                    {rule.label}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          </View>

                          {/* Confirmar Contraseña */}
                          <View style={{ marginBottom: 28 }}>
                            <Text style={styles.inputLabel}>Confirmar Contraseña</Text>
                            <View
                              style={[
                                styles.passwordInputWrapper,
                                confirmPassword.length > 0 && {
                                  borderColor: passwordsMatch ? '#10B981' : '#EF4444',
                                },
                              ]}
                            >
                              <TextInput
                                style={styles.passwordInnerInput}
                                placeholder="Repite tu contraseña"
                                placeholderTextColor="#475569"
                                secureTextEntry={!showConfirmPassword}
                                autoCapitalize="none"
                                autoCorrect={false}
                                value={confirmPassword}
                                onChangeText={setConfirmPassword}
                              />
                              <TouchableOpacity
                                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                style={styles.eyeButton}
                              >
                                <Feather name={showConfirmPassword ? 'eye-off' : 'eye'} size={18} color="#94A3B8" />
                              </TouchableOpacity>
                            </View>
                            {confirmPassword.length > 0 && (
                              <Text
                                style={{
                                  fontSize: 11.5,
                                  marginTop: 6,
                                  fontWeight: '700',
                                  color: passwordsMatch ? '#10B981' : '#EF4444',
                                }}
                              >
                                {passwordsMatch ? '✓ Las contraseñas coinciden' : '✕ Las contraseñas no coinciden'}
                              </Text>
                            )}
                          </View>
                        </>
                      ) : null}

                      {/* 🔐 Código de Acceso (PIN) para Empleados (Solo ven citas y cierre POS) */}
                      <View style={{ marginBottom: 28, paddingTop: 18, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <Text style={[styles.inputLabel, { marginBottom: 0, color: '#38BDF8' }]}>
                            Código de Acceso Empleados (PIN 4-6 dígitos)
                          </Text>
                          {portalPin.length > 0 && (
                            <Text style={{ fontSize: 11, fontWeight: '800', color: isPortalPinValid ? '#10B981' : '#F59E0B' }}>
                              {isPortalPinValid ? '✓ PIN válido' : '4 a 6 números'}
                            </Text>
                          )}
                        </View>
                        <Text style={{ color: '#94A3B8', fontSize: 12, lineHeight: 17, marginBottom: 10 }}>
                          Tus barberos, mecánicos o especialistas usarán este código dentro de tu negocio <Text style={{ color: '#E2E8F0', fontWeight: '700' }}>únicamente para ver las citas en agenda y cerrar servicios</Text> (sin ver reportes financieros ni configuraciones de dueño).
                        </Text>
                        <View
                          style={[
                            styles.passwordInputWrapper,
                            {
                              borderColor: isPortalPinValid ? '#38BDF8' : 'rgba(255,255,255,0.1)',
                            },
                          ]}
                        >
                          <TextInput
                            style={[styles.passwordInnerInput, { letterSpacing: 6, fontWeight: '800', fontSize: 18 }]}
                            placeholder="Ej: 4580"
                            placeholderTextColor="#475569"
                            keyboardType="numeric"
                            maxLength={6}
                            secureTextEntry={!showPortalPin}
                            value={portalPin}
                            onChangeText={(txt) => setPortalPin(txt.replace(/\D/g, ''))}
                          />
                          <TouchableOpacity
                            onPress={() => setShowPortalPin(!showPortalPin)}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            style={styles.eyeButton}
                          >
                            <Feather name={showPortalPin ? 'eye-off' : 'eye'} size={18} color="#94A3B8" />
                          </TouchableOpacity>
                        </View>
                      </View>

                      <TouchableOpacity
                        style={[
                          styles.primaryButton,
                          {
                            backgroundColor: primaryColor,
                            flexDirection: 'row',
                            gap: 8,
                            opacity: (socialAuthProvider ? Boolean(email.trim()) : isPasswordStrong && passwordsMatch) && isPortalPinValid ? 1 : 0.85,
                          },
                        ]}
                        onPress={handleNextStep}
                      >
                        <Text style={styles.primaryButtonText}>Continuar</Text>
                        <Feather name="arrow-right" size={16} color="#FFF" />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            )}

            {step === 2 && (
              <View style={styles.formContainer}>
                <Text style={styles.title}>Identidad y Ubicación Real</Text>
                <Text style={styles.subtitle}>Escribe tu Zip Code y autocompletaremos la ciudad y estado para evitar errores.</Text>
                
                <View style={styles.glassCard}>
                  <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 16, marginBottom: 24 }}>
                    <View style={{ flex: 2 }}>
                      <Text style={styles.inputLabel}>Nombre Público del Negocio</Text>
                      <TextInput style={styles.formInput} placeholder="Ej: Auto Motors LA" placeholderTextColor="#475569" value={businessName} onChangeText={text => setBusinessName(toTitleCase(text))} />
                    </View>
                    <View style={{ flex: 1.5 }}>
                      <Text style={styles.inputLabel}>Categoría Autorizada</Text>
                      {Platform.OS === 'web' ? (
                        <select className="web-input-override" value={category} onChange={e => setCategory(e.target.value)}>
                          <option value="" disabled>Elige Nicho Comercial</option>
                          {dbCategories.map((cat) => (
                            <option key={cat.code} value={cat.code}>
                              {cat.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <>
                          <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => setIsCategoryModalOpen(true)}
                            style={[
                              styles.formInput,
                              {
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                borderColor: category ? primaryColor : 'rgba(255,255,255,0.12)',
                              },
                            ]}
                          >
                            <Text
                              numberOfLines={1}
                              style={{
                                flex: 1,
                                fontSize: 15,
                                fontWeight: category ? '700' : '400',
                                color: category ? '#FFFFFF' : '#64748B',
                              }}
                            >
                              {selectedCategoryObj ? selectedCategoryObj.name : 'Selecciona una categoría...'}
                            </Text>
                            <Feather name="chevron-down" size={18} color="#94A3B8" />
                          </TouchableOpacity>

                          <Modal
                            visible={isCategoryModalOpen}
                            transparent
                            animationType="fade"
                            onRequestClose={() => setIsCategoryModalOpen(false)}
                          >
                            <TouchableOpacity
                              activeOpacity={1}
                              onPress={() => setIsCategoryModalOpen(false)}
                              style={{
                                flex: 1,
                                backgroundColor: 'rgba(0, 0, 0, 0.78)',
                                justifyContent: 'center',
                                paddingHorizontal: 20,
                              }}
                            >
                              <View
                                style={{
                                  backgroundColor: '#0E1218',
                                  borderRadius: 22,
                                  borderWidth: 1,
                                  borderColor: 'rgba(255,255,255,0.14)',
                                  padding: 20,
                                  maxHeight: '70%',
                                }}
                              >
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                                  <Text style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '900' }}>
                                    Categorías Autorizadas
                                  </Text>
                                  <TouchableOpacity onPress={() => setIsCategoryModalOpen(false)}>
                                    <Feather name="x" size={20} color="#94A3B8" />
                                  </TouchableOpacity>
                                </View>

                                <ScrollView showsVerticalScrollIndicator={false}>
                                  {dbCategories.map((cat) => {
                                    const isSelected = category === cat.code;
                                    return (
                                      <TouchableOpacity
                                        key={cat.code}
                                        activeOpacity={0.75}
                                        onPress={() => {
                                          setCategory(cat.code);
                                          setIsCategoryModalOpen(false);
                                        }}
                                        style={{
                                          flexDirection: 'row',
                                          alignItems: 'center',
                                          justifyContent: 'space-between',
                                          paddingVertical: 14,
                                          paddingHorizontal: 14,
                                          borderRadius: 12,
                                          marginBottom: 8,
                                          backgroundColor: isSelected ? `${primaryColor}20` : 'rgba(255,255,255,0.04)',
                                          borderWidth: 1,
                                          borderColor: isSelected ? primaryColor : 'rgba(255,255,255,0.06)',
                                        }}
                                      >
                                        <View style={{ flex: 1, paddingRight: 10 }}>
                                          <Text style={{ color: '#FFFFFF', fontSize: 14.5, fontWeight: '700' }}>
                                            {cat.name}
                                          </Text>
                                          <Text style={{ color: '#94A3B8', fontSize: 11.5, marginTop: 2 }}>
                                            Código: {cat.code}
                                          </Text>
                                        </View>
                                        <Ionicons
                                          name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                                          size={20}
                                          color={isSelected ? primaryColor : '#64748B'}
                                        />
                                      </TouchableOpacity>
                                    );
                                  })}
                                </ScrollView>
                              </View>
                            </TouchableOpacity>
                          </Modal>
                        </>
                      )}
                    </View>
                  </View>

                  <View style={{ marginBottom: 24 }}>
                    <Text style={styles.inputLabel}>Dirección Física Exacta</Text>
                    <TextInput style={styles.formInput} placeholder="Ej: 1234 Main St, Suite 200" placeholderTextColor="#475569" value={address} onChangeText={text => setAddress(toTitleCase(text))} />
                  </View>

                  <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 16, marginBottom: 32 }}>
                    <View style={{ flex: 1.2 }}>
                      <Text style={[styles.inputLabel, { color: primaryColor }]}>1. Ingresa el Zip Code</Text>
                      <TextInput style={[styles.formInput, { borderColor: primaryColor, fontWeight: 'bold', fontSize: 18, textAlign: 'center' }]} placeholder="Ej: 91730" placeholderTextColor="#475569" keyboardType="numeric" value={zipCode} onChangeText={handleZipLookup} maxLength={5} />
                    </View>
                    <View style={{ flex: 1.2 }}>
                      <Text style={styles.inputLabel}>Ciudad (Auto)</Text>
                      <TextInput style={[styles.formInput, { backgroundColor: 'rgba(0,0,0,0.2)', color: '#94A3B8' }]} placeholder="Autocompletada" placeholderTextColor="#475569" value={city} editable={false} />
                    </View>
                    <View style={{ flex: 0.8 }}>
                      <Text style={styles.inputLabel}>Estado</Text>
                      <TextInput style={[styles.formInput, { backgroundColor: 'rgba(0,0,0,0.2)', color: '#94A3B8', textAlign: 'center' }]} placeholder="CA" placeholderTextColor="#475569" value={stateCode} editable={false} />
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 16 }}>
                    <TouchableOpacity style={[styles.secondaryButton, { flex: 1, flexDirection: 'row', gap: 8 }]} onPress={() => setStep(1)}>
                      <Feather name="arrow-left" size={16} color="#E2E8F0" />
                      <Text style={styles.secondaryButtonText}>Atrás</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.primaryButton, { flex: 2, backgroundColor: primaryColor, flexDirection: 'row', gap: 8 }]} onPress={handleNextStep}>
                      <Text style={styles.primaryButtonText}>Siguiente Paso</Text>
                      <Feather name="arrow-right" size={16} color="#FFF" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}

            {step === 3 && (
              <View style={styles.formContainer}>
                <Text style={styles.title}>Personaliza tu Portal</Text>
                <Text style={styles.subtitle}>Sube tu logotipo y elige tu color corporativo (Marca Blanca).</Text>
                
                <View style={styles.glassCard}>
                  <View style={{ marginBottom: 28 }}>
                    <Text style={styles.inputLabel}>Logotipo del Negocio</Text>
                    {Platform.OS === 'web' && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
                        {logoPreview ? (
                          <Image source={{ uri: logoPreview }} style={{ width: 64, height: 64, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }} />
                        ) : (
                          <View style={{ width: 64, height: 64, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.2)' }}>
                            <Feather name="image" size={24} color="#64748B" />
                          </View>
                        )}
                        <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', padding: '12px 20px', borderRadius: '12px', fontWeight: 'bold', fontSize: '14px', color: '#FFF' }}>
                          <Feather name="upload" size={15} color="#FFF" />
                          Seleccionar Archivo...
                          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageSelect} />
                        </label>
                      </View>
                    )}
                  </View>
                  
                  <View style={{ marginBottom: 32 }}>
                    <Text style={styles.inputLabel}>Elige tu Color Corporativo</Text>
                    <View style={{ flexDirection: 'row', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
                      {colorPalette.map((color, idx) => (
                        <TouchableOpacity 
                          key={idx}
                          //@ts-ignore
                          className="color-swatch"
                          style={{ 
                            alignItems: 'center', gap: 8, padding: 8, borderRadius: 12,
                            backgroundColor: primaryColor === color.value ? 'rgba(255,255,255,0.05)' : 'transparent',
                            borderWidth: 1, borderColor: primaryColor === color.value ? color.value : 'transparent'
                          }}
                          onPress={() => setPrimaryColor(color.value)}
                        >
                          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: color.value, borderWidth: 2, borderColor: primaryColor === color.value ? '#FFF' : 'transparent' }} />
                          <Text style={{ fontSize: 11, color: primaryColor === color.value ? '#FFF' : '#94A3B8', fontWeight: 'bold' }}>{color.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    
                    <View style={{ marginTop: 28, padding: 20, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', alignItems: 'center' }}>
                      <Text style={{ fontSize: 13, color: '#94A3B8', marginBottom: 12 }}>Vista previa de tus botones:</Text>
                      <TouchableOpacity style={[styles.primaryButton, { backgroundColor: primaryColor, width: '100%' }]} disabled>
                        <Text style={styles.primaryButtonText}>Agendar en {businessName || 'Mi Negocio'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 16 }}>
                    <TouchableOpacity style={[styles.secondaryButton, { flex: 1, flexDirection: 'row', gap: 8 }]} onPress={() => setStep(2)}>
                      <Feather name="arrow-left" size={16} color="#E2E8F0" />
                      <Text style={styles.secondaryButtonText}>Atrás</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.primaryButton, { flex: 2, backgroundColor: primaryColor, flexDirection: 'row', gap: 8 }]} onPress={handleNextStep}>
                      <Text style={styles.primaryButtonText}>Ver Planes</Text>
                      <Feather name="arrow-right" size={16} color="#FFF" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}

            {step === 4 && (
              <View style={{ width: '100%', alignItems: 'center' }}>
                <Text style={[styles.title, { textAlign: 'center' }]}>Desbloquea tu Potencial</Text>
                <Text style={[styles.subtitle, { textAlign: 'center', marginBottom: 24 }]}>
                  {cardPaymentsEnabled
                    ? 'Selecciona el plan que mejor se adapte a tu volumen operativo mensual y elige tu método de activación.'
                    : 'Selecciona el plan ideal para tu negocio y activa tu cuenta hoy ingresando tu código promocional VIP.'}
                </Text>

                {/* 💳 SELECTOR DE MÉTODO DE ACTIVACIÓN: CUPÓN PROMOCIONAL (+ TARJETA SI SUPERADMIN LA PRENDIÓ) */}
                <View style={[styles.glassCard, { width: '100%', maxWidth: 760, padding: isMobile ? 20 : 28, marginBottom: 32, borderColor: validatedPromoObj ? '#10B981' : 'rgba(255,255,255,0.12)' }]}>
                  <Text style={[styles.inputLabel, { marginBottom: 12, color: '#E2E8F0' }]}>
                    {cardPaymentsEnabled
                      ? '1. Elige cómo deseas activar tu cuenta hoy:'
                      : '1. Activa tu cuenta con tu Código Promocional:'}
                  </Text>

                  <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 12, marginBottom: (!cardPaymentsEnabled || paymentMethod === 'promo_code') ? 18 : 0 }}>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => setPaymentMethod('promo_code')}
                      style={{
                        flex: 1,
                        paddingVertical: 14,
                        paddingHorizontal: 16,
                        borderRadius: 14,
                        borderWidth: 1.5,
                        borderColor: (!cardPaymentsEnabled || paymentMethod === 'promo_code') ? '#10B981' : 'rgba(255,255,255,0.1)',
                        backgroundColor: (!cardPaymentsEnabled || paymentMethod === 'promo_code') ? 'rgba(16, 185, 129, 0.14)' : 'rgba(0,0,0,0.35)',
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10,
                      }}
                    >
                      <Ionicons
                        name={(!cardPaymentsEnabled || paymentMethod === 'promo_code') ? 'pricetag' : 'pricetag-outline'}
                        size={18}
                        color={(!cardPaymentsEnabled || paymentMethod === 'promo_code') ? '#10B981' : '#94A3B8'}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 14 }}>
                          🎟️ Tengo un Código Promocional
                        </Text>
                        <Text style={{ color: '#94A3B8', fontSize: 11.5, marginTop: 2 }}>
                          Activación inmediata con cupón válido
                        </Text>
                      </View>
                    </TouchableOpacity>

                    {cardPaymentsEnabled ? (
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => setPaymentMethod('card')}
                        style={{
                          flex: 1,
                          paddingVertical: 14,
                          paddingHorizontal: 16,
                          borderRadius: 14,
                          borderWidth: 1.5,
                          borderColor: paymentMethod === 'card' ? primaryColor : 'rgba(255,255,255,0.1)',
                          backgroundColor: paymentMethod === 'card' ? `${primaryColor}18` : 'rgba(0,0,0,0.35)',
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 10,
                        }}
                      >
                        <Feather
                          name="credit-card"
                          size={18}
                          color={paymentMethod === 'card' ? primaryColor : '#94A3B8'}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 14 }}>
                            💳 Suscripción Mensual Estándar
                          </Text>
                          <Text style={{ color: '#94A3B8', fontSize: 11.5, marginTop: 2 }}>
                            Facturación según el plan elegido abajo
                          </Text>
                        </View>
                      </TouchableOpacity>
                    ) : null}
                  </View>

                  {paymentMethod === 'promo_code' ? (
                    <View style={{ backgroundColor: 'rgba(0,0,0,0.4)', padding: 16, borderRadius: 14, borderWidth: 1, borderColor: validatedPromoObj ? '#10B981' : 'rgba(255,255,255,0.08)' }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <Text style={{ color: '#10B981', fontSize: 12, fontWeight: '900', textTransform: 'uppercase' }}>
                          Ingresa tu Cupón VIP (1 solo uso)
                        </Text>
                        {validatedPromoObj ? (
                          <Text style={{ color: '#10B981', fontSize: 12, fontWeight: '900' }}>
                            ✓ CUPÓN VÁLIDO Y DISPONIBLE
                          </Text>
                        ) : null}
                      </View>

                      <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 10 }}>
                        <TextInput
                          style={[
                            styles.formInput,
                            {
                              flex: 1,
                              height: 50,
                              fontWeight: '900',
                              letterSpacing: 1.5,
                              borderColor: validatedPromoObj ? '#10B981' : promoErrorMsg ? '#EF4444' : 'rgba(255,255,255,0.12)',
                            },
                          ]}
                          placeholder="Ej: PICKTIME-VIP"
                          placeholderTextColor="#64748B"
                          autoCapitalize="characters"
                          editable={!validatedPromoObj}
                          value={promoCodeInput}
                          onChangeText={(txt) => {
                            setPromoCodeInput(txt.toUpperCase());
                            setPromoErrorMsg('');
                          }}
                        />

                        {validatedPromoObj ? (
                          <TouchableOpacity
                            onPress={() => {
                              setValidatedPromoObj(null);
                              setPromoCodeInput('');
                            }}
                            style={{
                              backgroundColor: 'rgba(239, 68, 68, 0.16)',
                              borderWidth: 1,
                              borderColor: '#EF4444',
                              height: 50,
                              paddingHorizontal: 18,
                              borderRadius: 12,
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <Text style={{ color: '#EF4444', fontWeight: '900', fontSize: 13 }}>Cambiar Cupón</Text>
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity
                            activeOpacity={0.85}
                            onPress={handleValidatePromoCodeInStep4}
                            disabled={isValidatingPromo}
                            style={{
                              backgroundColor: '#10B981',
                              height: 50,
                              paddingHorizontal: 22,
                              borderRadius: 12,
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 8,
                            }}
                          >
                            {isValidatingPromo ? (
                              <ActivityIndicator color="#FFFFFF" size="small" />
                            ) : (
                              <>
                                <Feather name="check-circle" size={16} color="#FFFFFF" />
                                <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 14 }}>
                                  Validar Cupón
                                </Text>
                              </>
                            )}
                          </TouchableOpacity>
                        )}
                      </View>

                      {promoErrorMsg ? (
                        <Text style={{ color: '#EF4444', fontSize: 12.5, fontWeight: '700', marginTop: 8 }}>
                          {promoErrorMsg}
                        </Text>
                      ) : null}

                      {validatedPromoObj ? (
                        <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(16, 185, 129, 0.25)', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Ionicons name="checkmark-done-circle" size={18} color="#10B981" />
                          <Text style={{ color: '#E2E8F0', fontSize: 12.5, flex: 1 }}>
                            Código <Text style={{ color: '#10B981', fontWeight: '900' }}>{validatedPromoObj.code}</Text> verificado en <Text style={{ fontWeight: '700' }}>public.promo_codes</Text>. Al completar el registro quedará marcado como usado para tu negocio.
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </View>
                
                <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 24, width: '100%', justifyContent: 'center' }}>
                  {plans.map((plan, idx) => (
                    <TouchableOpacity 
                      key={idx}
                      //@ts-ignore
                      className={`pricing-card ${selectedPlan === plan.id ? 'selected' : ''}`}
                      style={[
                        styles.glassCard, 
                        { flex: 1, maxWidth: isMobile ? '100%' : 350, padding: 32, position: 'relative' },
                        selectedPlan === plan.id && { borderColor: primaryColor, backgroundColor: `${primaryColor}10` }
                      ]}
                      onPress={() => setSelectedPlan(plan.id)}
                      activeOpacity={0.8}
                    >
                      {plan.recommended && (
                        <View style={{ position: 'absolute', top: -12, alignSelf: 'center', backgroundColor: primaryColor, paddingVertical: 4, paddingHorizontal: 12, borderRadius: 12 }}>
                          <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' }}>Recomendado</Text>
                        </View>
                      )}
                      
                      <Text style={{ fontSize: 24, fontWeight: '800', color: '#FFF', marginBottom: 8 }}>{plan.name}</Text>
                      <Text style={{ color: '#94A3B8', fontSize: 14, marginBottom: 24, minHeight: 40 }}>{plan.desc}</Text>
                      
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 32, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.08)', paddingBottom: 24 }}>
                        <Text style={{ fontSize: 48, fontWeight: '900', color: selectedPlan === plan.id ? primaryColor : '#FFF' }}>{plan.price}</Text>
                        <Text style={{ color: '#94A3B8', fontSize: 16, fontWeight: 'bold' }}>/mes</Text>
                      </View>

                      <View style={{ gap: 16 }}>
                        {plan.features.map((feat, fidx) => (
                          <View key={fidx} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                            <View style={{ backgroundColor: 'rgba(16, 185, 129, 0.2)', borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
                              <Text style={{ color: '#10B981', fontSize: 12, fontWeight: 'bold' }}>✓</Text>
                            </View>
                            <Text style={{ color: '#E2E8F0', fontSize: 14 }}>{feat}</Text>
                          </View>
                        ))}
                      </View>
                      
                      <View style={{ marginTop: 40 }}>
                        <View style={[styles.secondaryButton, selectedPlan === plan.id && { backgroundColor: primaryColor, borderColor: primaryColor }]}>
                          <Text style={[styles.secondaryButtonText, selectedPlan === plan.id && { color: '#FFF' }]}>
                            {selectedPlan === plan.id ? 'Plan Seleccionado' : 'Elegir Plan'}
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 16, marginTop: 48, width: '100%', maxWidth: 600 }}>
                  <TouchableOpacity style={[styles.secondaryButton, { flex: 1, paddingVertical: 18, flexDirection: 'row', gap: 8 }]} onPress={() => setStep(3)}>
                    <Feather name="arrow-left" size={16} color="#E2E8F0" />
                    <Text style={styles.secondaryButtonText}>Revisar Marca</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.primaryButton, { flex: 2, paddingVertical: 18, backgroundColor: primaryColor, flexDirection: 'row', gap: 10 }]} onPress={handleFinalCheckoutAndStore} disabled={!selectedPlan || isSubmitting}>
                    <Feather name="check-circle" size={18} color="#FFF" />
                    <Text style={[styles.primaryButtonText, { fontSize: 16 }]}>{isSubmitting ? 'Registrando Negocio...' : 'Completar Registro y Guardar'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

          </View>
        )}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  topNavbar: {
    paddingTop: SAFE_TOP_INSET,
    height: (Platform.OS === 'web' ? 70 : 64) + SAFE_TOP_INSET,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Platform.OS === 'web' ? 40 : 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(5, 7, 12, 0.94)',
    zIndex: 100,
  },
  root: { flex: 1, backgroundColor: '#05070C' },
  header: {
    paddingTop: SAFE_TOP_INSET,
    height: (Platform.OS === 'web' ? 74 : 64) + SAFE_TOP_INSET,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Platform.OS === 'web' ? 40 : 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(5, 7, 12, 0.96)',
    zIndex: 100,
  },
  contentArea: { paddingHorizontal: Platform.OS === 'web' ? 40 : 20, paddingTop: 40, paddingBottom: 80, alignSelf: 'center', width: '100%', alignItems: 'center' },
  
  formContainer: { width: '100%', maxWidth: 600 },
  title: { fontSize: Platform.OS === 'web' ? 40 : 32, fontWeight: '900', color: '#FFFFFF', letterSpacing: -1, marginBottom: 12 },
  subtitle: { color: '#94A3B8', fontSize: 16, lineHeight: 24, marginBottom: 40 },
  
  progressBarBg: { height: 6, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 3, width: '100%', overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: 3 },
  stepText: { color: '#475569', fontSize: 13, fontWeight: 'bold' },
  stepTextActive: { color: '#FF5E00' },

  glassCard: { backgroundColor: 'rgba(18, 22, 28, 0.65)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)', borderRadius: 24, padding: 40, ...(Platform.OS === 'web' && { backdropFilter: 'blur(30px)' } as any) },
  inputLabel: { fontSize: 12, color: '#94A3B8', fontWeight: 'bold', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  formInput: { backgroundColor: 'rgba(0, 0, 0, 0.4)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', color: '#FFFFFF', borderRadius: 12, paddingHorizontal: 16, height: 56, fontSize: 16, ...(Platform.OS === 'web' && { outlineStyle: 'none' } as any) },
  
  passwordInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    height: 56,
    paddingLeft: 16,
    paddingRight: 12,
  },
  passwordInnerInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
    height: '100%',
    ...(Platform.OS === 'web' && { outlineStyle: 'none' } as any),
  },
  eyeButton: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  securityChecklistBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    gap: 6,
  },
  primaryButton: { backgroundColor: '#FF5E00', borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingVertical: 16 },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  secondaryButton: { backgroundColor: 'rgba(255,255,255,0.02)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingVertical: 16 },
  secondaryButtonText: { color: '#E2E8F0', fontWeight: '800', fontSize: 15 }
  
});