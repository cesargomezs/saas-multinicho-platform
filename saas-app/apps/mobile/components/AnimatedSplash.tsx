import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions, Easing, Image } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

interface AnimatedSplashProps {
  onAnimationFinish: () => void;
}

const SERVICES = [
  { name: 'content-cut', lib: 'MaterialCommunityIcons', color: '#FF6B6B', label: 'Barbería' },
  { name: 'spa', lib: 'MaterialCommunityIcons', color: '#4ECDC4', label: 'Spa' },
  { name: 'stethoscope', lib: 'MaterialCommunityIcons', color: '#45B7D1', label: 'Salud' },
  { name: 'sparkles', lib: 'Ionicons', color: '#F7B731', label: 'Belleza' },
  { name: 'paw', lib: 'Ionicons', color: '#A55EEA', label: 'Mascotas' },
];

export default function AnimatedSplash({ onAnimationFinish }: AnimatedSplashProps) {
  const calendarScale = useRef(new Animated.Value(0)).current;
  const calendarSplit = useRef(new Animated.Value(0)).current;
  const scissorsX = useRef(new Animated.Value(-width * 0.6)).current;
  const scissorsRotate = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.6)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const containerOpacity = useRef(new Animated.Value(1)).current;

  const serviceAnims = useRef(SERVICES.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    Animated.sequence([
      // 1. Aparece el calendario inicial
      Animated.spring(calendarScale, {
        toValue: 1,
        friction: 6,
        tension: 80,
        useNativeDriver: true,
      }),

      // 2. Pasan las tijeras cortando el calendario
      Animated.parallel([
        Animated.timing(scissorsX, {
          toValue: width * 0.6,
          duration: 650,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(scissorsRotate, { toValue: 1, duration: 150, useNativeDriver: true }),
          Animated.timing(scissorsRotate, { toValue: 0, duration: 150, useNativeDriver: true }),
          Animated.timing(scissorsRotate, { toValue: 1, duration: 150, useNativeDriver: true }),
          Animated.timing(scissorsRotate, { toValue: 0, duration: 150, useNativeDriver: true }),
        ]),
        Animated.timing(calendarSplit, {
          toValue: 1,
          duration: 500,
          delay: 200,
          useNativeDriver: true,
        }),
      ]),

      // 3. Aparece tu logo oficial logopick-time.jpg
      Animated.parallel([
        Animated.spring(logoScale, {
          toValue: 1,
          friction: 5,
          tension: 60,
          useNativeDriver: true,
        }),
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 350,
          useNativeDriver: true,
        }),
      ]),

      // 4. Salen los íconos de servicios en cascada debajo del logo
      Animated.stagger(
        100,
        serviceAnims.map((anim) =>
          Animated.spring(anim, {
            toValue: 1,
            friction: 5,
            tension: 70,
            useNativeDriver: true,
          })
        )
      ),

      // Pausa para lucir la marca
      Animated.delay(1000),

      // 5. Desvanece hacia la app
      Animated.timing(containerOpacity, {
        toValue: 0,
        duration: 450,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onAnimationFinish();
    });
  }, []);

  const calendarTranslateY = calendarSplit.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -25],
  });

  const calendarOpacity = calendarSplit.interpolate({
    inputRange: [0, 0.8, 1],
    outputRange: [1, 0.3, 0],
  });

  const spin = scissorsRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '-25deg'],
  });

  return (
    <Animated.View style={[styles.container, { opacity: containerOpacity }]} pointerEvents="auto">
      <View style={styles.centerStage}>
        {/* Calendario que es cortado */}
        <Animated.View
          style={[
            styles.calendarWrapper,
            {
              opacity: calendarOpacity,
              transform: [{ scale: calendarScale }, { translateY: calendarTranslateY }],
            },
          ]}
        >
          <Ionicons name="calendar" size={115} color="#00A8E8" />
          <View style={styles.cutLine} />
        </Animated.View>

        {/* Tijeras animadas */}
        <Animated.View
          style={[
            styles.scissorsWrapper,
            {
              transform: [{ translateX: scissorsX }, { rotate: spin }],
            },
          ]}
        >
          <Ionicons name="cut" size={68} color="#EF4444" />
        </Animated.View>

        {/* Tu Logo Oficial: logopick-time.jpg */}
        <Animated.View
          style={[
            styles.brandContainer,
            {
              opacity: logoOpacity,
              transform: [{ scale: logoScale }],
            },
          ]}
        >
          <Image
            source={require('../assets/images/logopick-time.jpg')}
            style={styles.logoImage}
            resizeMode="contain"
          />
        </Animated.View>
      </View>

      {/* Fila de íconos de servicios */}
      <View style={styles.servicesRow}>
        {SERVICES.map((item, idx) => {
          const translateY = serviceAnims[idx].interpolate({
            inputRange: [0, 1],
            outputRange: [40, 0],
          });

          return (
            <Animated.View
              key={idx}
              style={[
                styles.serviceItem,
                {
                  opacity: serviceAnims[idx],
                  transform: [{ scale: serviceAnims[idx] }, { translateY }],
                },
              ]}
            >
              <View style={[styles.iconCircle, { backgroundColor: item.color + '20' }]}>
                {item.lib === 'MaterialCommunityIcons' ? (
                  <MaterialCommunityIcons name={item.name as any} size={26} color={item.color} />
                ) : (
                  <Ionicons name={item.name as any} size={26} color={item.color} />
                )}
              </View>
              <Text style={styles.serviceLabel}>{item.label}</Text>
            </Animated.View>
          );
        })}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: width,
    height: height,
    backgroundColor: '#000000', // Fondo negro puro igual que logopick-time.jpg
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 99999,
    elevation: 99999,
  },
  centerStage: {
    justifyContent: 'center',
    alignItems: 'center',
    height: 260,
    width: '100%',
  },
  calendarWrapper: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cutLine: {
    position: 'absolute',
    width: 140,
    height: 3,
    backgroundColor: '#EF4444',
  },
  scissorsWrapper: {
    position: 'absolute',
    zIndex: 10,
  },
  brandContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImage: {
    width: width * 0.78,
    height: 220,
  },
  servicesRow: {
    flexDirection: 'row',
    marginTop: 24,
    gap: 16,
    paddingHorizontal: 20,
  },
  serviceItem: {
    alignItems: 'center',
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  serviceLabel: {
    fontSize: 11,
    color: '#CBD5E1',
    fontWeight: '600',
  },
});