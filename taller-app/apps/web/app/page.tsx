'use client';
import React, { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';

// ⚙️ Configuración de Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://hboflqdubrtogwbuddsa.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'tu-anon-key';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ==========================================
// 🎨 FUNCIONES AUXILIARES DE UX
// ==========================================
const toTitleCase = (str: string) => str.replace(/\b\w/g, (match) => match.toUpperCase());
const formatCurrency = (value: string) => {
  const numbers = value.replace(/\D/g, '');
  if (!numbers) return '';
  return `$ ${Number(numbers).toLocaleString('en-US')}`;
};

// ==========================================
// 🔒 COMPONENTE LAZY LOAD PARA IMÁGENES PRIVADAS
// ==========================================
const PrivateSupabaseImage = ({ path, alt, isExpanded = false }: { path: string, alt: string, isExpanded?: boolean }) => {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchSignedUrl = async () => {
      if (!path) return;
      let cleanPath: string = path;
      if (path.includes('/public/autoflow/')) {
        const splitResult = path.split('/public/autoflow/')[1];
        if (splitResult) cleanPath = splitResult;
      } else if (!path.includes('/')) {
        cleanPath = path.startsWith('old') ? `old/${path}` : `new/${path}`;
      }
      const { data, error } = await supabase.storage.from('autoflow').createSignedUrl(cleanPath, 3600);
      if (error || !data?.signedUrl) setError(true);
      else setSignedUrl(data.signedUrl);
    };
    fetchSignedUrl();
  }, [path]);

  if (error) return <div style={{ fontSize: '14px', color: '#EF4444', fontStyle: 'italic', padding: '20px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '12px' }}>❌ Acceso denegado</div>;
  if (!signedUrl) return <div style={{ fontSize: '14px', color: 'var(--text-muted)', fontStyle: 'italic', padding: '40px', display: 'flex', justifyContent: 'center' }}>⏳ Desencriptando...</div>;
  return <img src={signedUrl} alt={alt} style={{ width: '100%', maxHeight: isExpanded ? '85vh' : '100%', objectFit: 'contain', borderRadius: '12px', boxShadow: isExpanded ? '0 25px 50px -12px rgba(0,0,0,0.5)' : 'none', background: '#000' }} />;
};

// ==========================================
// 🧩 INTERFACES DE TYPESCRIPT
// ==========================================
interface TenantInfo { id: string; name: string; businessType?: string; niche?: string; }
interface ServiceInfo { id: string; name: string; description: string | null; price: string; }
interface StaffInfo { id: string; name: string; role: string; isActive?: boolean; }
interface ReportItem {
  id: string; date: string; plate: string; clientName: string; service: string;
  mechanicId: string; mechanicName: string; cost: number; status: string;
}

export default function AutoFlowPlatform() {
  const [activeView, setActiveView] = useState<'servicios' | 'expediente' | 'mecanico'>('servicios');
  const [isDark, setIsDark] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tenantInfo, setTenantInfo] = useState<TenantInfo | null>(null);
  const [servicesList, setServicesList] = useState<ServiceInfo[]>([]);
  const [staffList, setStaffList] = useState<StaffInfo[]>([]);

  // 📝 Flujo Cliente
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [selectedServiceType, setSelectedServiceType] = useState('');
  const [selectedBookingStaff, setSelectedBookingStaff] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSearchingPlate, setIsSearchingPlate] = useState(false);
  const [isPlateSearched, setIsPlateSearched] = useState(false);
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [appointmentDate, setAppointmentDate] = useState('');
  const [appointmentTime, setAppointmentTime] = useState('');
  const [searchPlate, setSearchPlate] = useState('');
  const [carBrand, setCarBrand] = useState('');
  const [carModel, setCarModel] = useState('');
  const [carYear, setCarYear] = useState('');
  const [carMileage, setCarMileage] = useState('');
  const [quickNotes, setQuickNotes] = useState('');

  // 📋 Expediente
  const [expedienteQuery, setExpedienteQuery] = useState('');
  const [isSearchingExpediente, setIsSearchingExpediente] = useState(false);
  const [clientExpedienteData, setClientExpedienteData] = useState<any | null>(null);
  const [expandedImage, setExpandedImage] = useState<{ path: string, alt: string } | null>(null);

  // 🛠️ Portal Interno
  const [isMechanicAuth, setIsMechanicAuth] = useState(false);
  const [mechanicPin, setMechanicPin] = useState('');
  const [agendaFilter, setAgendaFilter] = useState<'today' | 'upcoming' | 'reports' | 'staff'>('today');
  const [todayOrders, setTodayOrders] = useState<any[]>([]);
  const [upcomingOrders, setUpcomingOrders] = useState<any[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  
  // 👥 Gestión de Personal
  const [newStaffName, setNewStaffName] = useState('');
  const [selectedStaffRole, setSelectedStaffRole] = useState('');
  const [customStaffRole, setCustomStaffRole] = useState('');

  // 📋 POS
  const [finalCost, setFinalCost] = useState('');
  const [exitMileage, setExitMileage] = useState('');
  const [oldParts, setOldParts] = useState('');
  const [newParts, setNewParts] = useState('');
  const [mechanicNotes, setMechanicNotes] = useState('');
  const [nextServiceTime, setNextServiceTime] = useState('');
  const [assignedMechanicId, setAssignedMechanicId] = useState('');
  
  const [oldPartImage, setOldPartImage] = useState<File | null>(null);
  const [oldPartPreview, setOldPartPreview] = useState<string | null>(null);
  const [newPartImage, setNewPartImage] = useState<File | null>(null);
  const [newPartPreview, setNewPartPreview] = useState<string | null>(null);

  // 📊 Módulo de Reportes Reales
  const defaultStart = new Date();
  defaultStart.setDate(defaultStart.getDate() - 30);
  const [reportStartDate, setReportStartDate] = useState<string>(defaultStart.toISOString().split('T')[0] || '');
  const [reportEndDate, setReportEndDate] = useState<string>(new Date().toISOString().split('T')[0] || '');
  const [reportMechanic, setReportMechanic] = useState('');
  const [reportPage, setReportPage] = useState(1);
  const [reportsData, setReportsData] = useState<ReportItem[]>([]); 
  const [isPrinting, setIsPrinting] = useState(false);
  const ITEMS_PER_PAGE = 10;

  const clientQuickServices = ['Cambio de Aceite', 'Revisión General', 'Frenos', 'Ruidos', 'Llantas'];
  const mechanicQuickNotes = ['Niveles OK', 'Frenos Desgastados', 'Fugas de Aceite', 'Requiere Alineación', 'Filtros Sucios'];
  const nextServiceOptions = ['3 Meses', '6 Meses', '1 Año', '5,000 Millas'];

  const saasDirectory = [
    { id: '123e4567-e89b-12d3-a456-426614174000', name: 'AutoFlow Central', type: 'automotive', label: 'Taller Automotriz', icon: '🚗' },
    { id: 'spa-demo-uuid-1234', name: 'Zen Beauty Spa', type: 'spa', label: 'Spa & Relajación', icon: '💆‍♀️' },
    { id: 'barber-demo-uuid-5678', name: 'Classic BarberShop', type: 'barbershop', label: 'Barbería Clásica', icon: '✂️' }
  ];

  const apiFetch = async (url: string, options: RequestInit = {}) => {
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000';
    const headers = { 'Content-Type': 'application/json', 'x-tenant-id': tenantId || '', ...(options.headers || {}) };
    return fetch(`${API_URL}${url}`, { ...options, headers });
  };

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 850) setIsSidebarOpen(false);
      else setIsSidebarOpen(true);
    };
    handleResize(); 
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleNavClick = (view: 'servicios' | 'expediente' | 'mecanico') => {
    setActiveView(view);
    if (window.innerWidth <= 850) setIsSidebarOpen(false);
  };

  useEffect(() => {
    if (!tenantId) return;
    setActiveView('servicios');
    const fetchTenantData = async () => {
      try {
        const resInfo = await apiFetch('/api/tenants/info');
        if (resInfo.ok) {
          const dataInfo = await resInfo.json();
          if (dataInfo.success) setTenantInfo(dataInfo.tenant);
        }
        const resServices = await apiFetch('/api/services');
        if (resServices.ok) {
          const dataServices = await resServices.json();
          if (dataServices.success && dataServices.services.length > 0) {
            setServicesList(dataServices.services);
            setSelectedServiceType(dataServices.services[0].id);
          }
        }
        const resStaff = await apiFetch('/api/staff');
        if (resStaff.ok) {
          const dataStaff = await resStaff.json();
          if (dataStaff.success) {
            const mappedStaff = dataStaff.staff.map((s: any) => ({ ...s, isActive: s.isActive ?? true }));
            setStaffList(mappedStaff);
          }
        } else {
          setStaffList([
            { id: 'stf-1', name: 'Admin Principal', role: 'Gerente / General', isActive: true },
            { id: 'stf-2', name: 'Andy Perez', role: 'Mecánico General', isActive: true }
          ]);
        }
      } catch (error) { 
        console.error("Error:", error); 
        setStaffList([{ id: 'stf-1', name: 'Personal (Demo)', role: 'General', isActive: true }]);
      }
    };
    fetchTenantData();
  }, [tenantId]);

  const isAutomotive = tenantInfo?.businessType === 'automotive' || tenantInfo?.niche === 'automotive';
  const isSpa = tenantInfo?.businessType === 'spa' || tenantInfo?.niche === 'spa';
  const isBarbershop = tenantInfo?.businessType === 'barbershop' || tenantInfo?.niche === 'barbershop';
  const staffTerm = isAutomotive ? 'Mecánico' : 'Profesional';

  const activeStaffList = useMemo(() => staffList.filter(s => s.isActive !== false), [staffList]);

  const availableRoles = useMemo(() => {
    if (isAutomotive) {
      return ['Mecánico General', 'Especialista en Frenos', 'Electricista Automotriz', 'Técnico de Suspensión y Llantas', 'Jefe de Taller'];
    } else if (isSpa) {
      return ['Masajista Profesional', 'Cosmetóloga', 'Esteticista', 'Terapeuta Corporal', 'Especialista en Spa'];
    } else if (isBarbershop) {
      return ['Barbero Senior', 'Estilista', 'Especialista en Barba', 'Colorista', 'Barbero Master'];
    }
    return ['Especialista', 'Técnico', 'Asistente', 'Gerente'];
  }, [isAutomotive, isSpa, isBarbershop]);

  const loadReports = async () => {
    try {
      const queryParams = new URLSearchParams({ startDate: reportStartDate, endDate: reportEndDate });
      if (reportMechanic) queryParams.append('mechanicId', reportMechanic);

      const res = await apiFetch(`/api/work-orders/reports?${queryParams.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) setReportsData(data.reports);
      }
    } catch (err) { console.error("Error cargando reportes", err); }
  };

  useEffect(() => {
    if (agendaFilter === 'reports') loadReports();
  }, [agendaFilter]);

  const paginatedReports = useMemo(() => {
    if (isPrinting) return reportsData;
    return reportsData.slice((reportPage - 1) * ITEMS_PER_PAGE, reportPage * ITEMS_PER_PAGE);
  }, [reportsData, reportPage, isPrinting]);

  const totalRevenue = useMemo(() => reportsData.reduce((acc, curr) => acc + curr.cost, 0), [reportsData]);
  const totalPages = Math.ceil(reportsData.length / ITEMS_PER_PAGE);

  const exportToCSV = () => {
    const headers = ["Fecha", "Identificador", "Cliente", "Servicio", "Personal", "Total Cobrado"];
    const csvRows = reportsData.map(r => `${r.date},${r.plate},${r.clientName},${r.service},${r.mechanicName},$${r.cost}`);
    const csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n" + csvRows.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Reporte_AutoFlow_${reportStartDate}_al_${reportEndDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToPDF = () => {
    setIsPrinting(true);
    setTimeout(() => {
      window.print();
      setIsPrinting(false);
    }, 800); 
  };

  const handleSearchExpediente = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expedienteQuery) return;
    setIsSearchingExpediente(true); setClientExpedienteData(null);
    try {
      const res = await apiFetch(`/api/clients/history/${expedienteQuery.trim()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) setClientExpedienteData(data); else alert('No se encontró historial.');
      }
    } catch (err) { alert('Error.'); } finally { setIsSearchingExpediente(false); }
  };

  const handleSearchVehicle = async () => {
    if (!searchPlate) return;
    setIsSearchingPlate(true);
    try {
      const res = await apiFetch(`/api/clients/vehicle/${searchPlate}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.vehicle) {
          setCarBrand(data.vehicle.brand || ''); setCarModel(data.vehicle.model || ''); 
          setCarYear(data.vehicle.year || ''); setCarMileage(data.vehicle.currentMileage || ''); 
          if (data.client) {
            setClientName(toTitleCase(data.client.name || '')); 
            setClientEmail(data.client.email || ''); 
            setClientPhone(data.client.phone ? data.client.phone.replace('+1 ', '') : '');
          }
          setIsPlateSearched(true);
        } else { setIsPlateSearched(true); }
      }
    } catch (error) { setIsPlateSearched(true); } finally { setIsSearchingPlate(false); }
  };

  const handleBookService = async (e: React.FormEvent) => {
    e.preventDefault(); setIsSubmitting(true);
    try {
      const combinedDateTime = appointmentDate && appointmentTime ? `${appointmentDate}T${appointmentTime}:00Z` : new Date().toISOString();
      const metadata = isAutomotive ? { carPlate: searchPlate, carBrand, carModel, carYear, carMileage } : {};
      const formattedPhone = clientPhone.startsWith('+1') ? clientPhone : `+1 ${clientPhone.trim()}`;

      const response = await apiFetch('/api/appointments', {
        method: 'POST',
        body: JSON.stringify({ 
          clientName: toTitleCase(clientName), 
          clientEmail, 
          clientPhone: formattedPhone, 
          serviceId: selectedServiceType, 
          staffId: selectedBookingStaff || null, 
          appointmentDate: combinedDateTime, 
          notes: quickNotes, 
          metadata 
        }),
      });
      if (response.ok) {
        alert(`¡Cita confirmada!`);
        setIsBookingModalOpen(false); setIsPlateSearched(false);
      }
    } catch (error) { alert('Error.'); } finally { setIsSubmitting(false); }
  };

  const handleMechanicLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mechanicPin === '1234') { setIsMechanicAuth(true); fetchAgendaData(); } else alert('PIN Incorrecto');
  };

  const fetchAgendaData = async () => {
    try {
      const resToday = await apiFetch('/api/appointments/today');
      if (resToday.ok) { const data = await resToday.json(); if (data.success) setTodayOrders(data.appointments); }
      
      const resUpcoming = await apiFetch('/api/appointments/upcoming?filter=upcoming');
      if (resUpcoming.ok) { const data = await resUpcoming.json(); if (data.success) setUpcomingOrders(data.appointments); }
    } catch (err) { console.error("Error agenda:", err); }
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaffName || (!selectedStaffRole && !customStaffRole)) return;
    
    const formattedName = toTitleCase(newStaffName.trim());
    const finalRole = selectedStaffRole === 'custom' ? toTitleCase(customStaffRole.trim()) : selectedStaffRole;
    
    try {
      const res = await apiFetch('/api/staff', {
        method: 'POST',
        body: JSON.stringify({ name: formattedName, role: finalRole })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setStaffList([...staffList, { ...data.member, isActive: true }]);
        } else {
          setStaffList([...staffList, { id: `stf-${Date.now()}`, name: formattedName, role: finalRole, isActive: true }]);
        }
      } else {
        setStaffList([...staffList, { id: `stf-${Date.now()}`, name: formattedName, role: finalRole, isActive: true }]);
      }
    } catch (err) {
      setStaffList([...staffList, { id: `stf-${Date.now()}`, name: formattedName, role: finalRole, isActive: true }]);
    }
    
    setNewStaffName(''); setSelectedStaffRole(''); setCustomStaffRole('');
    alert(`✅ ${formattedName} agregado exitosamente.`);
  };

  // 🔄 ALTERNAR ESTADO ACTIVO / INACTIVO CON PERSISTENCIA REAL
  const toggleStaffStatus = async (id: string, currentStatus: boolean) => {
    try {
      const nextStatus = !currentStatus;
      const res = await apiFetch(`/api/staff/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive: nextStatus })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setStaffList(staffList.map(s => s.id === id ? { ...s, isActive: nextStatus } : s));
        } else {
          setStaffList(staffList.map(s => s.id === id ? { ...s, isActive: nextStatus } : s));
        }
      } else {
        setStaffList(staffList.map(s => s.id === id ? { ...s, isActive: nextStatus } : s));
      }
    } catch (err) {
      console.error("Error al cambiar estado:", err);
      setStaffList(staffList.map(s => s.id === id ? { ...s, isActive: !currentStatus } : s));
    }
  };

  const convertImageToWebp = (file: File): Promise<File> => { 
    return new Promise((resolve, reject) => {
      const reader = new FileReader(); reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image(); img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas'); let width = img.width; let height = img.height;
          if (width > height) { if (width > 1200) { height = Math.round((height *= 1200 / width)); width = 1200; } } else { if (height > 1200) { width = Math.round((width *= 1200 / height)); height = 1200; } }
          canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d'); ctx?.drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => {
              if (!blob) return reject(new Error('Fallo'));
              resolve(new File([blob], `${file.name.substring(0, file.name.lastIndexOf('.')) || file.name}.webp`, { type: 'image/webp' }));
            }, 'image/webp', 0.8);
        }; img.onerror = (error) => reject(error);
      }; reader.onerror = (error) => reject(error);
    });
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'old' | 'new') => {
    if (e.target.files && e.target.files[0]) {
      const rawFile = e.target.files[0];
      try {
        const webpFile = await convertImageToWebp(rawFile);
        const url = URL.createObjectURL(webpFile);
        if (type === 'old') { setOldPartImage(webpFile); setOldPartPreview(url); } else { setNewPartImage(webpFile); setNewPartPreview(url); }
      } catch (err) { alert('Error imagen.'); }
    }
  };

  const uploadImageToSupabase = async (file: File, folderName: 'old' | 'new') => {
    try {
      const fileName = `${folderName}-${Date.now()}.webp`; const filePath = `${folderName}/${fileName}`;
      const { error } = await supabase.storage.from('autoflow').upload(filePath, file, { upsert: true, contentType: 'image/webp' });
      return error ? null : filePath; 
    } catch (err) { return null; }
  };

  const handleCompleteWorkOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignedMechanicId) { alert("Asigne al personal responsable."); return; }
    setIsSubmitting(true);
    try {
      let oldImageUrl = await (oldPartImage ? uploadImageToSupabase(oldPartImage, 'old') : null);
      let newImageUrl = await (newPartImage ? uploadImageToSupabase(newPartImage, 'new') : null);
      const cleanCost = finalCost.replace(/[^0-9.]/g, '');

      const payload = {
        finalCost: cleanCost, exitMileage, oldParts, newParts, mechanicNotes, nextServiceDate: nextServiceTime,
        oldPartImageUrl: oldImageUrl, newPartImageUrl: newImageUrl, staffId: assignedMechanicId
      };

      await apiFetch(`/api/appointments/${selectedOrder.id}/complete`, { method: 'PUT', body: JSON.stringify(payload) });
      alert('✅ Orden cerrada con éxito.');
      setSelectedOrder(null); fetchAgendaData();
    } catch (error) { alert('Error.'); } finally { setIsSubmitting(false); }
  };

  const getDynamicTheme = () => {
    if (!tenantInfo) return { bg: 'url("https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=2000&auto=format&fit=crop")', accent: '#3B82F6', glow: 'rgba(59, 130, 246, 0.4)' };
    if (isAutomotive) return { bg: 'url("/Gemini_Generated_Image_exx9q8exx9q8exx9.jpg")', accent: '#FF5E00', glow: 'rgba(255, 94, 0, 0.4)' };
    return { bg: 'url("https://images.unsplash.com/photo-1540555700478-4be289fbecef?q=80&w=2000&auto=format&fit=crop")', accent: '#10B981', glow: 'rgba(16, 185, 129, 0.4)' };
  };

  const themeConfig = getDynamicTheme();
  const activeOrdersList = agendaFilter === 'today' ? todayOrders : upcomingOrders;

  return (
    <div className="app-container" data-theme={isDark ? 'dark' : 'light'}>
      <style dangerouslySetInnerHTML={{__html: `
        [data-theme="dark"] {
          color-scheme: dark; --overlay-top: rgba(5, 7, 12, 0.75); --overlay-bottom: rgba(5, 7, 12, 0.95);
          --bg-sidebar: rgba(10, 12, 16, 0.85); --bg-card: rgba(18, 22, 28, 0.65); --bg-card-hover: rgba(24, 28, 36, 0.85);
          --border: rgba(255, 255, 255, 0.08); --text-main: #FFFFFF; --text-muted: #94A3B8; --input-bg: rgba(0, 0, 0, 0.3);
        }
        [data-theme="light"] {
          color-scheme: light; --overlay-top: rgba(248, 250, 252, 0.85); --overlay-bottom: rgba(248, 250, 252, 0.98);
          --bg-sidebar: rgba(255, 255, 255, 0.9); --bg-card: rgba(255, 255, 255, 0.75); --bg-card-hover: rgba(255, 255, 255, 1);
          --border: rgba(15, 23, 42, 0.1); --text-main: #0F172A; --text-muted: #475569; --input-bg: rgba(15, 23, 42, 0.05);
        }
        :root { --accent: ${themeConfig.accent}; --accent-glow: ${themeConfig.glow}; }
        * { box-sizing: border-box; font-family: 'Inter', system-ui, sans-serif; transition: background-color 0.3s ease, border-color 0.3s ease, color 0.3s ease; }
        body { margin: 0; padding: 0; background-color: #000; overflow-x: hidden; }
        
        .app-container { display: flex; min-height: 100vh; width: 100vw; background-image: linear-gradient(to bottom, var(--overlay-top), var(--overlay-bottom)), ${themeConfig.bg}; background-size: cover; background-position: center; background-attachment: fixed; color: var(--text-main); }
        .sidebar { width: ${isSidebarOpen ? '260px' : '80px'}; background: var(--bg-sidebar); backdrop-filter: blur(25px); border-right: 1px solid var(--border); display: flex; flex-direction: column; flex-shrink: 0; transition: width 0.4s cubic-bezier(0.2, 0.8, 0.2, 1); z-index: 100; }
        .sidebar-header { height: 80px; display: flex; align-items: center; padding: 0 20px; border-bottom: 1px solid var(--border); justify-content: ${isSidebarOpen ? 'space-between' : 'center'}; }
        
        .brand { cursor: pointer; display: flex; align-items: center; }
        .brand-text-full { display: ${isSidebarOpen ? 'inline-flex' : 'none'}; font-weight: 900; font-size: 20px; align-items: center; gap: 8px; white-space: nowrap; overflow: hidden; }
        .brand-text-full span { color: var(--accent); }
        .brand-text-short { display: ${isSidebarOpen ? 'none' : 'inline-flex'}; font-weight: 900; font-size: 24px; color: var(--text-main); }
        
        .toggle-btn { background: transparent; border: none; color: var(--text-muted); cursor: pointer; font-size: 20px; padding: 5px; }
        
        .nav-menu { padding: 24px 12px; display: flex; flex-direction: column; gap: 8px; flex-grow: 1; }
        .nav-item { display: flex; align-items: center; gap: 14px; padding: 14px 16px; border-radius: 12px; color: var(--text-muted); font-weight: 700; font-size: 14.5px; cursor: pointer; border: 1px solid transparent; background: transparent; transition: all 0.2s; white-space: nowrap; overflow: hidden; }
        .nav-item:hover { background: var(--bg-card); color: var(--text-main); }
        .nav-item.active { background: var(--bg-card-hover); color: var(--text-main); border: 1px solid var(--border); box-shadow: 0 8px 20px rgba(0,0,0,0.1); }
        .nav-icon { font-size: 18px; flex-shrink: 0; display: flex; justify-content: center; width: 24px; }
        .nav-item.active .nav-icon { color: var(--accent); }
        .sidebar-footer { padding: 20px 16px; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 12px; }
        
        .main-content { flex-grow: 1; display: flex; flex-direction: column; height: 100vh; overflow-y: auto; }
        .top-bar { height: 80px; padding: 0 40px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border); background: transparent; }
        .content-area { padding: 40px; max-width: 1200px; margin: 0 auto; width: 100%; display: flex; flex-direction: column; gap: 40px; }
        
        .glass-card { background: var(--bg-card); backdrop-filter: blur(30px); border: 1px solid var(--border); border-radius: 24px; padding: 32px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); position: relative; }
        .interactive-card { cursor: pointer; transition: transform 0.3s, border-color 0.3s; }
        .interactive-card:hover { transform: translateY(-5px); border-color: var(--accent); background: var(--bg-card-hover); }
        
        .btn-primary { background: var(--accent); color: #fff; border: none; padding: 14px 24px; border-radius: 12px; font-size: 14.5px; font-weight: 800; cursor: pointer; box-shadow: 0 8px 20px var(--accent-glow); transition: all 0.2s; display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
        .btn-primary:hover:not(:disabled) { filter: brightness(1.1); transform: translateY(-2px); box-shadow: 0 12px 25px var(--accent-glow); }
        .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
        
        .btn-secondary { background: var(--input-bg); color: var(--text-main); border: 1px solid var(--border); padding: 14px 24px; border-radius: 12px; font-size: 14.5px; font-weight: 800; cursor: pointer; transition: all 0.2s; display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
        .btn-secondary:hover { border-color: var(--accent); color: var(--accent); background: rgba(255,255,255,0.05); }
        .btn-secondary.active { background: var(--accent); color: white; border-color: var(--accent); }
        
        .form-input, .form-select { background: var(--input-bg); border: 1px solid var(--border); color: var(--text-main); padding: 14px 16px; border-radius: 12px; width: 100%; font-size: 14.5px; outline: none; transition: all 0.2s; }
        .form-input:focus, .form-select:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-glow); }
        
        .bento-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 24px; }
        .badge { background: var(--border); color: var(--text-main); padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; }
        
        .reports-filters { display: flex; gap: 16px; flex-wrap: wrap; align-items: flex-end; margin-bottom: 24px; padding: 20px; }
        .filter-group { flex: 1; min-width: 150px; }
        .export-group { display: flex; gap: 12px; margin-left: auto; }
        .btn-search { height: 48px; padding: 0 24px; }

        .table-responsive { overflow-x: auto; -webkit-overflow-scrolling: touch; width: 100%; margin-top: 16px; }
        .glass-table { width: 100%; border-collapse: collapse; min-width: 800px; }
        .glass-table th, .glass-table td { white-space: nowrap; padding: 16px; text-align: left; }
        .glass-table th { border-bottom: 2px solid var(--border); color: var(--accent); font-size: 13px; font-weight: 900; text-transform: uppercase; }
        .glass-table td { border-bottom: 1px solid var(--border); font-size: 14.5px; font-weight: 500; }
        .glass-table tr:hover td { background: rgba(255,255,255,0.02); }
        
        @media (max-width: 850px) {
          .app-container { flex-direction: column; }
          .sidebar { 
            width: 100% !important; height: auto; position: sticky; top: 0; z-index: 2000; 
            border-right: none; border-bottom: 1px solid var(--border); background: var(--bg-sidebar); box-shadow: 0 10px 30px rgba(0,0,0,0.3);
          }
          .sidebar-header { justify-content: space-between !important; width: 100%; }
          .brand-text-full { display: inline-flex !important; }
          .brand-text-short { display: none !important; }
          
          .nav-menu { display: ${isSidebarOpen ? 'flex' : 'none'}; padding: 16px; }
          .sidebar-footer { display: ${isSidebarOpen ? 'flex' : 'none'}; flex-direction: row; flex-wrap: wrap; justify-content: space-between; padding: 16px; }
          
          .main-content { height: auto; overflow-y: visible; }
          .top-bar { padding: 15px 20px; height: auto; min-height: 60px; flex-wrap: wrap; gap: 10px; justify-content: center; }
          .content-area { padding: 20px; gap: 24px; }
          
          .bento-grid { grid-template-columns: 1fr; }
          .glass-card { padding: 20px; }
          .order-card { padding: 20px; }
          .form-input, .form-select, .btn-primary, .btn-secondary { font-size: 14px; padding: 14px; }
          
          .reports-filters { flex-direction: column; align-items: stretch; gap: 16px; }
          .filter-group { min-width: 100%; width: 100%; }
          .export-group { margin-left: 0; width: 100%; flex-direction: column; }
          .export-group button { width: 100%; margin: 0; }
          .btn-search { width: 100%; }
          
          .modal-content { padding: 24px 20px; width: 95%; }
        }
        
        @media print {
          .sidebar, .top-bar, .modal-overlay, .no-print { display: none !important; }
          @page { margin: 1.5cm; size: landscape; }
          body { background: white !important; color: black !important; }
          .app-container { background: white !important; color: black !important; display: block !important; }
          .main-content { margin: 0 !important; padding: 0 !important; height: auto !important; overflow: visible !important; }
          .glass-card { background: none !important; box-shadow: none !important; border: none !important; padding: 0 !important; }
          .table-responsive { overflow: visible !important; }
          .glass-table { width: 100% !important; border-collapse: collapse !important; margin-top: 20px !important; min-width: auto !important; }
          .glass-table th { color: black !important; border-bottom: 2px solid black !important; background: #f8f9fa !important; -webkit-print-color-adjust: exact; padding: 12px !important; font-size: 12px !important; }
          .glass-table td { border-bottom: 1px solid #ddd !important; padding: 10px !important; color: black !important; font-size: 12px !important; }
          .badge { background: none !important; color: black !important; padding: 0 !important; font-weight: bold !important; border: 1px solid #000; padding: 2px 6px !important; border-radius: 4px; }
          .print-only-header { display: flex !important; flex-direction: column !important; align-items: center !important; margin-bottom: 20px !important; border-bottom: 2px solid black !important; padding-bottom: 20px !important; }
          .print-only-header img { height: 60px !important; margin-bottom: 10px !important; }
          h1, h2, h3, h4, p, td, th { color: black !important; }
        }

        .modal-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.85); backdrop-filter: blur(12px); display: flex; justify-content: center; align-items: center; z-index: 1000; padding: 20px; overflow-y: auto; }
        .modal-content { background: var(--bg-sidebar); border: 1px solid var(--border); border-radius: 24px; padding: 32px; width: 100%; max-width: 650px; max-height: 90vh; overflow-y: auto; position: relative; margin: auto; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); }
        .close-btn { position: absolute; top: 24px; right: 24px; background: var(--input-bg); border: none; color: var(--text-muted); width: 32px; height: 32px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
        .close-btn:hover { background: var(--accent); color: white; }
        
        .order-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 16px; padding: 24px; display: flex; flex-direction: column; gap: 16px; transition: border-color 0.3s; }
        .order-card:hover { border-color: var(--accent); }
        .order-header { display: flex; justify-content: space-between; align-items: center; }
        .order-plate { background: var(--accent); color: white; padding: 6px 12px; border-radius: 8px; font-weight: 900; font-size: 16px; letter-spacing: 1.5px; box-shadow: 0 4px 10px var(--accent-glow); }
        .order-status { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; background: rgba(255,255,255,0.1); border-radius: 12px; font-size: 12px; font-weight: bold; }
        
        .img-preview-box { position: relative; width: 100%; height: 120px; border-radius: 12px; overflow: hidden; border: 1px solid var(--border); margin-top: 8px; background: #000; display: flex; align-items: center; justify-content: center; }
        .img-preview-box img { width: 100%; height: 100%; object-fit: cover; }
        .remove-img-btn { position: absolute; top: 6px; right: 6px; background: rgba(0,0,0,0.7); color: white; border: 1px solid rgba(255,255,255,0.2); border-radius: 50%; width: 28px; height: 28px; font-size: 14px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s; }
        .remove-img-btn:hover { background: #EF4444; border-color: #EF4444; }
        .upload-btn-label { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 14px; border: 2px dashed var(--border); border-radius: 12px; background: rgba(255,255,255,0.02); color: var(--text-muted); font-size: 13px; font-weight: bold; cursor: pointer; transition: 0.2s; margin-top: 8px; }
        .upload-btn-label:hover { border-color: var(--accent); color: var(--accent); background: rgba(255,255,255,0.05); }
      `}} />

      {/* Menú Lateral */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="brand" onClick={() => setTenantId(null)}>
            <span className="brand-text-full">
              {tenantInfo ? tenantInfo.name.split(' ')[0] : 'SaaS'}
              <span>{tenantInfo ? (tenantInfo.name.split(' ')[1] || 'App') : 'PORTAL'}</span>
            </span>
            <span className="brand-text-short">
              {tenantInfo ? tenantInfo.name.charAt(0) : 'S'}
            </span>
          </div>
          <button className="toggle-btn" onClick={() => setIsSidebarOpen(!isSidebarOpen)} style={{ transform: isSidebarOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.3s' }}>
            {isSidebarOpen ? '✖' : '☰'}
          </button>
        </div>

        <nav className="nav-menu">
          {tenantId ? (
            <>
              <button className={`nav-item ${activeView === 'servicios' ? 'active' : ''}`} onClick={() => handleNavClick('servicios')}><span className="nav-icon">✨</span> {isSidebarOpen && 'Catálogo & Reservas'}</button>
              <button className={`nav-item ${activeView === 'expediente' ? 'active' : ''}`} onClick={() => handleNavClick('expediente')}><span className="nav-icon">📋</span> {isSidebarOpen && 'Expediente Cliente'}</button>
              <button className={`nav-item ${activeView === 'mecanico' ? 'active' : ''}`} onClick={() => handleNavClick('mecanico')}><span className="nav-icon">⚙️</span> {isSidebarOpen && 'Portal Interno'}</button>
            </>
          ) : (
            <div style={{ padding: '0 16px', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 'bold' }}>{isSidebarOpen && 'SELECCIONA UN NEGOCIO'}</div>
          )}
        </nav>
        <div className="sidebar-footer">
          {tenantId && isSidebarOpen && <button onClick={() => { setTenantId(null); if (window.innerWidth <= 850) setIsSidebarOpen(false); }} className="btn-primary" style={{ background: 'var(--input-bg)', color: 'var(--text-main)', boxShadow: 'none' }}>🔙 Salir</button>}
          <button onClick={() => { setIsDark(!isDark); if (window.innerWidth <= 850) setIsSidebarOpen(false); }} className="nav-item" style={{ justifyContent: isSidebarOpen ? 'flex-start' : 'center', width: 'auto' }}><span className="nav-icon">{isDark ? '☀️' : '🌙'}</span>{isSidebarOpen && (isDark ? 'Modo Claro' : 'Modo Oscuro')}</button>
        </div>
      </aside>

      {/* Contenido Principal */}
      <main className="main-content">
        <header className="top-bar no-print">
          <div><span className="badge">{tenantId ? ((tenantInfo?.businessType || tenantInfo?.niche)?.toUpperCase() || 'SAAS') : 'DIRECTORIO GLOBAL'}</span></div>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
             <span style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{new Date().toLocaleDateString('es-ES', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
          </div>
        </header>

        <div className="content-area">
          {!tenantId ? (
            <div style={{ padding: '20px 0' }}>
              <h1 style={{ fontSize: 'clamp(32px, 4vw, 48px)', fontWeight: '900', letterSpacing: '-1px', margin: '0 0 16px 0' }}>Ecosistema de <span style={{ color: 'var(--accent)' }}>Negocios</span></h1>
              <p style={{ color: 'var(--text-muted)', fontSize: '16px', maxWidth: '600px', lineHeight: '1.6', marginBottom: '48px' }}>Selecciona una de las sucursales afiliadas para cargar su interfaz y catálogo dinámico.</p>
              <div className="bento-grid">
                {saasDirectory.map(biz => (
                  <div key={biz.id} className="glass-card interactive-card" onClick={() => { setTenantId(biz.id); if (window.innerWidth <= 850) setIsSidebarOpen(false); }}>
                    <div style={{ fontSize: '48px', marginBottom: '20px' }}>{biz.icon}</div>
                    <h3 style={{ margin: '0 0 8px 0', fontSize: '22px', fontWeight: '800' }}>{biz.name}</h3>
                    <p style={{ margin: '0', fontSize: '14px', color: 'var(--text-muted)' }}>Plataforma para {biz.label}</p>
                    <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}><span style={{ color: 'var(--accent)', fontWeight: 'bold', fontSize: '14px' }}>Entrar →</span></div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* VISTA 1: SERVICIOS */}
              {activeView === 'servicios' && (
                <div style={{ animation: 'fadeIn 0.5s ease-in-out' }}>
                  <div style={{ marginBottom: '48px' }}>
                    <h1 style={{ fontSize: 'clamp(32px, 4vw, 48px)', fontWeight: '900', letterSpacing: '-1px', margin: '0 0 16px 0' }}>Servicios <span style={{ color: 'var(--accent)' }}>Premium</span></h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '16px', maxWidth: '600px', lineHeight: '1.6' }}>Reserva tu cita en línea en tiempo real.</p>
                  </div>
                  <div className="bento-grid">
                    {servicesList.length > 0 ? servicesList.map(srv => (
                      <div key={srv.id} className="glass-card interactive-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                        <div>
                          <h3 style={{ margin: '0 0 12px 0', fontSize: '20px', fontWeight: '800' }}>{srv.name}</h3>
                          <p style={{ margin: '0 0 24px 0', fontSize: '14.5px', color: 'var(--text-muted)', lineHeight: '1.5' }}>{srv.description || 'Servicio especializado con altos estándares de calidad.'}</p>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
                          <strong style={{ fontSize: '24px', fontWeight: '900', color: 'var(--accent)' }}>${srv.price}</strong>
                          <button className="btn-primary" onClick={() => { setSelectedServiceType(srv.id); setIsBookingModalOpen(true); setIsPlateSearched(false); }}>Reservar Cita</button>
                        </div>
                      </div>
                    )) : (<div className="glass-card"><p style={{fontWeight: 'bold', textAlign:'center'}}>Cargando catálogo...</p></div>)}
                  </div>
                </div>
              )}
              
              {/* VISTA 2: EXPEDIENTE DEL CLIENTE */}
              {activeView === 'expediente' && (
                <div style={{ animation: 'fadeIn 0.5s ease-in-out', display: 'flex', flexDirection: 'column', gap: '32px' }}>
                  <div className="glass-card" style={{ maxWidth: '700px', margin: '0 auto', width: '100%', textAlign: 'center' }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
                    <h2 style={{ fontSize: '26px', fontWeight: '900', marginBottom: '8px' }}>Expediente Inmutable</h2>
                    <p style={{ color: 'var(--text-muted)', marginBottom: '24px', fontSize: '14.5px' }}>Ingresa la placa o identificador para consultar el historial.</p>
                    <form onSubmit={handleSearchExpediente} style={{ display: 'flex', gap: '12px' }}>
                      <input type="text" className="form-input" placeholder="Identificador / Placa" value={expedienteQuery} onChange={(e) => setExpedienteQuery(e.target.value.toUpperCase())} style={{ textAlign: 'center', fontSize: '18px', fontWeight: 'bold', letterSpacing: '2px', padding: '16px' }} required />
                      <button type="submit" className="btn-primary" disabled={isSearchingExpediente} style={{ padding: '0 32px' }}>{isSearchingExpediente ? 'Buscando...' : '🔍 Consultar'}</button>
                    </form>
                  </div>
                  {clientExpedienteData && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '800px', margin: '0 auto', width: '100%' }}>
                      <div className="glass-card" style={{ borderLeft: '4px solid var(--accent)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                          <div>
                            <span className="order-plate">{clientExpedienteData.vehicle.plate}</span>
                          </div>
                        </div>
                        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: 'var(--text-muted)' }}>
                          <span>👤 Cliente: <strong>{toTitleCase(clientExpedienteData.client?.name || 'Cliente General')}</strong></span>
                          <span>📞 Tel: <strong>🇺🇸 +1 {clientExpedienteData.client?.phone?.replace('+1 ', '') || 'N/A'}</strong></span>
                        </div>
                      </div>
                      <h3 style={{ fontSize: '20px', fontWeight: '900', margin: '10px 0 0 0' }}>Historial de Visitas</h3>
                      {clientExpedienteData.serviceHistory.length === 0 ? (
                        <div className="glass-card" style={{ textAlign: 'center', padding: '24px' }}><p style={{ color: 'var(--text-muted)', margin: 0, fontWeight: 'bold' }}>Aún no registra órdenes cerradas.</p></div>
                      ) : (
                        clientExpedienteData.serviceHistory.map((wo: any, idx: number) => (
                          <div key={wo.id} className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                              <span className="badge">Visita #{clientExpedienteData.serviceHistory.length - idx}</span>
                              <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 'bold' }}>{new Date(wo.createdAt).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                              <div><span style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 'bold' }}>Costo Pagado</span><div style={{ fontSize: '22px', fontWeight: '900', color: 'var(--accent)' }}>${Number(wo.finalCost || 0).toLocaleString('en-US')}</div></div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* VISTA 3: PORTAL INTERNO */}
              {activeView === 'mecanico' && (
                <div style={{ animation: 'fadeIn 0.5s ease-in-out' }}>
                  {!isMechanicAuth ? (
                    <div className="glass-card no-print" style={{ maxWidth: '500px', margin: '0 auto', textAlign: 'center' }}>
                      <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔒</div>
                      <h2 style={{ fontSize: '26px', fontWeight: '900', marginBottom: '8px' }}>Acceso Operativo</h2>
                      <p style={{ color: 'var(--text-muted)', marginBottom: '32px' }}>Personal autorizado de {tenantInfo?.name} (PIN: 1234).</p>
                      <form onSubmit={handleMechanicLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <input type="password" value={mechanicPin} onChange={(e) => setMechanicPin(e.target.value)} className="form-input" placeholder="PIN de Seguridad" style={{ textAlign: 'center', fontSize: '24px', letterSpacing: '8px', padding: '18px' }} required />
                        <button type="submit" className="btn-primary">Ingresar al Dashboard</button>
                      </form>
                    </div>
                  ) : (
                    <div>
                      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                        <div>
                          <h1 style={{ fontSize: '32px', fontWeight: '900', margin: '0 0 8px 0' }}>Panel de Control</h1>
                          <p style={{ margin: '0', color: 'var(--text-muted)' }}>Gestión del negocio y facturación.</p>
                        </div>
                        <button onClick={() => setIsMechanicAuth(false)} className="btn-secondary">Cerrar Sesión</button>
                      </div>

                      <div className="no-print" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '32px', background: 'var(--bg-card)', padding: '8px', borderRadius: '16px' }}>
                        <button onClick={() => setAgendaFilter('today')} className={`btn-secondary ${agendaFilter === 'today' ? 'active' : ''}`} style={{ flex: 1, border: 'none', background: agendaFilter === 'today' ? 'var(--accent)' : 'transparent', color: agendaFilter === 'today' ? 'white' : 'var(--text-muted)' }}>📅 Órdenes de Hoy</button>
                        <button onClick={() => setAgendaFilter('upcoming')} className={`btn-secondary ${agendaFilter === 'upcoming' ? 'active' : ''}`} style={{ flex: 1, border: 'none', background: agendaFilter === 'upcoming' ? 'var(--accent)' : 'transparent', color: agendaFilter === 'upcoming' ? 'white' : 'var(--text-muted)' }}>🗓️ Próximos 7 Días</button>
                        <button onClick={() => setAgendaFilter('reports')} className={`btn-secondary ${agendaFilter === 'reports' ? 'active' : ''}`} style={{ flex: 1, border: 'none', background: agendaFilter === 'reports' ? 'var(--accent)' : 'transparent', color: agendaFilter === 'reports' ? 'white' : 'var(--text-muted)' }}>📊 Reportes</button>
                        <button onClick={() => setAgendaFilter('staff')} className={`btn-secondary ${agendaFilter === 'staff' ? 'active' : ''}`} style={{ flex: 1, border: 'none', background: agendaFilter === 'staff' ? 'var(--accent)' : 'transparent', color: agendaFilter === 'staff' ? 'white' : 'var(--text-muted)' }}>👥 Personal</button>
                      </div>
                      
                      {/* 👥 GESTIÓN DE PERSONAL CON TOGGLE ACTIVO / INACTIVO */}
                      {agendaFilter === 'staff' && (
                        <div style={{ animation: 'fadeIn 0.4s' }}>
                          <h2 className="no-print" style={{ fontSize: '24px', fontWeight: '900', marginBottom: '24px' }}>Gestión de Equipo / Staff ({tenantInfo?.name})</h2>
                          <div className="bento-grid">
                            <div className="glass-card">
                              <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '800' }}>➕ Registrar Miembro</h3>
                              <form onSubmit={handleAddStaff} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div>
                                  <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 'bold' }}>Nombre Completo</label>
                                  {/* 🌟 INPUT CON CAPITALIZACIÓN AUTOMÁTICA */}
                                  <input type="text" className="form-input" placeholder="Ej: Andy Perez" value={newStaffName} onChange={e => setNewStaffName(toTitleCase(e.target.value))} style={{ marginTop: '8px' }} required />
                                </div>
                                <div>
                                  <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 'bold' }}>Especialidad / Cargo</label>
                                  <select className="form-select" value={selectedStaffRole} onChange={e => setSelectedStaffRole(e.target.value)} style={{ marginTop: '8px' }} required>
                                    <option value="" disabled>Seleccione especialidad acorde al negocio</option>
                                    {availableRoles.map(role => <option key={role} value={role}>{role}</option>)}
                                    <option value="custom">Otro (Personalizado)...</option>
                                  </select>
                                </div>
                                {selectedStaffRole === 'custom' && (
                                  <div>
                                    <label style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: 'bold' }}>Especifique el cargo:</label>
                                    <input type="text" className="form-input" placeholder="Ej: Especialista Senior" value={customStaffRole} onChange={e => setCustomStaffRole(toTitleCase(e.target.value))} style={{ marginTop: '8px' }} required />
                                  </div>
                                )}
                                <button type="submit" className="btn-primary" style={{ marginTop: '8px' }}>Guardar en el Sistema</button>
                              </form>
                            </div>
                            
                            <div className="glass-card">
                              <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '800' }}>📋 Personal Registrado ({staffList.length})</h3>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '350px', overflowY: 'auto' }}>
                                {staffList.map(m => {
                                  const isActive = m.isActive !== false;
                                  return (
                                    <div key={m.id} style={{ padding: '14px 16px', background: 'var(--input-bg)', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: isActive ? 1 : 0.6 }}>
                                      <div>
                                        <span style={{ fontWeight: 'bold', fontSize: '14.5px', textDecoration: isActive ? 'none' : 'line-through' }}>{m.name}</span>
                                        <span style={{ fontSize: '12px', color: 'var(--accent)', display: 'block' }}>{m.role}</span>
                                      </div>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        {/* 🔘 BOTÓN PARA INACTIVAR / ACTIVAR CONECTADO A BD */}
                                        <button 
                                          type="button" 
                                          onClick={() => toggleStaffStatus(m.id, isActive)}
                                          className="badge" 
                                          style={{ 
                                            background: isActive ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)', 
                                            color: isActive ? '#10B981' : '#EF4444', 
                                            border: 'none', 
                                            cursor: 'pointer',
                                            padding: '6px 12px'
                                          }}
                                        >
                                          {isActive ? 'ACTIVO' : 'INACTIVO'}
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 📊 MÓDULO DE REPORTES */}
                      {agendaFilter === 'reports' && (
                        <div style={{ animation: 'fadeIn 0.4s' }}>
                          <h2 className="no-print" style={{ fontSize: '24px', fontWeight: '900', marginBottom: '24px' }}>Facturación Mensual</h2>
                          
                          <div className="bento-grid no-print" style={{ marginBottom: '32px' }}>
                            <div className="glass-card" style={{ padding: '24px', borderLeft: '4px solid var(--accent)' }}>
                              <span style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total de Ingresos (Filtrado)</span>
                              <div style={{ fontSize: '36px', fontWeight: '900', color: 'var(--text-main)', marginTop: '8px' }}>${totalRevenue.toLocaleString('en-US')}</div>
                            </div>
                            <div className="glass-card" style={{ padding: '24px' }}>
                              <span style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Servicios Completados</span>
                              <div style={{ fontSize: '36px', fontWeight: '900', color: 'var(--text-main)', marginTop: '8px' }}>{reportsData.length}</div>
                            </div>
                          </div>

                          <div className="glass-card no-print reports-filters">
                            <div className="filter-group">
                              <label style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text-muted)', marginBottom: '8px', display: 'block' }}>Desde:</label>
                              <input type="date" className="form-input" value={reportStartDate} onChange={e => setReportStartDate(e.target.value)} />
                            </div>
                            <div className="filter-group">
                              <label style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text-muted)', marginBottom: '8px', display: 'block' }}>Hasta:</label>
                              <input type="date" className="form-input" value={reportEndDate} onChange={e => setReportEndDate(e.target.value)} />
                            </div>
                            <div className="filter-group">
                              <label style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text-muted)', marginBottom: '8px', display: 'block' }}>Filtrar {staffTerm}:</label>
                              <select className="form-select" value={reportMechanic} onChange={e => setReportMechanic(e.target.value)}>
                                <option value="">Todo el personal</option>
                                {staffList.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                              </select>
                            </div>
                            <button onClick={() => { setReportPage(1); loadReports(); }} className="btn-primary btn-search">🔍 Consultar</button>
                            
                            <div className="export-group">
                              <button onClick={exportToCSV} className="btn-secondary" title="Exporta todos los registros filtrados">📥 CSV</button>
                              <button onClick={exportToPDF} className="btn-primary" title="Imprimir PDF sin cortes" style={{ background: '#FF5E00', boxShadow: '0 8px 20px rgba(255, 94, 0, 0.4)' }}>🖨️ Imprimir / PDF</button>
                            </div>
                          </div>

                          <div className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
                            <div className="print-only-header" style={{ display: 'none', padding: '24px', borderBottom: '2px solid var(--border)' }}>
                              <img src="/logocar.png" alt="AutoFlow Logo" style={{ height: '60px', marginBottom: '10px' }} />
                              <h2 style={{ margin: 0, fontSize: '24px', fontWeight: '900' }}>Reporte de Servicios Oficial</h2>
                              <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: '#666' }}>Periodo: {new Date(reportStartDate).toLocaleDateString('es-ES')} al {new Date(reportEndDate).toLocaleDateString('es-ES')}</p>
                              <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: '#666' }}>Personal: {reportMechanic ? staffList.find(m => m.id === reportMechanic)?.name : 'Todos'}</p>
                              <div style={{ marginTop: '16px', display: 'flex', gap: '32px', borderTop: '1px dashed #ccc', paddingTop: '16px' }}>
                                <strong>Total de Ingresos: ${totalRevenue.toLocaleString('en-US')}</strong>
                                <strong>Servicios: {reportsData.length}</strong>
                              </div>
                            </div>
                            
                            <div className="table-responsive">
                              <table className="glass-table">
                                <thead>
                                  <tr>
                                    <th>Fecha</th>
                                    <th>Identificador</th>
                                    <th>Cliente</th>
                                    <th>Servicio</th>
                                    <th>{staffTerm} (Staff)</th>
                                    <th>Total ($)</th>
                                    <th>Estado</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {paginatedReports.length > 0 ? paginatedReports.map(r => (
                                    <tr key={r.id}>
                                      <td>{new Date(r.date).toLocaleDateString('es-ES')}</td>
                                      <td><strong>{r.plate}</strong></td>
                                      <td>{r.clientName}</td>
                                      <td>{r.service}</td>
                                      <td style={{ color: 'var(--text-muted)' }}>{r.mechanicName}</td>
                                      <td style={{ fontWeight: '900', color: 'var(--accent)' }}>${Number(r.cost).toLocaleString('en-US')}</td>
                                      <td><span className="badge" style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#10B981' }}>{r.status.toUpperCase()}</span></td>
                                    </tr>
                                  )) : (
                                    <tr><td colSpan={7} style={{ textAlign: 'center', padding: '32px' }}>No hay servicios registrados en estas fechas.</td></tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                            
                            {totalPages > 1 && !isPrinting && (
                              <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px', borderTop: '1px solid var(--border)' }}>
                                <button onClick={() => setReportPage(p => Math.max(1, p - 1))} disabled={reportPage === 1} className="btn-secondary" style={{ padding: '8px 16px', fontSize: '13px' }}>Anterior</button>
                                <span style={{ fontSize: '14px', fontWeight: 'bold' }}>Página {reportPage} de {totalPages}</span>
                                <button onClick={() => setReportPage(p => Math.min(totalPages, p + 1))} disabled={reportPage === totalPages} className="btn-secondary" style={{ padding: '8px 16px', fontSize: '13px' }}>Siguiente</button>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* AGENDA (Hoy o Próximos 7 días) */}
                      {(agendaFilter === 'today' || agendaFilter === 'upcoming') && (
                        <div className="bento-grid">
                          {activeOrdersList.length === 0 ? (
                            <div className="glass-card" style={{ gridColumn: '1 / -1' }}><p style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '18px', margin: '0' }}>No hay órdenes programadas para este periodo.</p></div>
                          ) : (
                            activeOrdersList.map(order => (
                              <div key={order.id} className="order-card">
                                <div className="order-header">
                                  <span className="order-plate">{order.plate}</span>
                                  <span className="order-status"><span style={{ color: 'var(--accent)' }}>●</span> {order.time}</span>
                                </div>
                                <div style={{ marginTop: '8px' }}>
                                  <h3 style={{ margin: '0 0 4px 0', fontSize: '20px', fontWeight: '800' }}>{order.brand} {order.model}</h3>
                                  <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: 'var(--text-muted)' }}>Cliente: <strong>{toTitleCase(order.clientName)}</strong></p>
                                </div>
                                <div style={{ background: 'var(--input-bg)', padding: '16px', borderRadius: '12px', fontSize: '14px', fontWeight: '700', marginBottom: '16px', border: '1px solid var(--border)' }}>
                                  🛠️ {order.serviceType}
                                  {agendaFilter === 'upcoming' && (<div style={{ marginTop: '8px', color: 'var(--accent)', fontSize: '12px' }}>📆 Para el: {new Date(order.date).toLocaleDateString()}</div>)}
                                </div>
                                <button onClick={() => setSelectedOrder(order)} className="btn-primary" style={{ width: '100%', marginTop: 'auto' }}>📋 Completar Orden (POS)</button>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* Modal 1: Reserva de Cliente */}
      {isBookingModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <button className="close-btn" onClick={() => { setIsBookingModalOpen(false); setIsPlateSearched(false); }}>✕</button>
            <h2 style={{ margin: '0 0 8px 0', fontSize: '28px', fontWeight: '900', letterSpacing: '-0.5px' }}>Nueva Reserva</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '32px', fontSize: '15px' }}>Completa los datos para agendar tu servicio en {tenantInfo?.name}.</p>
            
            {isAutomotive && !isPlateSearched ? (
              <div style={{ background: 'var(--bg-card)', padding: '32px', borderRadius: '16px', border: '1px solid var(--border)', textAlign: 'center' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>🚗</div>
                <h3 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '12px' }}>¿Ya nos has visitado antes?</h3>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
                  <input type="text" className="form-input" placeholder="Placa (Ej: JNT776)" value={searchPlate} onChange={(e) => setSearchPlate(e.target.value.toUpperCase())} style={{ maxWidth: '250px', textAlign: 'center', fontWeight: '900', fontSize: '20px', letterSpacing: '2px', padding: '16px' }} />
                </div>
                <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button onClick={handleSearchVehicle} className="btn-primary" disabled={isSearchingPlate} style={{ flex: 1, minWidth: '140px', padding: '16px' }}>{isSearchingPlate ? 'Buscando...' : '🔍 Buscar Placa'}</button>
                  <button onClick={() => setIsPlateSearched(true)} className="btn-secondary" style={{ flex: 1, minWidth: '140px', padding: '16px' }}>Primera Vez ➔</button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleBookService}>
                <div style={{ marginBottom: '24px' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '8px' }}>Servicio Seleccionado</label>
                  <select className="form-select" value={selectedServiceType} onChange={(e) => setSelectedServiceType(e.target.value)} required>
                    {servicesList.map(srv => <option key={srv.id} value={srv.id}>{srv.name} - ${srv.price}</option>)}
                  </select>
                </div>

                {!isAutomotive && activeStaffList.length > 0 && (
                  <div style={{ marginBottom: '24px', background: 'var(--input-bg)', padding: '16px', borderRadius: '12px', border: '1px dashed var(--accent)' }}>
                    <label style={{ display: 'block', fontSize: '12px', color: 'var(--accent)', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '8px' }}>Elegir {staffTerm} (Opcional)</label>
                    <select className="form-select" value={selectedBookingStaff} onChange={(e) => setSelectedBookingStaff(e.target.value)}>
                      <option value="">Cualquiera disponible</option>
                      {activeStaffList.map(stf => <option key={stf.id} value={stf.id}>{stf.name} ({stf.role})</option>)}
                    </select>
                  </div>
                )}

                {isAutomotive && (
                  <div style={{ background: 'var(--input-bg)', padding: '24px', borderRadius: '16px', marginBottom: '24px', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                      <h4 style={{ margin: '0', fontSize: '16px', color: 'var(--accent)', fontWeight: '800' }}>Datos del Vehículo</h4>
                      <span onClick={() => setIsPlateSearched(false)} style={{ fontSize: '13px', cursor: 'pointer', color: 'var(--text-muted)', textDecoration: 'underline', fontWeight: 'bold' }}>Volver a buscar</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '16px', marginBottom: '16px' }}>
                      <input type="text" className="form-input" placeholder="Placa" value={searchPlate} onChange={(e) => setSearchPlate(e.target.value.toUpperCase())} required />
                      <input type="text" className="form-input" placeholder="Marca" value={carBrand} onChange={(e) => setCarBrand(e.target.value)} required />
                      <input type="text" className="form-input" placeholder="Modelo" value={carModel} onChange={(e) => setCarModel(e.target.value)} required />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '16px', marginBottom: '20px' }}>
                      <input type="number" className="form-input" placeholder="Año" value={carYear} onChange={(e) => setCarYear(e.target.value)} />
                      <input type="number" className="form-input" placeholder="Kilometraje" value={carMileage} onChange={(e) => setCarMileage(e.target.value)} />
                    </div>
                    <div style={{ marginBottom: '12px' }}>
                      <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 'bold' }}>Síntomas rápidos:</span>
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '12px' }}>
                        {clientQuickServices.map(qs => (
                          <span key={qs} onClick={() => setQuickNotes(prev => prev.includes(qs) ? prev : `${prev} ${qs}`.trim())} style={{ padding: '8px 16px', background: quickNotes.includes(qs) ? 'var(--accent)' : 'var(--bg-card)', color: quickNotes.includes(qs) ? '#fff' : 'var(--text-main)', border: '1px solid var(--border)', borderRadius: '20px', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>+ {qs}</span>
                        ))}
                      </div>
                    </div>
                    <textarea className="form-input" placeholder="Detalles adicionales..." value={quickNotes} onChange={(e) => setQuickNotes(e.target.value)} style={{ marginTop: '12px', minHeight: '80px', resize: 'vertical' }} />
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px', marginBottom: '16px' }}>
                  <input type="text" className="form-input" placeholder="Nombre Completo (Ej: Cesar Lopez)" value={clientName} onChange={(e) => setClientName(toTitleCase(e.target.value))} required />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px' }}>
                  <input type="email" className="form-input" placeholder="Correo Electrónico" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} required />
                  <div style={{ display: 'flex', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
                    <span style={{ padding: '14px 16px', borderRight: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}>🇺🇸 +1</span>
                    <input type="tel" style={{ border: 'none', background: 'transparent', width: '100%', padding: '14px 16px', color: 'var(--text-main)', outline: 'none', fontSize: '14.5px' }} placeholder="Teléfono" value={clientPhone} onChange={(e) => setClientPhone(e.target.value.replace(/[^0-9\s-]/g, ''))} required />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px', marginBottom: '32px' }}>
                  <input type="date" className="form-input" value={appointmentDate} onChange={(e) => setAppointmentDate(e.target.value)} required />
                  <select className="form-select" value={appointmentTime} onChange={(e) => setAppointmentTime(e.target.value)} required>
                    <option value="" disabled>Seleccione Hora</option>
                    {['08:00', '09:00', '10:00', '11:00', '14:00', '15:00', '16:00'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <button type="submit" className="btn-primary" style={{ width: '100%', padding: '20px', fontSize: '16px' }} disabled={isSubmitting}>{isSubmitting ? 'Procesando...' : 'Confirmar Agendamiento'}</button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Modal 2: Cierre de Orden POS */}
      {selectedOrder && (
        <div className="modal-overlay no-print">
          <div className="modal-content" style={{ maxWidth: '750px' }}>
            <button className="close-btn" onClick={() => setSelectedOrder(null)}>✕</button>
            <h2 style={{ margin: '0 0 8px 0', fontSize: '28px', fontWeight: '900', letterSpacing: '-0.5px' }}>Cierre de Servicio (POS)</h2>
            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '16px', borderRadius: '12px', marginBottom: '24px', border: '1px solid var(--border)' }}>
              <p style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 'bold' }}>{isAutomotive ? 'Vehículo:' : 'Reserva:'} <span style={{ color: 'var(--accent)' }}>{selectedOrder.brand} {selectedOrder.model}</span></p>
              <p style={{ margin: '0', fontSize: '14px', color: 'var(--text-muted)' }}>Identificador: <strong>{selectedOrder.plate}</strong> | Cliente: <strong>{toTitleCase(selectedOrder.clientName)}</strong> | Servicio: <strong>{selectedOrder.serviceType}</strong></p>
            </div>
            
            <form onSubmit={handleCompleteWorkOrder}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px', marginBottom: '24px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: 'bold', textTransform: 'uppercase' }}>Valor Final a Cobrar ($)</label>
                  <input type="text" className="form-input" placeholder="Ej: $ 250" value={finalCost} onChange={(e) => setFinalCost(formatCurrency(e.target.value))} style={{ marginTop: '8px', fontSize: '24px', fontWeight: '900', color: 'var(--accent)' }} required />
                </div>
                {isAutomotive && (
                  <div>
                    <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 'bold', textTransform: 'uppercase' }}>Millaje de Salida</label>
                    <input type="number" className="form-input" placeholder="Ej: 21000" value={exitMileage} onChange={(e) => setExitMileage(e.target.value)} style={{ marginTop: '8px', fontSize: '18px', fontWeight: 'bold' }} required />
                  </div>
                )}
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-main)', fontWeight: 'bold', textTransform: 'uppercase' }}>⚙️ Asignar {staffTerm} Responsable</label>
                <select className="form-select" value={assignedMechanicId} onChange={e => setAssignedMechanicId(e.target.value)} style={{ marginTop: '8px', border: '1px solid var(--accent)' }} required>
                  <option value="" disabled>Seleccione el personal a cargo</option>
                  {activeStaffList.map(m => <option key={m.id} value={m.id}>{m.name} ({m.role})</option>)}
                </select>
              </div>

              <div style={{ background: 'var(--input-bg)', padding: '24px', borderRadius: '16px', marginBottom: '24px', border: '1px solid var(--border)' }}>
                <h4 style={{ margin: '0 0 16px 0', fontSize: '16px', color: 'var(--text-main)', fontWeight: '800' }}>Reporte y Evidencias WebP</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
                  <div>
                    <label style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 'bold' }}>Nota 1 / Estado Inicial</label>
                    <input type="text" className="form-input" placeholder="Detalle..." value={oldParts} onChange={(e) => setOldParts(e.target.value)} style={{ marginTop: '8px', marginBottom: '12px' }} />
                    {!oldPartPreview ? (
                      <><input type="file" id="uploadOldPart" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleImageChange(e, 'old')} /><label htmlFor="uploadOldPart" className="upload-btn-label">📸 Subir WebP (Antes)</label></>
                    ) : (
                      <div className="img-preview-box"><img src={oldPartPreview} alt="Evidencia Antes WebP" /><button type="button" className="remove-img-btn" onClick={() => { setOldPartPreview(null); setOldPartImage(null); }}>✕</button></div>
                    )}
                  </div>
                  <div>
                    <label style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 'bold' }}>Nota 2 / Resultado</label>
                    <input type="text" className="form-input" placeholder="Detalle..." value={newParts} onChange={(e) => setNewParts(e.target.value)} style={{ marginTop: '8px', marginBottom: '12px' }} />
                    {!newPartPreview ? (
                      <><input type="file" id="uploadNewPart" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleImageChange(e, 'new')} /><label htmlFor="uploadNewPart" className="upload-btn-label">📸 Subir WebP (Después)</label></>
                    ) : (
                      <div className="img-preview-box"><img src={newPartPreview} alt="Evidencia Después WebP" /><button type="button" className="remove-img-btn" onClick={() => { setNewPartPreview(null); setNewPartImage(null); }}>✕</button></div>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 'bold', textTransform: 'uppercase' }}>Notas y Diagnóstico Interno</label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '12px 0' }}>
                  {mechanicQuickNotes.map(opt => (
                    <span key={opt} onClick={() => setMechanicNotes(prev => prev.includes(opt) ? prev : `${prev} ${opt}. `.trimStart())} style={{ padding: '8px 16px', background: mechanicNotes.includes(opt) ? 'var(--accent)' : 'var(--bg-card)', color: mechanicNotes.includes(opt) ? '#fff' : 'var(--text-main)', border: '1px solid var(--border)', borderRadius: '20px', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' }}>+ {opt}</span>
                  ))}
                </div>
                <textarea className="form-input" placeholder="Describe los ajustes realizados..." value={mechanicNotes} onChange={(e) => setMechanicNotes(e.target.value)} style={{ minHeight: '100px', resize: 'vertical' }} required />
              </div>

              <div style={{ marginBottom: '32px' }}>
                <label style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 'bold', textTransform: 'uppercase' }}>Alerta de Próxima Visita</label>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '12px' }}>
                  {nextServiceOptions.map(opt => (
                    <span key={opt} onClick={() => setNextServiceTime(opt)} style={{ padding: '10px 18px', background: nextServiceTime === opt ? 'var(--accent)' : 'var(--bg-card)', color: nextServiceTime === opt ? '#fff' : 'var(--text-main)', border: '1px solid', borderColor: nextServiceTime === opt ? 'var(--accent)' : 'var(--border)', borderRadius: '24px', fontSize: '14px', cursor: 'pointer', fontWeight: '800' }}>{opt}</span>
                  ))}
                </div>
              </div>
              
              <button type="submit" className="btn-primary" style={{ width: '100%', padding: '20px', fontSize: '16px' }} disabled={isSubmitting}>{isSubmitting ? 'Procesando...' : '✅ Cerrar Orden y Facturar'}</button>
            </form>
          </div>
        </div>
      )}

      {/* Modal 3: Visor de Evidencias */}
      {expandedImage && (
        <div className="modal-overlay no-print" onClick={() => setExpandedImage(null)} style={{ zIndex: 2000, background: 'rgba(0,0,0,0.95)' }}>
          <div className="modal-content" style={{ maxWidth: '900px', background: 'transparent', border: 'none', boxShadow: 'none', textAlign: 'center', padding: '0', display: 'flex', flexDirection: 'column', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
            <button className="close-btn" style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 2100, background: 'rgba(255,255,255,0.1)', width: '40px', height: '40px', fontSize: '20px' }} onClick={() => setExpandedImage(null)}>✕</button>
            <h3 style={{ color: 'white', marginBottom: '16px', fontWeight: '900' }}>{expandedImage.alt}</h3>
            <PrivateSupabaseImage path={expandedImage.path} alt={expandedImage.alt} isExpanded={true} />
          </div>
        </div>
      )}
    </div>
  );
}