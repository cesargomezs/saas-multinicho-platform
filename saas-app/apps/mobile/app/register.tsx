'use client';
import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, Platform, useWindowDimensions, Image, StatusBar, Modal, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
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
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.href = '/';
      return;
    }
    router.push('/' as any);
  };

  const handleCloseScreen = () => {
    if (isStarted) {
      setIsStarted(false);
      return;
    }
    if (showOwnerLoginCard) {
      setShowOwnerLoginCard(false);
      setMyOwnedTenants([]);
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

  // Paso 1: Cuenta & Seguridad
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [portalPin, setPortalPin] = useState('');
  const [showPortalPin, setShowPortalPin] = useState(false);
  const isPortalPinValid = /^\d{4,6}$/.test(portalPin.trim());

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
          }
        }
      } catch (error) {
        console.log("Error al autocompletar ZIP", error);
      }
    } else if (cleanZip.length < 5) {
      setCity('');
      setStateCode('');
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

  const handleNextStep = () => {
    if (step === 1) {
      const cleanEmail = email.trim();
      if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return alert('Por favor ingresa un correo electrónico comercial válido.');
      }
      if (!isPasswordStrong) {
        return alert('Tu contraseña debe tener al menos 8 caracteres, una letra mayúscula, un número y un carácter especial (ej: @, #, $, !).');
      }
      if (!passwordsMatch) {
        return alert('Las contraseñas no coinciden. Verifica la confirmación.');
      }
      if (!isPortalPinValid) {
        return alert('Ingresa un Código de Acceso para Empleados de 4 a 6 dígitos numéricos (ej: 4580). Tus empleados lo usarán para ver las citas y cerrar órdenes.');
      }
    }
    if (step === 2 && (!businessName || !category || !address || !city || !zipCode || !stateCode)) return alert('Completa todos los campos de ubicación.');
    setStep(step + 1);
  };

  const handleOwnerLogin = async () => {
    const cleanEmail = ownerLoginEmail.trim().toLowerCase();
    if (!cleanEmail || !ownerLoginPassword) {
      return alert('Por favor ingresa el correo administrador y la contraseña que creaste al registrar tu negocio.');
    }
    setIsLoggingInOwner(true);
    try {
      const API_URL =
        process.env.EXPO_PUBLIC_API_URL ||
        process.env.NEXT_PUBLIC_API_URL ||
        (Platform.OS === 'web' ? 'http://localhost:4000' : 'http://127.0.0.1:4000');

      const res = await fetch(`${API_URL.replace(/\/$/, '')}/api/tenants/owner-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, password: ownerLoginPassword }),
      });
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.tenants)) {
        setMyOwnedTenants(data.tenants);
      } else {
        alert(data.message || 'No encontramos negocios con esas credenciales.');
      }
    } catch (e: any) {
      alert('Error de conexión con el servidor al consultar tus negocios.');
    } finally {
      setIsLoggingInOwner(false);
    }
  };

  const handleFinalCheckoutAndStore = async () => {
    if (!selectedPlan) return alert('Por favor selecciona un plan para continuar.');
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
        logoUrl: uploadedLogoUrl, // ➔ URL completa enviada a la BD
        primaryColor,
        planTier: selectedPlan,
        subscriptionStatus: 'active',
        adminEmail: email,
        password,
        portalPin: portalPin.trim()
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
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }}
          onPress={goToDirectory}
        >
          <View style={{ backgroundColor: primaryColor, width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#FFF', fontWeight: '900', fontSize: 18 }}>A</Text>
          </View>
          <Text style={{ fontSize: 20, fontWeight: '900', color: '#FFF', letterSpacing: -0.5 }}>
            AutoFlow <Text style={{ color: '#94A3B8', fontWeight: 'normal', fontSize: 16 }}>/ Partners</Text>
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
          <View style={{ width: '100%', maxWidth: 800, alignSelf: 'center', alignItems: 'center', paddingTop: isMobile ? 28 : 56, paddingBottom: 60 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: `${primaryColor}50`, backgroundColor: `${primaryColor}15`, paddingVertical: 8, paddingHorizontal: 18, borderRadius: 20, marginBottom: 24 }}>
              <Feather name="trending-up" size={14} color={primaryColor} />
              <Text style={{ color: primaryColor, fontWeight: 'bold', fontSize: 13 }}>Únete a la Red de Negocios Líder</Text>
            </View>
            
            <Text style={{ fontSize: isMobile ? 34 : 52, fontWeight: '900', color: '#FFF', textAlign: 'center', marginBottom: 18, lineHeight: isMobile ? 42 : 60, letterSpacing: -1 }}>
              Digitaliza tu Negocio, Clínica o Firma Legal con <Text style={{ color: primaryColor }}>AutoFlow</Text>
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
                    borderColor: showOwnerLoginCard ? primaryColor : 'rgba(255,255,255,0.16)',
                    backgroundColor: showOwnerLoginCard ? `${primaryColor}14` : 'rgba(255,255,255,0.04)',
                  },
                ]} 
                onPress={() => setShowOwnerLoginCard((prev) => !prev)}
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

            {/* 🔐 TARJETA LIMPIA PARA ENTRAR A MIS NEGOCIOS CREADOS Y ABRIR SU PORTAL INTERNO */}
            {showOwnerLoginCard ? (
              <View style={[styles.glassCard, { width: '100%', maxWidth: 520, padding: isMobile ? 20 : 28, marginTop: 28, borderColor: 'rgba(255,255,255,0.14)' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 }}>
                  <ProIconBox family="Feather" name="shield" color={primaryColor} size={19} boxSize={40} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '900' }} numberOfLines={1}>
                      Acceso a Mis Negocios
                    </Text>
                    <Text style={{ color: '#94A3B8', fontSize: 12.5, marginTop: 2 }}>
                      Ingresa el correo y contraseña de tu cuenta administradora
                    </Text>
                  </View>
                </View>

                {myOwnedTenants.length === 0 ? (
                  <View>
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
                ) : (
                  <View style={{ gap: 14 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <Text style={{ color: '#10B981', fontWeight: '800', fontSize: 13 }}>
                        ✓ Selecciona tu negocio para abrir su Portal Interno:
                      </Text>
                      <TouchableOpacity
                        onPress={() => {
                          setMyOwnedTenants([]);
                          setOwnerLoginPassword('');
                        }}
                      >
                        <Text style={{ color: '#94A3B8', fontSize: 12, textDecorationLine: 'underline' }}>Salir</Text>
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
                            padding: 16,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 12,
                          }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                            <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: tColorBrand, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 18 }}>
                                {String(tItem.name || 'A').charAt(0).toUpperCase()}
                              </Text>
                            </View>
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '900' }} numberOfLines={1}>
                                {tItem.name}
                              </Text>
                              <Text style={{ color: '#94A3B8', fontSize: 12, marginTop: 2 }} numberOfLines={1}>
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
                  </View>
                )}
              </View>
            ) : null}
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
                <Text style={styles.subtitle}>Con estas credenciales protegerás el acceso al Portal Interno y caja de tu negocio.</Text>
                
                <View style={[styles.glassCard, isMobile && { padding: 24 }]}>
                  <View style={{ marginBottom: 22 }}>
                    <Text style={styles.inputLabel}>Correo Electrónico Comercial</Text>
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
                        opacity: isPasswordStrong && passwordsMatch && isPortalPinValid ? 1 : 0.85,
                      },
                    ]}
                    onPress={handleNextStep}
                  >
                    <Text style={styles.primaryButtonText}>Continuar</Text>
                    <Feather name="arrow-right" size={16} color="#FFF" />
                  </TouchableOpacity>
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
                <Text style={[styles.subtitle, { textAlign: 'center', marginBottom: 40 }]}>Selecciona el plan que mejor se adapte a tu volumen operativo mensual.</Text>
                
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