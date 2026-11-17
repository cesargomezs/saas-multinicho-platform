// @ts-nocheck
import React, { useEffect, useState, useRef } from 'react';
import { View, Text, Image, StyleSheet, Animated, Easing, StatusBar, Dimensions } from 'react-native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

// Evita que Expo retenga la pantalla blanca nativa más de lo necesario
SplashScreen.preventAutoHideAsync().catch(() => {});

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function RootLayout() {
  const [showCustomSplash, setShowCustomSplash] = useState(true);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(0.88)).current;
  const scissorsAnim = useRef(new Animated.Value(-85)).current;
  const iconsAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // 1. Apagar el splash blanco de Expo Go apenas cargue el JS
    SplashScreen.hideAsync().catch(() => {});

    // 2. Animación del logo grande + tijeras cortando hacia el calendario + íconos de servicios
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 6,
        tension: 45,
        useNativeDriver: true,
      }),
      Animated.timing(scissorsAnim, {
        toValue: 85,
        duration: 1700,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(iconsAnim, {
        toValue: 1,
        duration: 900,
        delay: 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    // 3. Al terminar, desvanecer suavemente y dar paso al Stack principal
    const timer = setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start(() => {
        setShowCustomSplash(false);
      });
    }, 2600);

    return () => clearTimeout(timer);
  }, []);

  // 🔒 MIENTRAS CARGA: Pantalla negra 100% centrada con Logo Grande + Tijeras + Íconos de Servicios
  if (showCustomSplash) {
    return (
      <View style={styles.fullBlackScreen}>
        <StatusBar barStyle="light-content" />
        <Animated.View
          style={{
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 16,
            width: '100%',
          }}
        >
          {/* Contenedor del Logo Ampliado (recorta el exceso de borde negro y destaca el diseño) */}
          <View style={styles.logoContainer}>
            <Image
              source={require('../assets/images/logopicktime.jpg')}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>

          {/* Tijeras cortando la línea hacia el ícono de Calendario */}
          <View style={styles.cutLineWrapper}>
            <View style={styles.dashedLine} />
            <Animated.View style={[styles.scissorsBox, { transform: [{ translateX: scissorsAnim }] }]}>
              <Feather name="scissors" size={26} color="#FF5E00" />
            </Animated.View>
            <View style={styles.calendarEndBadge}>
              <Feather name="calendar" size={16} color="#FF5E00" />
            </View>
          </View>

          <Text style={styles.brandTitle}>
            PICK-TIME <Text style={{ color: '#FF5E00' }}>BOOK</Text>
          </Text>
          <Text style={styles.brandSub}>Agenda Digital en Tiempo Real</Text>

          {/* 🌟 ÍCONOS DE SERVICIOS Y AGENDA DEBAJO DEL TÍTULO 🌟 */}
          <Animated.View
            style={[
              styles.servicesIconsRow,
              {
                opacity: iconsAnim,
                transform: [
                  {
                    translateY: iconsAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [14, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={[styles.iconBadge, { borderColor: 'rgba(255, 94, 0, 0.45)', backgroundColor: 'rgba(255, 94, 0, 0.12)' }]}>
              <Feather name="calendar" size={18} color="#FF5E00" />
            </View>
            <View style={[styles.iconBadge, { borderColor: 'rgba(255, 94, 0, 0.45)', backgroundColor: 'rgba(255, 94, 0, 0.12)' }]}>
              <Feather name="scissors" size={18} color="#FF5E00" />
            </View>
            <View style={[styles.iconBadge, { borderColor: 'rgba(16, 185, 129, 0.45)', backgroundColor: 'rgba(16, 185, 129, 0.12)' }]}>
              <Ionicons name="sparkles-outline" size={18} color="#10B981" />
            </View>
            <View style={[styles.iconBadge, { borderColor: 'rgba(245, 158, 11, 0.45)', backgroundColor: 'rgba(245, 158, 11, 0.12)' }]}>
              <Ionicons name="car-sport-outline" size={19} color="#F59E0B" />
            </View>
            <View style={[styles.iconBadge, { borderColor: 'rgba(59, 130, 246, 0.45)', backgroundColor: 'rgba(59, 130, 246, 0.12)' }]}>
              <Feather name="shield" size={18} color="#3B82F6" />
            </View>
            <View style={[styles.iconBadge, { borderColor: 'rgba(6, 182, 212, 0.45)', backgroundColor: 'rgba(6, 182, 212, 0.12)' }]}>
              <MaterialCommunityIcons name="tooth-outline" size={19} color="#06B6D4" />
            </View>
          </Animated.View>
        </Animated.View>
      </View>
    );
  }

  // 🚀 UNA VEZ TERMINA EL SPLASH: Carga el Stack normal de la aplicación
  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#05070C' },
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#05070C',
  },
  fullBlackScreen: {
    flex: 1,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoContainer: {
    width: Math.min(SCREEN_WIDTH * 0.92, 360),
    height: 240,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 18,
  },
  logo: {
    width: '100%',
    height: '100%',
    transform: [{ scale: 1.45 }], // Amplía el gráfico central eliminando el margen negro vacío
  },
  cutLineWrapper: {
    width: 230,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    position: 'relative',
  },
  dashedLine: {
    width: '100%',
    height: 2,
    backgroundColor: 'rgba(255, 94, 0, 0.45)',
  },
  scissorsBox: {
    position: 'absolute',
    backgroundColor: '#000000',
    paddingHorizontal: 8,
  },
  calendarEndBadge: {
    position: 'absolute',
    right: -6,
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#0B0F17',
    borderWidth: 1,
    borderColor: '#FF5E00',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTitle: {
    color: '#FFFFFF',
    fontSize: 27,
    fontWeight: '900',
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  brandSub: {
    color: '#94A3B8',
    fontSize: 12.5,
    fontWeight: '700',
    marginTop: 6,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  servicesIconsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 26,
  },
  iconBadge: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});