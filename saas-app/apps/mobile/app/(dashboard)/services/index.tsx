import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, Platform, Modal, ActivityIndicator, Alert } from 'react-native';

// 🔌 Configuración de API
//const API_URL = Platform.OS === 'web' ? 'http://localhost:4000/api' : 'http://192.168.1.XX:4000/api';
const API_URL = process.env.EXPO_PUBLIC_API_URL;

// NOTA: Para esta prueba asumimos que tenemos el ID del negocio en sesión. 
// En producción, este ID vendrá del contexto de autenticación (Zustand/Context).
const MOCK_TENANT_ID = 'TU_TENANT_ID_AQUI'; 

interface ServiceItem {
  id: string;
  name: string;
  price: string;
  durationMinutes: number;
}

export default function CatalogManager() {
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Estados del Modal y Formulario
  const [isModalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formDuration, setFormDuration] = useState('30');

  // 1. Cargar servicios (GET)
  const fetchServices = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/directory/${MOCK_TENANT_ID}`);
      const json = await response.json();
      if (json.success && json.data.services) {
        setServices(json.data.services);
      }
    } catch (error) {
      console.error('Error cargando catálogo:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Al cargar la pantalla, traemos los servicios
    // fetchServices(); // Descomentar cuando el tenantId sea real
  }, []);

  // 2. Abrir Modal para Crear o Editar
  const openModal = (service?: ServiceItem) => {
    if (service) {
      setEditingId(service.id);
      setFormName(service.name);
      setFormPrice(String(service.price));
      setFormDuration(String(service.durationMinutes));
    } else {
      setEditingId(null);
      setFormName('');
      setFormPrice('');
      setFormDuration('30');
    }
    setModalVisible(true);
  };

  // 3. Guardar Servicio (POST / PUT) - Apuntando a la futura API
  const handleSave = async () => {
    if (!formName || !formPrice || !formDuration) {
      Alert.alert('Error', 'Todos los campos son obligatorios');
      return;
    }

    setIsSaving(true);
    
    // Aquí simulamos la acción para la UI. 
    // Próximo paso: Conectar esto al backend real.
    setTimeout(() => {
      if (editingId) {
        // Actualizar localmente
        setServices(prev => prev.map(s => s.id === editingId ? { id: editingId, name: formName, price: formPrice, durationMinutes: Number(formDuration) } : s));
      } else {
        // Crear localmente
        const newService = { id: Math.random().toString(), name: formName, price: formPrice, durationMinutes: Number(formDuration) };
        setServices(prev => [...prev, newService]);
      }
      setIsSaving(false);
      setModalVisible(false);
    }, 800);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Gestión de Catálogo</Text>
          <Text style={styles.subtitle}>Administra los servicios que ofreces a tus clientes.</Text>
        </View>
        <TouchableOpacity style={styles.primaryButton} onPress={() => openModal()}>
          <Text style={styles.primaryButtonText}>+ Nuevo Servicio</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.contentArea} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator size="large" color="#FF5E00" style={{ marginTop: 40 }} />
        ) : services.length > 0 ? (
          <View style={styles.grid}>
            {services.map(service => (
              <View key={service.id} style={styles.glassCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{service.name}</Text>
                  <Text style={styles.cardSubtitle}>⏱️ {service.durationMinutes} minutos</Text>
                </View>
                <View style={{ alignItems: 'flex-end', justifyContent: 'space-between' }}>
                  <Text style={styles.priceTag}>${Number(service.price).toFixed(2)}</Text>
                  <TouchableOpacity style={styles.editButton} onPress={() => openModal(service)}>
                    <Text style={styles.editButtonText}>Editar ✏️</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={{ fontSize: 48, marginBottom: 16 }}>📋</Text>
            <Text style={{ color: '#FFF', fontSize: 20, fontWeight: 'bold' }}>Tu catálogo está vacío</Text>
            <Text style={{ color: '#94A3B8', marginTop: 8 }}>Agrega tu primer servicio para que los clientes puedan agendar.</Text>
          </View>
        )}
      </ScrollView>

      {/* MODAL PARA CREAR / EDITAR */}
      <Modal visible={isModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editingId ? 'Editar Servicio' : 'Nuevo Servicio'}</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Nombre del Servicio</Text>
              <TextInput 
                style={styles.input} placeholder="Ej. Corte Clásico" placeholderTextColor="#475569"
                value={formName} onChangeText={setFormName}
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 16 }}>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.inputLabel}>Precio ($)</Text>
                <TextInput 
                  style={styles.input} placeholder="0.00" placeholderTextColor="#475569"
                  keyboardType="numeric" value={formPrice} onChangeText={setFormPrice}
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.inputLabel}>Duración (Min)</Text>
                <TextInput 
                  style={styles.input} placeholder="30" placeholderTextColor="#475569"
                  keyboardType="numeric" value={formDuration} onChangeText={setFormDuration}
                />
              </View>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setModalVisible(false)} disabled={isSaving}>
                <Text style={styles.cancelButtonText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={isSaving}>
                {isSaving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveButtonText}>Guardar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#05070C' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Platform.OS === 'web' ? 40 : 20, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)', flexWrap: 'wrap', gap: 16 },
  title: { fontSize: 32, fontWeight: '900', color: '#FFFFFF' },
  subtitle: { color: '#94A3B8', fontSize: 16, marginTop: 4 },
  
  contentArea: { padding: Platform.OS === 'web' ? 40 : 20 },
  grid: { gap: 16, width: '100%', maxWidth: 800, alignSelf: 'center' },
  
  glassCard: { flexDirection: 'row', backgroundColor: 'rgba(18, 22, 28, 0.65)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)', borderRadius: 20, padding: 24 },
  cardTitle: { fontSize: 20, fontWeight: 'bold', color: '#FFF', marginBottom: 8 },
  cardSubtitle: { fontSize: 15, color: '#94A3B8' },
  priceTag: { fontSize: 24, fontWeight: '900', color: '#FF5E00', marginBottom: 16 },
  
  primaryButton: { backgroundColor: '#FF5E00', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12 },
  primaryButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 15 },
  
  editButton: { backgroundColor: 'rgba(255,255,255,0.05)', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  editButtonText: { color: '#FFF', fontWeight: '600', fontSize: 13 },

  emptyState: { alignItems: 'center', justifyContent: 'center', padding: 60, backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', borderStyle: 'dashed' },

  // Estilos del Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: '#0F131A', width: '100%', maxWidth: 500, borderRadius: 24, padding: 32, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  modalTitle: { fontSize: 24, fontWeight: 'bold', color: '#FFF', marginBottom: 24 },
  
  inputGroup: { marginBottom: 20 },
  inputLabel: { fontSize: 13, color: '#94A3B8', fontWeight: 'bold', marginBottom: 8, textTransform: 'uppercase' },
  input: { backgroundColor: 'rgba(0, 0, 0, 0.3)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', color: '#FFFFFF', borderRadius: 12, paddingHorizontal: 16, height: 50, fontSize: 16, ...(Platform.OS === 'web' && { outlineStyle: 'none' } as any) },
  
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 12 },
  cancelButton: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12 },
  cancelButtonText: { color: '#94A3B8', fontWeight: 'bold', fontSize: 15 },
  saveButton: { backgroundColor: '#FF5E00', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, minWidth: 100, alignItems: 'center' },
  saveButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 15 },
});