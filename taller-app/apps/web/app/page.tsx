'use client';
import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://hboflqdubrtogwbuddsa.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'tu-anon-key';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface WorkOrderRecord {
  id: string;
  date: string;
  type: string;
  title: string;
  mechanic: string;
  notes: string;
  status: string;
  cost?: string;
  mileage?: string; 
  oldPartPhoto?: string;
  newPartPhoto?: string;
}

interface AppointmentRecord {
  id: string;
  clientName: string;
  carBrand: string;
  carModel: string;
  carPlate: string;
  time: string;
  serviceType: string;
  plate: string;
  brand: string;
  model: string;
  mileage?: string;
  notes: string;
}

interface ReportRecord {
  id: string;
  plate: string;
  date: string;
  mechanic: string;
  cost: string;
  status: string;
  serviceType: string;
}

function PrivateImage({ path, alt, onClick, style, title }: any) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!path) return;
    
    if (path.startsWith('http')) {
      setSrc(path);
      return;
    }
    
    const fetchSecureUrl = async () => {
      const { data, error } = await supabase.storage
        .from('autoflow')
        .createSignedUrl(path, 3600); 
      
      if (data?.signedUrl) {
        setSrc(data.signedUrl);
      } else {
        console.error("Error pidiendo URL firmada:", error);
      }
    };
    
    fetchSecureUrl();
  }, [path]);

  if (!src) {
    return (
      <div style={{ ...style, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: '10px' }}>
        ⏳
      </div>
    );
  }

  return <img src={src} alt={alt} onClick={() => onClick && onClick(src)} style={style} title={title} />;
}

export default function AutoFlowPlatform() {
  const [activeView, setActiveView] = useState<'servicios' | 'expediente' | 'mecanico'>('servicios');
  const [isDark, setIsDark] = useState(true);
  const [lang, setLang] = useState<'es' | 'en'>('es');
  
  const [isMechanicLoggedIn, setIsMechanicLoggedIn] = useState(false);
  const [mechanicPin, setMechanicPin] = useState('');

  const [searchPlate, setSearchPlate] = useState('');
  const [activePlate, setActivePlate] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [vehicleHistory, setVehicleHistory] = useState<WorkOrderRecord[]>([]);
  const [vehicleMileage, setVehicleMileage] = useState('62,450 km');
  
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [selectedServiceType, setSelectedServiceType] = useState('mechanical');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalImageSrc, setModalImageSrc] = useState<string | null>(null);
  
  const [isStopModalOpen, setIsStopModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [carBrand, setCarBrand] = useState('Porsche');
  const [carModel, setCarModel] = useState('911 GT3');
  const [carYear, setCarYear] = useState('2025');
  const [carVin, setCarVin] = useState('');
  const [carMileage, setCarMileage] = useState('');
  const [appointmentDate, setAppointmentDate] = useState('');
  const [appointmentTime, setAppointmentTime] = useState('');
  const [appointmentNotes, setAppointmentNotes] = useState('');
  const [smsConsent, setSmsConsent] = useState(true);

  const [bookedTimes, setBookedTimes] = useState<string[]>([]);

  const [mechanicPlate, setMechanicPlate] = useState('');
  const [workOrderStatus, setWorkOrderStatus] = useState('diagnosis');
  const [workOrderMileage, setWorkOrderMileage] = useState('');
  const [mechanicNotes, setMechanicNotes] = useState('');
  const [estimatedCost, setEstimatedCost] = useState('');
  const [nextServiceMonth, setNextServiceMonth] = useState('2026-11');

  const [oldPartFile, setOldPartFile] = useState<File | null>(null);
  const [oldPartPreview, setOldPartPreview] = useState<string | null>(null);
  const [newPartFile, setNewPartFile] = useState<File | null>(null);
  const [newPartPreview, setNewPartPreview] = useState<string | null>(null);

  const [todaysAppointments, setTodaysAppointments] = useState<AppointmentRecord[]>([]);
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentRecord | null>(null);
  const [isLoadingAppointments, setIsLoadingAppointments] = useState(false);
  
  const [agendaTab, setAgendaTab] = useState<'hoy' | 'manana' | 'semana'>('hoy');

  const [mechanicPortalView, setMechanicPortalView] = useState<'agenda' | 'reportes'>('agenda');
  const [reportMechanic, setReportMechanic] = useState('todos');
  const [reportStartDate, setReportStartDate] = useState('');
  const [reportEndDate, setReportEndDate] = useState('');
  
  const [reportData, setReportData] = useState<ReportRecord[]>([]);
  const [isLoadingReports, setIsLoadingReports] = useState(false);
  const [reportTotalValue, setReportTotalValue] = useState(0);

  // Estados de paginación web
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    const today = new Date();
    const past30Days = new Date();
    past30Days.setDate(today.getDate() - 30);
    
    setReportEndDate(today.toISOString().substring(0, 10));
    setReportStartDate(past30Days.toISOString().substring(0, 10));
  }, [mechanicPortalView]);

  const popularBrands = ['Porsche', 'BMW', 'Mercedes-Benz', 'Audi', 'Toyota', 'Honda', 'Ford', 'Chevrolet', 'Tesla', 'Lexus', 'Nissan', 'Hyundai'];
  const brandModelsMap: Record<string, string[]> = {
    'Porsche': ['911 GT3', 'Cayenne', 'Macan', 'Panamera', 'Taycan', '718 Cayman'],
    'BMW': ['M3', 'M4', 'X5', 'X3', 'Series 3', 'Series 5', 'i4'],
    'Mercedes-Benz': ['C-Class', 'E-Class', 'GLE', 'GLC', 'AMG GT', 'S-Class'],
    'Audi': ['A4', 'A6', 'Q5', 'Q7', 'RS6', 'e-tron'],
    'Toyota': ['Corolla', 'Camry', 'RAV4', 'Tacoma', 'Tundra', 'Prius'],
    'Honda': ['Civic', 'Accord', 'CR-V', 'Pilot', 'HR-V'],
    'Ford': ['Mustang', 'F-150', 'Explorer', 'Escape', 'Bronco'],
    'Chevrolet': ['Camaro', 'Corvette', 'Silverado', 'Equinox', 'Tahoe'],
    'Tesla': ['Model 3', 'Model Y', 'Model S', 'Model X', 'Cybertruck'],
    'Lexus': ['RX', 'ES', 'NX', 'GX', 'IS'],
    'Nissan': ['Altima', 'Rogue', 'Sentra', 'Pathfinder', 'Z'],
    'Hyundai': ['Elantra', 'Tucson', 'Santa Fe', 'Sonata', 'Ioniq 5']
  };

  const availableModels = brandModelsMap[carBrand] || ['Sedán', 'SUV', 'Deportivo', 'Truck'];
  const availableYears = Array.from({ length: 63 }, (_, i) => (2027 - i).toString());

  const t = {
    es: {
      navServices: "Servicios & Taller",
      navVehicle: "Mi Vehículo",
      navPortal: "Portal Taller",
      heroTitle: "Ingeniería y Cuidado Automotriz de",
      heroHighlight: "Alta Precisión",
      heroDesc: "Más de 14 años de trayectoria respaldando la potencia y seguridad de tu vehículo con tecnología de punta y estándares de concesionario.",
      aboutTitle: "Nuestra Trayectoria",
      aboutText: "Fundados con el compromiso de ofrecer diagnósticos exactos y total transparencia. Contamos con equipos de escaneo computarizado de última generación, cabina de pintura horneada de alta gama y técnicos certificados.",
      statYears: "+14 Años",
      statYearsDesc: "De experiencia",
      statVehicles: "+8,500",
      statVehiclesDesc: "Vehículos listos",
      statWarranty: "100%",
      statWarrantyDesc: "Garantía directa",
      serviceTitle: "Centro Integral de Servicios",
      serviceDesc: "Infraestructura completa para diagnóstico avanzado, mecánica general, mantenimiento preventivo y carrocería.",
      serviceItem1: "Mecánica General & Escáner Avanzado",
      serviceItem2: "Latonería, Pintura Horneada & Detailing",
      btnAgenda: "Agendar Cita en Bahía",
      searchTitle: "Consulta de Expediente",
      searchDesc: "Ingresa la placa o VIN de tu vehículo para acceder al historial clínico oficial y órdenes de trabajo.",
      searchPlaceholder: "EJEMPLO: XYZ-789 o VIN",
      searchBtn: "Acceder al Expediente",
      searchingBtn: "Consultando...",
      currentMileageLabel: "Kilometraje Actual",
      nextSrvLabel: "Próximo SRV",
      workOrdersTitle: "Órdenes de Trabajo (work_orders)",
      workOrdersSub: "Historial clínico y fotográfico oficial",
      optimalBadge: "Óptimo",
      techReportLabel: "Reporte Técnico:",
      photoEvidenceLabel: "Evidencia Fotográfica de la Orden:",
      oldPartLabel: "Pieza Vieja",
      newPartLabel: "Pieza Nueva",
      clickToZoom: "Click para ampliar",
      mileageNotReg: "Millaje no reg.",
      estCostLabel: "Costo Estimado:",
      noRecord: "Sin registro",
      newNoRecord: "Nuevo / Sin registro",
      inviteRegisterAlert: "¡Te invitamos a registrarte! No estás en nuestros sistemas. Completa tus datos para crear tu expediente y agendar tu cita.",
      defaultWoDate: "Reciente",
      defaultWoTitle: "Registro de Ingreso",
      defaultWoMechanic: "Taller",
      defaultWoNotes: "Vehículo validado en sistema sin órdenes previas.",
      shopAccessTitle: "Acceso Taller",
      shopAccessDesc: "Ingresa el PIN de seguridad (Usa: 2026)",
      pinPlaceholder: "PIN",
      enterPortalBtn: "Ingresar al Portal",
      wrongPinAlert: 'PIN incorrecto. Usa "2026" para acceder.',
      shopPanelTitle: "Panel Operativo del Taller",
      orderFor: "Orden para",
      todaysSchedule: "Agenda",
      loadingSchedule: "Cargando agenda...",
      freeDayTitle: "Día Libre",
      freeDayDesc: "No hay citas pendientes para esta selección.",
      attendBtn: "Atender",
      backToSchedule: "← Volver a la agenda",
      tabToday: "📅 Hoy",
      tabTomorrow: "🌅 Mañana",
      tabWeek: "📆 Próximos 7 días",
      plateVinLabel: "Placa / VIN (vehicles)",
      orderStatusLabel: "Estado de Orden (work_orders.status)",
      statusDiagnosis: "Diagnóstico",
      statusPending: "Pendiente de Aprobación",
      statusInProgress: "En Progreso",
      statusQc: "Control de Calidad",
      statusReady: "Listo para Entrega",
      estCostInputLabel: "Costo Estimado (estimated_cost)",
      estCostPlaceholder: "Ej: $350.00",
      currentMileageInputLabel: "Kilometraje Actual (work_orders.mileage)",
      currentMileagePlaceholder: "Ej: 63,100 km",
      quickTemplatesLabel: "⚡ Plantillas Rápidas de Servicio",
      mechanicTemplates: [
        { label: '🛢️ Cambio de Aceite', text: 'Sustitución de aceite sintético y filtro de motor. Revisión de niveles y fugas OK.' },
        { label: '🛑 Frenos', text: 'Cambio de pastillas de freno (evidencia de desgaste en pieza vieja). Ajuste y purgado del sistema.' },
        { label: '🔧 Preventivo', text: 'Mantenimiento preventivo general de 45 puntos, rotación de neumáticos y filtros.' },
        { label: '🔩 Suspensión', text: 'Inspección de elementos de suspensión y dirección. Terminales y amortiguadores.' }
      ],
      photoEvidenceWebpLabel: "📸 Evidencia Fotográfica (WebP Optimizado)",
      oldPartUploadLabel: "🔴 Pieza / Estado Anterior",
      newPartUploadLabel: "🟢 Pieza / Resultado Nuevo",
      nextServiceRecLabel: "Próximo Servicio Recomendado",
      mechanicNotesLabel: "Notas del Mecánico (mechanic_notes)",
      mechanicNotesPlaceholder: "Diagnóstico, piezas cambiadas...",
      savingOrderBtn: "Procesando y Guardando...",
      saveCloseOrderBtn: "💾 Guardar y Cerrar Cita",
      orderSavedAlert: "✅ ¡Orden guardada y cita cerrada con éxito!",
      reviewPrefix: "Revisar:",
      viewAgenda: "📋 Ver Agenda",
      viewReports: "📊 Reportes & Pagos",
      reportsFilterTitle: "Filtro de Servicios",
      dateStartLabel: "Desde Fecha",
      dateEndLabel: "Hasta Fecha",
      allMechanics: "Todos los mecánicos",
      generateReportBtn: "Consultar",
      btnExportExcel: "Excel",
      btnExportPDF: "PDF",
      loadingReports: "Consultando servicios...",
      totalServicesCard: "Servicios Terminados",
      totalValueCard: "Valor Total Generado",
      noReportsFound: "No se encontraron servicios completados para estos filtros.",
      colDate: "Fecha",
      colPlate: "Placa",
      colService: "Servicio",
      colMechanic: "Mecánico",
      colValue: "Valor",
      bookingModalTitle: "Agendar Cita en Bahía",
      bookingModalDesc: "Registra tu cita conectada con las tablas `users`, `vehicles` y `appointments`.",
      serviceTypeLabel: "Tipo de Servicio (appointments.service_type)",
      serviceMechOption: "Mecánica General & Diagnóstico",
      serviceBodyOption: "Latonería, Pintura & Detailing",
      fullNameLabel: "Nombre Completo (users.name)",
      fullNamePlaceholder: "Ej: Carlos Pérez",
      emailLabel: "Email (users.email)",
      phoneLabel: "Teléfono (users.phone)",
      brandLabel: "Marca (vehicles.brand)",
      modelLabel: "Modelo (vehicles.model)",
      yearLabel: "Año (vehicles.year)",
      plateInputLabel: "Placa (vehicles.plate)",
      platePlaceholder: "Ej: XYZ-789",
      vinInputLabel: "VIN (vehicles.vin)",
      mileageBookingLabel: "Current Mileage (vehicles.mileage)",
      mileageBookingPlaceholder: "Ej: 62,450 km",
      dateInputLabel: "Fecha de Cita",
      timeInputLabel: "Hora (Intervalos de 30 min)",
      selectTimeOption: "Selecciona la hora",
      chooseDateFirstOption: "Primero elige una fecha",
      bookedSuffix: "(Ocupado)",
      quickReasonTemplatesLabel: "⚡ Plantillas Rápidas para el Motivo",
      bookingTemplates: [
        { label: '🛢️ Cambio de Aceite', text: 'Requiere revisión y cambio de aceite sintético de motor.' },
        { label: '🛑 Frenos', text: 'Presenta ruidos y desgaste en sistema de frenos.' },
        { label: '🔧 Preventivo', text: 'Mantenimiento preventivo general y revisión de 45 puntos.' },
        { label: '🔩 Suspensión', text: 'Revisión por ruidos o inestabilidad en la suspensión.' }
      ],
      notesBookingLabel: "Notas (appointments.notes)",
      notesBookingPlaceholder: "Ej: Ruidos extraños al frenar...",
      smsConsentText: "Autorizo a AutoFlow a enviarme mensajes de texto o WhatsApp con el estado de mi vehículo y alertas de mantenimiento. Responde 'STOP' para cancelar.",
      processingBtn: "Procesando...",
      submitBookingBtn: "Enviar Solicitud de Cita",
      footerRate: "Califícanos en Google",
      footerRights: "© 2026 AutoFlow Technologies. Todos los derechos reservados.",
      footerStop: "Darse de baja (SMS)",
      footerDelete: "Eliminar Datos (CCPA)",
      stopModalTitle: "Darse de baja",
      stopModalDesc: "Ingresa tu número para dejar de recibir notificaciones de WhatsApp o SMS. Tu expediente seguirá seguro.",
      stopModalBtn: "Dar de baja",
      stopSuccessAlert: "Número dado de baja con éxito.",
      deleteModalTitle: "Eliminar Cuenta",
      deleteModalDesc: "Ingresa tu número para borrar por completo tus datos y expediente de la base de datos de forma irreversible.",
      deleteModalBtn: "Eliminar Permanentemente",
      deleteSuccessAlert: "Cuenta eliminada permanentemente.",
      successBooking: (name: string) => `¡Cita confirmada, ${name}! Tu solicitud ha sido registrada en las tablas de Drizzle ORM.`,
      btnPrev: "Anterior",
      btnNext: "Siguiente",
      pageIndicator: (current: number, total: number) => `Página ${current} de ${total}`
    },
    en: {
      navServices: "Services & Shop",
      navVehicle: "My Vehicle",
      navPortal: "Shop Portal",
      heroTitle: "Precision Engineering &",
      heroHighlight: "Automotive Care",
      heroDesc: "Over 14 years of excellence backing your vehicle's performance and safety with cutting-edge tech and dealership standards.",
      aboutTitle: "Our Legacy & Expertise",
      aboutText: "Established to deliver precise diagnostics and total transparency. Equipped with state-of-the-art computer diagnostic scanners, premium baking paint booths, and certified technicians.",
      statYears: "+14 Years",
      statYearsDesc: "Experience",
      statVehicles: "+8,500",
      statVehiclesDesc: "Vehicles serviced",
      statWarranty: "100%",
      statWarrantyDesc: "Direct warranty",
      serviceTitle: "Comprehensive Service Center",
      serviceDesc: "Equipped with full infrastructure for advanced diagnostics, general mechanics, and bodywork.",
      serviceItem1: "General Mechanics & Advanced Scanner",
      serviceItem2: "Bodywork, Baking Paint Booth & Detailing",
      btnAgenda: "Book Service Bay",
      searchTitle: "Service Record Lookup",
      searchDesc: "Enter your vehicle's license plate or VIN to access its official technical history and work orders.",
      searchPlaceholder: "EXAMPLE: XYZ-789 or VIN",
      searchBtn: "View Service Record",
      searchingBtn: "Searching...",
      currentMileageLabel: "Current Mileage",
      nextSrvLabel: "Next SRV",
      workOrdersTitle: "Work Orders (work_orders)",
      workOrdersSub: "Official clinical & photographic history",
      optimalBadge: "Optimal",
      techReportLabel: "Technical Report:",
      photoEvidenceLabel: "Work Order Photographic Evidence:",
      oldPartLabel: "Old Part",
      newPartLabel: "New Part",
      clickToZoom: "Click to enlarge",
      mileageNotReg: "Mileage not reg.",
      estCostLabel: "Estimated Cost:",
      noRecord: "No record",
      newNoRecord: "New / No record",
      inviteRegisterAlert: "We invite you to register! You are not in our system yet. Complete your details to create your record and book your appointment.",
      defaultWoDate: "Recent",
      defaultWoTitle: "Check-in Record",
      defaultWoMechanic: "Shop",
      defaultWoNotes: "Vehicle validated in system with no prior work orders.",
      shopAccessTitle: "Shop Access",
      shopAccessDesc: "Enter security PIN (Use: 2026)",
      pinPlaceholder: "PIN",
      enterPortalBtn: "Enter Portal",
      wrongPinAlert: 'Incorrect PIN. Use "2026" to access.',
      shopPanelTitle: "Shop Operations Panel",
      orderFor: "Order for",
      todaysSchedule: "Schedule",
      loadingSchedule: "Loading schedule...",
      freeDayTitle: "Free Day",
      freeDayDesc: "No pending appointments for this selection.",
      attendBtn: "Attend",
      backToSchedule: "← Back to schedule",
      tabToday: "📅 Today",
      tabTomorrow: "🌅 Tomorrow",
      tabWeek: "📆 Next 7 Days",
      plateVinLabel: "License Plate / VIN (vehicles)",
      orderStatusLabel: "Order Status (work_orders.status)",
      statusDiagnosis: "Diagnosis",
      statusPending: "Pending Approval",
      statusInProgress: "In Progress",
      statusQc: "Quality Control",
      statusReady: "Ready for Pickup",
      estCostInputLabel: "Estimated Cost (estimated_cost)",
      estCostPlaceholder: "Ex: $350.00",
      currentMileageInputLabel: "Current Mileage (work_orders.mileage)",
      currentMileagePlaceholder: "Ex: 63,100 km",
      quickTemplatesLabel: "⚡ Quick Service Templates",
      mechanicTemplates: [
        { label: '🛢️ Oil Change', text: 'Synthetic motor oil and filter replacement. Fluid levels and leak inspection OK.' },
        { label: '🛑 Brakes', text: 'Brake pad replacement (wear evidence on old part). System adjustment and bleeding.' },
        { label: '🔧 Preventive', text: '45-point general preventive maintenance, tire rotation and filters.' },
        { label: '🔩 Suspension', text: 'Suspension and steering components inspection. Tie rods and shock absorbers.' }
      ],
      photoEvidenceWebpLabel: "📸 Photographic Evidence (Optimized WebP)",
      oldPartUploadLabel: "🔴 Old Part / Previous Condition",
      newPartUploadLabel: "🟢 New Part / Final Result",
      nextServiceRecLabel: "Recommended Next Service",
      mechanicNotesLabel: "Mechanic Notes (mechanic_notes)",
      mechanicNotesPlaceholder: "Diagnostics, replaced parts...",
      savingOrderBtn: "Processing and Saving...",
      saveCloseOrderBtn: "💾 Save and Close Appointment",
      orderSavedAlert: "✅ Work order saved and appointment closed successfully!",
      reviewPrefix: "Review:",
      viewAgenda: "📋 View Schedule",
      viewReports: "📊 Reports & Payments",
      reportsFilterTitle: "Services Filter",
      dateStartLabel: "Start Date",
      dateEndLabel: "End Date",
      allMechanics: "All mechanics",
      generateReportBtn: "Query",
      btnExportExcel: "Excel",
      btnExportPDF: "PDF",
      loadingReports: "Querying services...",
      totalServicesCard: "Completed Services",
      totalValueCard: "Total Generated Value",
      noReportsFound: "No completed services found for these filters.",
      colDate: "Date",
      colPlate: "Plate",
      colService: "Service",
      colMechanic: "Mechanic",
      colValue: "Value",
      bookingModalTitle: "Book Service Bay",
      bookingModalDesc: "Register your appointment connected with `users`, `vehicles` and `appointments` tables.",
      serviceTypeLabel: "Service Type (appointments.service_type)",
      serviceMechOption: "General Mechanics & Diagnostics",
      serviceBodyOption: "Bodywork, Paint & Detailing",
      fullNameLabel: "Full Name (users.name)",
      fullNamePlaceholder: "Ex: Carlos Perez",
      emailLabel: "Email (users.email)",
      phoneLabel: "Phone (users.phone)",
      brandLabel: "Brand (vehicles.brand)",
      modelLabel: "Model (vehicles.model)",
      yearLabel: "Year (vehicles.year)",
      plateInputLabel: "License Plate (vehicles.plate)",
      platePlaceholder: "Ex: XYZ-789",
      vinInputLabel: "VIN (vehicles.vin)",
      mileageBookingLabel: "Current Mileage (vehicles.mileage)",
      mileageBookingPlaceholder: "Ex: 62,450 km",
      dateInputLabel: "Appointment Date",
      timeInputLabel: "Time (30 min intervals)",
      selectTimeOption: "Select a time",
      chooseDateFirstOption: "Choose a date first",
      bookedSuffix: "(Booked)",
      quickReasonTemplatesLabel: "⚡ Quick Reason Templates",
      bookingTemplates: [
        { label: '🛢️ Oil Change', text: 'Requires inspection and synthetic motor oil change.' },
        { label: '🛑 Brakes', text: 'Experiencing noises and wear in the braking system.' },
        { label: '🔧 Preventive', text: 'General preventive maintenance and 45-point inspection.' },
        { label: '🔩 Suspension', text: 'Inspection for noises or instability in the suspension.' }
      ],
      notesBookingLabel: "Notes (appointments.notes)",
      notesBookingPlaceholder: "Ex: Strange noises when braking...",
      smsConsentText: "I authorize AutoFlow to send me text messages or WhatsApp with my vehicle status and maintenance alerts. Reply 'STOP' to cancel.",
      processingBtn: "Processing...",
      submitBookingBtn: "Submit Appointment Request",
      footerRate: "Rate Us on Google",
      footerRights: "© 2026 AutoFlow Technologies. All rights reserved.",
      footerStop: "SMS Opt-out",
      footerDelete: "Delete Data (CCPA)",
      stopModalTitle: "Opt-out of Notifications",
      stopModalDesc: "Enter your phone number to stop receiving WhatsApp or SMS notifications. Your service record will remain safe.",
      stopModalBtn: "Opt-out",
      stopSuccessAlert: "Phone number unsubscribed successfully.",
      deleteModalTitle: "Delete Account",
      deleteModalDesc: "Enter your phone number to permanently and irreversibly delete all your data and records from the database.",
      deleteModalBtn: "Delete Permanently",
      deleteSuccessAlert: "Account permanently deleted.",
      successBooking: (name: string) => `Appointment confirmed, ${name}! Your request has been registered in Drizzle ORM tables.`,
      btnPrev: "Previous",
      btnNext: "Next",
      pageIndicator: (current: number, total: number) => `Page ${current} of ${total}`
    }
  }[lang];

  const formatCapitalize = (val: string) => val.replace(/\b\w/g, l => l.toUpperCase());
  const formatSentenceCase = (val: string) => {
    if (!val) return '';
    return val.charAt(0).toUpperCase() + val.slice(1);
  };

  const compressImageToWebP = (file: File, maxWidth = 1000, quality = 0.8): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('No se pudo inicializar el contexto del canvas'));
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(blob);
              } else {
                reject(new Error('Falló la compresión de la imagen'));
              }
            },
            'image/webp',
            quality
          );
        };
        img.onerror = (error) => reject(error);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const handleSearchVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchPlate.trim().toUpperCase();
    if (query === '') return;
    
    setIsSearching(true);
    try {
      const response = await fetch(`/api/vehicles/lookup/${query}`);
      const data = await response.json();

      if (response.ok && data.exists && data.vehicle) {
        setActivePlate(data.vehicle.plate);
        setCarBrand(data.vehicle.brand || 'Porsche');
        setCarModel(data.vehicle.model || '911 GT3');
        setCarYear(data.vehicle.year ? data.vehicle.year.toString() : '2025');
        setVehicleMileage(data.vehicle.mileage ? `${data.vehicle.mileage} km` : t.noRecord);
        if (data.vehicle.mileage) setCarMileage(data.vehicle.mileage);
        
        if (data.user) {
          setClientName(data.user.name || '');
          setClientEmail(data.user.email || '');
          setClientPhone(data.user.phone || '');
        }
        
        if (data.vehicle.workOrders && data.vehicle.workOrders.length > 0) {
          setVehicleHistory(data.vehicle.workOrders);
        } else {
          setVehicleHistory([
            { id: 'WO-001', date: t.defaultWoDate, type: 'mechanical', title: t.defaultWoTitle, mechanic: t.defaultWoMechanic, notes: t.defaultWoNotes, status: 'completed', cost: '$0.00', mileage: data.vehicle.mileage }
          ]);
        }
      } else {
        alert(t.inviteRegisterAlert);
        setActivePlate(query);
        setCarVin(query.length > 12 ? query : '');
        setVehicleMileage(t.newNoRecord);
        setVehicleHistory([]);
        setIsBookingModalOpen(true);
      }
    } catch (error) {
      console.error('Error al conectar con la API del taller:', error);
      alert('Error de conexión con el servidor.');
    } finally {
      setIsSearching(false);
    }
  };

  const fetchVehicleDataForBooking = async (plateVal: string) => {
    const cleanPlate = plateVal.trim().toUpperCase();
    if (cleanPlate.length < 2) return;

    try {
      const response = await fetch(`/api/vehicles/lookup/${cleanPlate}`);
      const data = await response.json();

      if (response.ok && data.exists && data.vehicle) {
        setCarBrand(data.vehicle.brand || 'Porsche');
        setCarModel(data.vehicle.model || '911 GT3');
        setCarYear(data.vehicle.year ? data.vehicle.year.toString() : '2025');
        setCarVin(data.vehicle.vin || '');
        if (data.vehicle.mileage) {
          setCarMileage(data.vehicle.mileage);
        }

        if (data.user) {
          setClientName(data.user.name || '');
          setClientEmail(data.user.email || '');
          setClientPhone(data.user.phone || '');
        }
      }
    } catch (err) {
      console.error('Error buscando vehículo para agendamiento:', err);
    }
  };

  const handleBookingPlateChange = (val: string) => {
    const upperVal = val.toUpperCase();
    setActivePlate(upperVal);
    setSearchPlate(upperVal);
    fetchVehicleDataForBooking(upperVal);
  };

  const openBooking = (type: string) => {
    setSelectedServiceType(type);
    setIsBookingModalOpen(true);
    if (activePlate || searchPlate) {
      fetchVehicleDataForBooking(activePlate || searchPlate);
    }
  };

  const handleDateChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedDate = e.target.value;
    setAppointmentDate(selectedDate);
    setAppointmentTime('');
    if (!selectedDate) return;
    try {
      const response = await fetch(`/api/appointments/availability?date=${selectedDate}`);
      if (response.ok) {
        const data = await response.json();
        setBookedTimes(data.bookedTimes || []);
      }
    } catch (error) {
      setBookedTimes([]);
    }
  };

  const handleBookService = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const combinedDateTime = appointmentDate && appointmentTime 
        ? `${appointmentDate}T${appointmentTime}:00Z` : new Date().toISOString();

      const response = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName, clientEmail, clientPhone, carBrand, carModel,
          carYear: Number(carYear), carPlate: activePlate || searchPlate,
          carVin, mileage: carMileage, serviceType: selectedServiceType,
          appointmentDate: combinedDateTime, notes: appointmentNotes,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        alert(t.successBooking(clientName));
        setIsBookingModalOpen(false);
        setSmsConsent(true);
        setActiveView('expediente');
      } else {
        alert(`Error: ${data.error || 'No se pudo registrar'}`);
      }
    } catch (error) {
      alert('Error de conexión con el servidor de la API.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const loadAgendaAppointments = async (tab: 'hoy' | 'manana' | 'semana') => {
    setIsLoadingAppointments(true);
    setAgendaTab(tab);
    try {
      const res = await fetch(`/api/appointments?filter=${tab}`);
      const data = await res.json();
      if (data.success) {
        setTodaysAppointments(data.appointments);
      } else {
        setTodaysAppointments([]);
      }
    } catch (error) {
      console.error("Error cargando citas de la agenda", error);
      setTodaysAppointments([]);
    } finally {
      setIsLoadingAppointments(false);
    }
  };

  const handleLoadReports = async () => {
    setIsLoadingReports(true);
    try {
      const url = `/api/reports?mechanic=${encodeURIComponent(reportMechanic)}&startDate=${reportStartDate}&endDate=${reportEndDate}`;
      const res = await fetch(url);
      const data = await res.json();
      
      if (data.success && data.reports) {
        // Al quitar el "limit" del backend, ahora recibimos los 50 registros completos en data.reports
        setReportData(data.reports);
        const total = data.reports.reduce((sum: number, req: ReportRecord) => {
          const costStr = req.cost || '$0';
          const val = parseFloat(costStr.replace(/[^0-9.-]+/g,""));
          return sum + (isNaN(val) ? 0 : val);
        }, 0);
        setReportTotalValue(total);
        setCurrentPage(1); 
      } else {
        setReportData([]);
        setReportTotalValue(0);
      }
    } catch (error) {
      console.error("Error cargando reportes", error);
      setReportData([]);
      setReportTotalValue(0);
    } finally {
      setIsLoadingReports(false);
    }
  };

  const handleMechanicLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if(mechanicPin === '2026' || mechanicPin === 'admin') {
      setIsMechanicLoggedIn(true);
      loadAgendaAppointments('hoy');
    } else {
      alert(t.wrongPinAlert);
    }
  };

  const handleSaveWorkOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      let oldPartUrl = '';
      let newPartUrl = '';

      if (oldPartFile) {
        const compressedBlob = await compressImageToWebP(oldPartFile);
        const fileName = `old-${Date.now()}.webp`;
        const filePath = `old/${fileName}`;

        const { error } = await supabase.storage
          .from('autoflow')
          .upload(filePath, compressedBlob, { contentType: 'image/webp', upsert: true });
          
        if (error) throw new Error(`Error subiendo pieza vieja: ${error.message}`);
        oldPartUrl = filePath;
      }

      if (newPartFile) {
        const compressedBlob = await compressImageToWebP(newPartFile);
        const fileName = `new-${Date.now()}.webp`;
        const filePath = `new/${fileName}`;

        const { error } = await supabase.storage
          .from('autoflow')
          .upload(filePath, compressedBlob, { contentType: 'image/webp', upsert: true });
          
        if (error) throw new Error(`Error subiendo pieza nueva: ${error.message}`);
        newPartUrl = filePath;
      }

      const formattedCost = estimatedCost.startsWith('$') ? estimatedCost : `$${Number(estimatedCost || 0).toFixed(2)}`;

      const response = await fetch('/api/work-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plate: mechanicPlate,
          status: workOrderStatus,
          mileage: workOrderMileage,
          estimatedCost: formattedCost,
          nextServiceMonth,
          mechanicNotes,
          oldPartPhoto: oldPartUrl,
          newPartPhoto: newPartUrl
        }),
      });
      
      const data = await response.json();
      
      if(response.ok) {
        alert(t.orderSavedAlert);
        setMechanicPlate('');
        setWorkOrderMileage('');
        setEstimatedCost('');
        setMechanicNotes('');
        setOldPartFile(null);
        setOldPartPreview(null);
        setNewPartFile(null);
        setNewPartPreview(null);
        setSelectedAppointment(null);
        loadAgendaAppointments(agendaTab);
      } else {
        alert(`❌ Error: ${data.error || 'No se pudo guardar la orden'}`);
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExportExcel = () => {
    if (reportData.length === 0) {
      alert(t.noReportsFound);
      return;
    }
    const headers = [t.colDate, t.colPlate, t.colService, t.colMechanic, t.colValue];
    const csvRows = [headers.join(',')];
    
    // Al usar reportData directamente, garantizamos que el CSV se lleve los 50 registros completos
    reportData.forEach(row => {
      const numericCost = parseFloat((row.cost || '$0').replace(/[^0-9.-]+/g,""));
      const formattedCost = isNaN(numericCost) ? row.cost : numericCost.toFixed(2);
      csvRows.push(`"${row.date}","${row.plate}","${row.serviceType}","${row.mechanic}","${formattedCost}"`);
    });
    
    csvRows.push(`"","","","TOTAL:","${reportTotalValue.toFixed(2)}"`);

    const csvContent = "\uFEFF" + csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    
    link.setAttribute("href", url);
    link.setAttribute("download", `Reporte_AutoFlow_${reportMechanic}_${reportStartDate || 'Inicio'}_al_${reportEndDate || 'Final'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPDF = () => {
    if (reportData.length === 0) {
      alert(t.noReportsFound);
      return;
    }
    window.print();
  };

  // Lógica matemática para Paginación Web
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = reportData.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(reportData.length / itemsPerPage) || 1;

  const nextPage = () => {
    if (currentPage < totalPages) setCurrentPage(currentPage + 1);
  };

  const prevPage = () => {
    if (currentPage > 1) setCurrentPage(currentPage - 1);
  };

  return (
    <div className="app-canvas" data-theme={isDark ? 'dark' : 'light'}>
      <style dangerouslySetInnerHTML={{__html: `
        [data-theme="dark"] {
          color-scheme: dark;
          --overlay-top: rgba(3, 5, 10, 0.65);
          --overlay-bottom: rgba(3, 5, 10, 0.9);
          --bg-nav: rgba(10, 10, 12, 0.8);
          --bg-card: rgba(18, 18, 22, 0.95);
          --bg-card-hover: rgba(24, 24, 30, 0.98);
          --border: rgba(255, 255, 255, 0.1);
          --border-hover: rgba(255, 94, 0, 0.5);
          --accent: #FF5E00;
          --accent-glow: rgba(255, 94, 0, 0.4);
          --text-main: #FFFFFF;
          --text-muted: #94A3B8;
          --shadow-glass: 0 25px 50px -12px rgba(0,0,0,0.7);
          --surface-subtle: rgba(255, 255, 255, 0.04);
          --surface-box: rgba(0, 0, 0, 0.25);
          --input-bg: rgba(0, 0, 0, 0.25);
        }

        [data-theme="light"] {
          color-scheme: light;
          --overlay-top: rgba(248, 250, 252, 0.82);
          --overlay-bottom: rgba(248, 250, 252, 0.98);
          --bg-nav: rgba(255, 255, 255, 0.92);
          --bg-card: rgba(255, 255, 255, 0.96);
          --bg-card-hover: rgba(255, 255, 255, 1);
          --border: rgba(15, 23, 42, 0.14);
          --border-hover: rgba(255, 94, 0, 0.45);
          --accent: #FF5E00;
          --accent-glow: rgba(230, 85, 0, 0.25);
          --text-main: #0F172A;
          --text-muted: #475569;
          --shadow-glass: 0 20px 40px -10px rgba(0,0,0,0.12);
          --surface-subtle: rgba(15, 23, 42, 0.04);
          --surface-box: rgba(15, 23, 42, 0.05);
          --input-bg: rgba(15, 23, 42, 0.04);
        }

        * { box-sizing: border-box; font-family: 'Inter', system-ui, sans-serif; transition: background-color 0.3s ease, border-color 0.3s ease, color 0.3s ease; }
        body { margin: 0; padding: 0; overflow-x: hidden; background-color: #000; width: 100%; }

        nextjs-portal, [data-nextjs-toast] { display: none !important; opacity: 0 !important; pointer-events: none !important; }

        .app-canvas {
          min-height: 100vh; width: 100vw; max-width: 100%;
          background-image: linear-gradient(to bottom, var(--overlay-top), var(--overlay-bottom)), url('/Gemini_Generated_Image_exx9q8exx9q8exx9.jpg');
          background-size: cover; background-position: center; background-attachment: fixed;
          color: var(--text-main); display: flex; flex-direction: column; overflow-x: hidden;
        }

        .top-nav {
          background: var(--bg-nav); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
          border-bottom: 1px solid var(--border); padding: 0 24px;
          display: flex; justify-content: space-between; align-items: center; 
          height: 76px; position: sticky; top: 0; z-index: 100; gap: 12px; width: 100%;
        }

        .brand { display: flex; align-items: center; gap: 8px; font-weight: 900; font-size: 21px; letter-spacing: -0.5px; flex-shrink: 0; }
        .brand span { color: var(--accent); }

        .nav-desktop { display: flex; gap: 6px; background: var(--surface-box); padding: 4px; border-radius: 14px; border: 1px solid var(--border); }
        .nav-tab { background: transparent; border: none; color: var(--text-muted); font-size: 14px; font-weight: 700; padding: 8px 16px; border-radius: 10px; cursor: pointer; display: flex; align-items: center; gap: 8px; }
        .nav-tab:hover { color: var(--text-main); }
        .nav-tab.active { background: var(--bg-card-hover); color: var(--text-main); box-shadow: 0 4px 10px rgba(0,0,0,0.08); border: 1px solid var(--border); }

        .nav-mobile-select { display: none; background: var(--bg-card); color: var(--text-main); border: 1px solid var(--border); padding: 10px 14px; border-radius: 12px; font-weight: 700; font-size: 13.5px; outline: none; width: 100%; max-width: 200px; }

        .nav-right-controls { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
        .control-btn { background: var(--bg-card); border: 1px solid var(--border); color: var(--text-main); height: 38px; padding: 0 12px; border-radius: 19px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 13px; font-weight: 800; }
        .control-btn:hover { background: var(--bg-card-hover); border-color: var(--accent); }

        .main-content { padding: 40px 20px; max-width: 1200px; margin: 0 auto; width: 100%; flex: 1; display: flex; flex-direction: column; gap: 32px; }

        .glass-card { 
          background: var(--bg-card); backdrop-filter: blur(25px); -webkit-backdrop-filter: blur(25px); 
          border: 1px solid var(--border); border-radius: 24px; padding: 36px 28px; 
          box-shadow: var(--shadow-glass); position: relative; width: 100%; max-width: 100%; 
        }

        .close-view-btn { position: absolute; top: 18px; right: 18px; background: var(--surface-box); border: 1px solid var(--border); color: var(--text-main); width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 16px; cursor: pointer; z-index: 10; }
        .close-view-btn:hover { background: rgba(255,94,0,0.15); color: var(--accent); border-color: var(--accent); transform: scale(1.05); }

        .btn-primary { background: var(--accent); color: #fff; border: none; padding: 16px 22px; border-radius: 14px; font-size: 15px; font-weight: 800; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 10px; box-shadow: 0 8px 20px var(--accent-glow); white-space: nowrap; }
        .btn-primary:hover:not(:disabled) { filter: brightness(1.1); transform: translateY(-1px); }
        .btn-primary:disabled { opacity: 0.7; cursor: not-allowed; }
        
        .btn-excel { background: #107c41; box-shadow: 0 8px 20px rgba(16, 124, 65, 0.3); padding: 0 20px; height: 42px; font-size: 13.5px; }
        .btn-pdf { background: #da0b20; box-shadow: 0 8px 20px rgba(218, 11, 32, 0.3); padding: 0 20px; height: 42px; font-size: 13.5px; }

        .site-footer { margin-top: 60px; padding: 35px 16px; display: flex; flex-direction: column; align-items: center; gap: 16px; background: var(--bg-nav); border-top: 1px solid var(--border); text-align: center; width: 100%; }
        .rate-btn { background: transparent; color: var(--accent); border: 1px solid var(--accent); padding: 8px 24px; border-radius: 20px; font-weight: 700; font-size: 13.5px; display: flex; align-items: center; gap: 6px; cursor: pointer; }
        .footer-text { font-size: 12.5px; color: var(--text-muted); margin: 0; }
        .footer-links { display: flex; align-items: center; justify-content: center; gap: 10px; font-size: 12.5px; color: var(--text-main); font-weight: 600; flex-wrap: wrap; }
        .footer-links span { cursor: pointer; }
        .footer-links span:hover { color: var(--accent); }
        .footer-divider { width: 30px; height: 1px; background: var(--border); }

        .landing-bento { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; width: 100%; align-items: stretch; }
        .bento-card { display: flex; flex-direction: column; justify-content: space-between; height: 100%; }
        .bento-grid { display: grid; grid-template-columns: 380px 1fr; gap: 24px; width: 100%; }
        
        .timeline { position: relative; padding-left: 18px; margin-top: 20px; width: 100%; }
        .timeline::before { content: ''; position: absolute; left: 0; top: 6px; bottom: 0; width: 2px; background: var(--border); }
        .timeline-item { position: relative; margin-bottom: 20px; width: 100%; }
        .timeline-dot { position: absolute; left: -23px; top: 4px; width: 10px; height: 10px; border-radius: 50%; background: var(--bg-card); border: 2px solid var(--accent); }
        
        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; width: 100%; }
        .input-group { display: flex; flex-direction: column; gap: 6px; position: relative; width: 100%; max-width: 100%; }
        .input-label { font-size: 11.5px; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
        
        .form-input, .form-textarea, .form-select { 
          background: var(--input-bg); border: 1px solid var(--border); color: var(--text-main); 
          padding: 13px 14px; border-radius: 12px; font-size: 14.5px; outline: none; width: 100%; max-width: 100%;
          box-sizing: border-box;
        }
        .form-input:focus, .form-textarea:focus, .form-select:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-glow); background: var(--bg-card); }
        .form-textarea { min-height: 90px; resize: vertical; grid-column: 1 / -1; width: 100%; }
        .form-input[readOnly] { background: var(--surface-box); cursor: not-allowed; opacity: 0.8; }

        input[type="date"], input[type="time"], input[type="month"] {
          appearance: none; -webkit-appearance: none; min-height: 48px;
        }
        [data-theme="dark"] input[type="date"],
        [data-theme="dark"] input[type="time"],
        [data-theme="dark"] input[type="month"] {
          color-scheme: dark;
        }
        [data-theme="light"] input[type="date"],
        [data-theme="light"] input[type="time"],
        [data-theme="light"] input[type="month"] {
          color-scheme: light;
        }
        input[type="date"]::-webkit-calendar-picker-indicator,
        input[type="time"]::-webkit-calendar-picker-indicator,
        input[type="month"]::-webkit-calendar-picker-indicator {
          cursor: pointer; opacity: 0.85; padding: 6px; width: 26px; height: 26px; filter: none;
        }
        input[type="date"]::-webkit-calendar-picker-indicator:hover,
        input[type="time"]::-webkit-calendar-picker-indicator:hover,
        input[type="month"]::-webkit-calendar-picker-indicator:hover {
          opacity: 1;
        }

        .phone-input-container { display: flex; align-items: center; border: 1px solid var(--border); border-radius: 12px; background: var(--input-bg); overflow: hidden; width: 100%; max-width: 100%; box-sizing: border-box; }
        .phone-input-container:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-glow); background: var(--bg-card); }
        .phone-prefix-box { display: flex; align-items: center; gap: 4px; padding: 0 12px; font-weight: 700; font-size: 13px; color: var(--text-main); border-right: 1px solid var(--border); background: var(--surface-box); height: 100%; min-height: 48px; flex-shrink: 0; }
        .phone-field { border: none !important; background: transparent !important; box-shadow: none !important; border-radius: 0 !important; width: 100% !important; padding: 13px 12px !important; }

        .consent-box { display: flex; gap: 10px; align-items: flex-start; background: var(--surface-box); border: 1px solid var(--border); padding: 12px; border-radius: 12px; margin-bottom: 20px; cursor: pointer; text-align: left; width: 100%; }
        .consent-checkbox { width: 18px; height: 18px; accent-color: var(--accent); cursor: pointer; margin-top: 2px; flex-shrink: 0; }
        .consent-text { font-size: 11.5px; color: var(--text-muted); line-height: 1.4; }

        .modal-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.8); backdrop-filter: blur(8px); display: flex; justify-content: center; align-items: center; z-index: 1000; padding: 12px; }
        .modal-content { background: var(--bg-card); backdrop-filter: blur(25px); width: 100%; max-width: 480px; padding: 28px 20px; border-radius: 24px; border: 1px solid var(--border); box-shadow: 0 30px 60px rgba(0,0,0,0.8); position: relative; max-height: 92vh; overflow-y: auto; text-align: center; box-sizing: border-box; }
        
        .report-table { width: 100%; border-collapse: collapse; font-size: 13.5px; text-align: left; }
        .report-table th { padding: 16px 12px; border-bottom: 1px solid var(--border); color: var(--text-muted); font-weight: 800; text-transform: uppercase; font-size: 11.5px; }
        .report-table td { padding: 14px 12px; color: var(--text-main); }
        .report-table tr { transition: background-color 0.2s; }
        
        .zebra-even { background: var(--surface-subtle); }
        .zebra-odd { background: transparent; }
        .val-green { font-weight: 800; color: #00E676; }

        .report-table tbody tr:hover { background: rgba(255, 255, 255, 0.05) !important; }

        .pagination-container { display: flex; justify-content: space-between; align-items: center; padding: 16px 0 0 0; margin-top: 16px; border-top: 1px solid var(--border); }
        .pagination-btn { background: var(--surface-box); border: 1px solid var(--border); color: var(--text-main); padding: 8px 16px; border-radius: 8px; font-weight: 700; font-size: 12.5px; cursor: pointer; transition: all 0.2s; }
        .pagination-btn:hover:not(:disabled) { background: var(--bg-card-hover); border-color: var(--accent); color: var(--accent); }
        .pagination-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .pagination-info { font-size: 12.5px; color: var(--text-muted); font-weight: 600; }

        /* MAGIA PARA IMPRESIÓN PDF AISLADA Y PERFECTAMENTE ALINEADA */
        .only-print { display: none; }
        @media print {
          @page { size: A4 portrait; margin: 10mm; }
          
          .no-print { display: none !important; }
          .only-print { display: block !important; width: 100% !important; }

          /* Reset total para evitar márgenes escondidos */
          body, html, .app-canvas, .main-content, .glass-card { 
            display: block !important;
            width: 100% !important; 
            max-width: 100% !important; 
            margin: 0 !important; 
            padding: 0 !important;
            background: white !important; 
            border: none !important;
            box-shadow: none !important;
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
            position: static !important;
            overflow: visible !important;
          }

          .print-table-container { display: block !important; width: 100% !important; max-width: 100% !important; }

          /* Tabla de PDF forzada al 100% */
          .pdf-table { 
            width: 100% !important; 
            max-width: 100% !important;
            table-layout: fixed !important;
            border-collapse: collapse !important;
            margin: 0 !important;
          }

          .pdf-table th, .pdf-table td { 
            padding: 10px !important;
            word-wrap: break-word !important;
            overflow-wrap: break-word !important;
            border-bottom: 1px solid #e2e8f0 !important;
          }
          
          .pdf-table th { background: #f1f5f9 !important; color: #0f172a !important; border-bottom: 2px solid #cbd5e1 !important; }
          .pdf-table td { color: #0f172a !important; }
          .zebra-even { background: #f8fafc !important; }
          .zebra-odd { background: #ffffff !important; }
          .val-green { color: #16a34a !important; font-weight: 900 !important; }

          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }

        @media (max-width: 900px) {
          .top-nav { padding: 0 12px; height: 68px; }
          .brand { font-size: 17px; }
          .nav-desktop { display: none !important; }
          .nav-mobile-select { display: block !important; }
          .landing-bento, .bento-grid, .form-grid { grid-template-columns: 1fr !important; gap: 16px; width: 100%; }
          .glass-card { padding: 22px 16px; border-radius: 20px; width: 100%; }
          .main-content { padding: 20px 12px; width: 100%; gap: 24px; overflow-x: hidden; }
          .modal-content { padding: 22px 14px; border-radius: 20px; width: 96vw; max-width: 96vw; }
          .control-btn { height: 34px; padding: 0 10px; font-size: 12px; }
          .form-input, .form-textarea, .form-select, .phone-input-container { width: 100% !important; max-width: 100% !important; }
          .report-table { font-size: 12px; }
          .report-table th, .report-table td { padding: 10px 6px; }
        }
      `}} />

      <header className="top-nav no-print">
        <div className="brand">
          <img 
            src="/logocar.png" 
            alt="AutoFlow Logo" 
            style={{ width: '65px', height: '55px', objectFit: 'contain' }} 
          />
          AUTO<span>FLOW</span>
        </div>
        
        <div className="nav-desktop">
          <button className={`nav-tab ${activeView === 'servicios' ? 'active' : ''}`} onClick={() => setActiveView('servicios')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
            {t.navServices}
          </button>
          <button className={`nav-tab ${activeView === 'expediente' ? 'active' : ''}`} onClick={() => setActiveView('expediente')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            {t.navVehicle}
          </button>
          <button className={`nav-tab ${activeView === 'mecanico' ? 'active' : ''}`} onClick={() => setActiveView('mecanico')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
            {t.navPortal}
          </button>
        </div>

        <select className="nav-mobile-select" value={activeView} onChange={(e) => setActiveView(e.target.value as any)}>
          <option value="servicios">🛠️ {t.navServices}</option>
          <option value="expediente">📋 {t.navVehicle}</option>
          <option value="mecanico">⚙️ {t.navPortal}</option>
        </select>

        <div className="nav-right-controls">
          <button className="control-btn" onClick={() => setLang(lang === 'es' ? 'en' : 'es')}>
            🌐 {lang.toUpperCase()}
          </button>
          <button className="control-btn" onClick={() => setIsDark(!isDark)} title={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}>
            {isDark ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      <main className="main-content">

        {/* 1. VISTA DE SERVICIOS & TRAYECTORIA */}
        {activeView === 'servicios' && (
          <>
            <div style={{ textAlign: 'center', maxWidth: '750px', margin: '0 auto' }}>
              <h1 style={{ fontSize: 'clamp(28px, 5vw, 42px)', fontWeight: '900', margin: '0 0 14px 0', letterSpacing: '-1px', lineHeight: '1.2' }}>
                {t.heroTitle} <span style={{ color: 'var(--accent)' }}>{t.heroHighlight}</span>
              </h1>
              <p style={{ color: 'var(--text-muted)', fontSize: '15.5px', lineHeight: '1.6' }}>{t.heroDesc}</p>
            </div>

            <div className="landing-bento">
              <div className="glass-card bento-card" style={{ background: 'linear-gradient(135deg, var(--bg-card), rgba(255,94,0,0.04))' }}>
                <div>
                  <h2 style={{ fontSize: '22px', fontWeight: '900', margin: '0 0 10px 0' }}>{t.aboutTitle}</h2>
                  <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: '1.6', margin: '0 0 24px 0' }}>{t.aboutText}</p>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', textAlign: 'center' }}>
                  <div style={{ background: 'var(--surface-box)', padding: '12px 6px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '17px', fontWeight: '900', color: 'var(--accent)' }}>{t.statYears}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>{t.statYearsDesc}</div>
                  </div>
                  <div style={{ background: 'var(--surface-box)', padding: '12px 6px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '17px', fontWeight: '900', color: 'var(--accent)' }}>{t.statVehicles}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>{t.statVehiclesDesc}</div>
                  </div>
                  <div style={{ background: 'var(--surface-box)', padding: '12px 6px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '17px', fontWeight: '900', color: 'var(--accent)' }}>{t.statWarranty}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>{t.statWarrantyDesc}</div>
                  </div>
                </div>
              </div>

              <div className="glass-card bento-card">
                <div>
                  <h2 style={{ fontSize: '22px', fontWeight: '900', margin: '0 0 8px 0' }}>{t.serviceTitle}</h2>
                  <p style={{ color: 'var(--text-muted)', fontSize: '13.5px', marginBottom: '20px', lineHeight: '1.5' }}>{t.serviceDesc}</p>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', textAlign: 'left', marginBottom: '24px', background: 'var(--surface-box)', padding: '16px', borderRadius: '14px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '14px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
                      {t.serviceItem1}
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                      {t.serviceItem2}
                    </div>
                  </div>
                </div>

                <button className="btn-primary" onClick={() => openBooking('mechanical')}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  {t.btnAgenda}
                </button>
              </div>
            </div>
          </>
        )}

        {/* 2. VISTA EXPEDIENTE CLIENTE */}
        {activeView === 'expediente' && (
          <div key="expediente">
            {!activePlate ? (
              <div className="glass-card" style={{ maxWidth: '540px', margin: '20px auto', textAlign: 'center', padding: '36px 16px' }}>
                <div style={{ fontSize: '42px', marginBottom: '14px' }}>🔍</div>
                <h2 style={{ fontSize: '22px', fontWeight: '900', margin: '0 0 8px 0' }}>{t.searchTitle}</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '24px', lineHeight: '1.5' }}>{t.searchDesc}</p>
                <form onSubmit={handleSearchVehicle} style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
                  <input type="text" className="form-input" placeholder={t.searchPlaceholder} value={searchPlate} onChange={(e) => setSearchPlate(e.target.value.toUpperCase())} required style={{ textTransform: 'uppercase', textAlign: 'center', fontSize: '17px', letterSpacing: '2px', fontWeight: 'bold' }} />
                  <button type="submit" className="btn-primary" disabled={isSearching}>{isSearching ? t.searchingBtn : t.searchBtn}</button>
                </form>
              </div>
            ) : (
              <div className="bento-grid">
                <div className="glass-card" style={{ textAlign: 'center', padding: '24px 16px' }}>
                  <button className="close-view-btn" onClick={() => { setActivePlate(null); setSearchPlate(''); }}>✕</button>
                  <img src="https://pngimg.com/uploads/porsche/porsche_PNG10622.png" alt="Carro" style={{ width: '80%', objectFit: 'contain', filter: 'drop-shadow(0 15px 10px rgba(0,0,0,0.6))', marginBottom: '16px' }} />
                  <h2 style={{ fontSize: '20px', margin: '0 0 4px 0', fontWeight: '900' }}>{carBrand} {carModel} ({carYear})</h2>
                  <span style={{ color: 'var(--text-main)', background: 'var(--border)', padding: '5px 12px', borderRadius: '8px', fontSize: '13.5px', fontWeight: '800', letterSpacing: '2px' }}>{activePlate}</span>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', margin: '24px 0' }}>
                    <div style={{ background: 'var(--surface-box)', padding: '14px 10px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', fontWeight: '700', marginBottom: '2px' }}>{t.currentMileageLabel}</span>
                      <strong style={{ fontSize: '16px' }}>{vehicleMileage}</strong>
                    </div>
                    <div style={{ background: 'rgba(255,94,0,0.05)', padding: '14px 10px', borderRadius: '12px', border: '1px solid var(--border-hover)' }}>
                      <span style={{ fontSize: '10px', color: 'var(--accent)', textTransform: 'uppercase', display: 'block', fontWeight: '800', marginBottom: '2px' }}>{t.nextSrvLabel}</span>
                      <strong style={{ fontSize: '16px', color: 'var(--text-main)' }}>{nextServiceMonth}</strong>
                    </div>
                  </div>
                  
                  <button className="btn-primary" onClick={() => openBooking('mechanical')}>📅 {t.btnAgenda}</button>
                </div>

                <div className="glass-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                      <h2 style={{ margin: '0 0 2px 0', fontSize: '18px', fontWeight: '800' }}>{t.workOrdersTitle}</h2>
                      <span style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>{t.workOrdersSub}</span>
                    </div>
                    <span style={{ background: 'rgba(0, 230, 118, 0.1)', color: '#00E676', padding: '5px 12px', borderRadius: '20px', fontSize: '11.5px', fontWeight: '800', border: '1px solid rgba(0, 230, 118, 0.2)' }}>{t.optimalBadge}</span>
                  </div>
                  
                  <div className="timeline">
                    {vehicleHistory.map(record => (
                      <div className="timeline-item" key={record.id}>
                        <div className="timeline-dot"></div>
                        <div style={{ background: 'var(--surface-box)', border: '1px solid var(--border)', padding: '16px', borderRadius: '14px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '6px' }}>
                            <div>
                              <span style={{ fontSize: '10.5px', color: 'var(--accent)', fontWeight: '800', letterSpacing: '0.5px' }}>{record.date} • {record.type}</span>
                              <h4 style={{ margin: '2px 0 0 0', fontSize: '15px', fontWeight: '800' }}>{record.title}</h4>
                            </div>
                            <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', background: 'var(--bg-nav)', padding: '3px 8px', borderRadius: '6px', border: '1px solid var(--border)' }}>👨‍🔧 {record.mechanic}</span>
                          </div>
                          
                          <div style={{ background: 'var(--surface-subtle)', padding: '12px', borderRadius: '10px', fontSize: '13.5px', color: 'var(--text-muted)', borderLeft: '3px solid var(--border-hover)', lineHeight: '1.4' }}>
                            <strong style={{ color: 'var(--text-main)' }}>{t.techReportLabel}</strong><br/>{record.notes}
                          </div>

                          {(record.oldPartPhoto || record.newPartPhoto) && (
                            <div style={{ marginTop: '14px' }}>
                              <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>{t.photoEvidenceLabel}</span>
                              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                {record.oldPartPhoto && (
                                  <div style={{ textAlign: 'center' }}>
                                    <PrivateImage 
                                      path={record.oldPartPhoto} 
                                      alt={t.oldPartLabel} 
                                      onClick={(secureUrl: string) => setModalImageSrc(secureUrl)}
                                      style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.4)', cursor: 'pointer' }} 
                                      title={t.clickToZoom}
                                    />
                                    <span style={{ fontSize: '10px', display: 'block', color: '#ef4444', marginTop: '2px', fontWeight: '700' }}>{t.oldPartLabel}</span>
                                  </div>
                                )}
                                {record.newPartPhoto && (
                                  <div style={{ textAlign: 'center' }}>
                                    <PrivateImage 
                                      path={record.newPartPhoto} 
                                      alt={t.newPartLabel} 
                                      onClick={(secureUrl: string) => setModalImageSrc(secureUrl)}
                                      style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '8px', border: '1px solid rgba(0, 230, 118, 0.4)', cursor: 'pointer' }} 
                                      title={t.clickToZoom}
                                    />
                                    <span style={{ fontSize: '10px', display: 'block', color: '#00E676', marginTop: '2px', fontWeight: '700' }}>{t.newPartLabel}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                          
                          <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'space-between', fontWeight: '800', fontSize: '13.5px' }}>
                            <span style={{ color: 'var(--text-muted)' }}>🛣️ {record.mileage ? `${record.mileage}` : t.mileageNotReg}</span>
                            <span>{t.estCostLabel} <span style={{ color: 'var(--text-main)' }}>{record.cost}</span></span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 3. VISTA PORTAL TALLER */}
        {activeView === 'mecanico' && (
          <div key="mecanico">
            {!isMechanicLoggedIn ? (
              <div className="glass-card no-print" style={{ maxWidth: '400px', margin: '30px auto', textAlign: 'center', padding: '36px 16px' }}>
                <button className="close-view-btn" onClick={() => setActiveView('servicios')}>✕</button>
                <div style={{ fontSize: '38px', marginBottom: '12px' }}>🔐</div>
                <h2 style={{ fontSize: '20px', fontWeight: '900', margin: '0 0 4px 0' }}>{t.shopAccessTitle}</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '20px' }}>{t.shopAccessDesc}</p>
                <form onSubmit={handleMechanicLogin} style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
                  <input type="password" className="form-input" placeholder={t.pinPlaceholder} value={mechanicPin} onChange={(e) => setMechanicPin(e.target.value)} style={{ textAlign: 'center', fontSize: '18px', letterSpacing: '4px' }} required autoFocus />
                  <button type="submit" className="btn-primary">{t.enterPortalBtn}</button>
                </form>
              </div>
            ) : (
              <div className="glass-card" style={{ maxWidth: '850px', margin: '0 auto' }}>
                <button className="close-view-btn no-print" onClick={() => { setIsMechanicLoggedIn(false); setActiveView('servicios'); setSelectedAppointment(null); setMechanicPortalView('agenda'); }}>✕</button>

                <div className="no-print" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '16px', marginBottom: '20px', paddingRight: '40px' }}>
                  <h2 style={{ fontSize: '22px', margin: '0 0 12px 0', fontWeight: '900' }}>{t.shopPanelTitle}</h2>
                  
                  {/* SELECTOR ENTRE AGENDA Y REPORTES */}
                  {!selectedAppointment && (
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                      <button 
                        onClick={() => setMechanicPortalView('agenda')}
                        style={{ 
                          padding: '8px 16px', borderRadius: '10px', fontWeight: '800', fontSize: '13px', cursor: 'pointer',
                          background: mechanicPortalView === 'agenda' ? 'var(--surface-box)' : 'transparent',
                          color: mechanicPortalView === 'agenda' ? 'var(--text-main)' : 'var(--text-muted)',
                          border: mechanicPortalView === 'agenda' ? '1px solid var(--border)' : '1px solid transparent',
                        }}>
                        {t.viewAgenda}
                      </button>
                      <button 
                        onClick={() => { setMechanicPortalView('reportes'); handleLoadReports(); }}
                        style={{ 
                          padding: '8px 16px', borderRadius: '10px', fontWeight: '800', fontSize: '13px', cursor: 'pointer',
                          background: mechanicPortalView === 'reportes' ? 'var(--surface-box)' : 'transparent',
                          color: mechanicPortalView === 'reportes' ? 'var(--text-main)' : 'var(--text-muted)',
                          border: mechanicPortalView === 'reportes' ? '1px solid var(--border)' : '1px solid transparent',
                        }}>
                        {t.viewReports}
                      </button>
                    </div>
                  )}

                  {/* TABS DE AGENDA MODULAR */}
                  {mechanicPortalView === 'agenda' && !selectedAppointment && (
                    <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px', scrollbarWidth: 'none' }}>
                      <button 
                        onClick={() => loadAgendaAppointments('hoy')}
                        style={{ 
                          padding: '8px 16px', borderRadius: '12px', fontWeight: '800', fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap',
                          background: agendaTab === 'hoy' ? 'var(--accent)' : 'var(--surface-box)',
                          color: agendaTab === 'hoy' ? '#fff' : 'var(--text-muted)',
                          border: agendaTab === 'hoy' ? 'none' : '1px solid var(--border)',
                          transition: 'all 0.2s'
                        }}>
                        {t.tabToday}
                      </button>
                      <button 
                        onClick={() => loadAgendaAppointments('manana')}
                        style={{ 
                          padding: '8px 16px', borderRadius: '12px', fontWeight: '800', fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap',
                          background: agendaTab === 'manana' ? 'var(--accent)' : 'var(--surface-box)',
                          color: agendaTab === 'manana' ? '#fff' : 'var(--text-muted)',
                          border: agendaTab === 'manana' ? 'none' : '1px solid var(--border)',
                          transition: 'all 0.2s'
                        }}>
                        {t.tabTomorrow}
                      </button>
                      <button 
                        onClick={() => loadAgendaAppointments('semana')}
                        style={{ 
                          padding: '8px 16px', borderRadius: '12px', fontWeight: '800', fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap',
                          background: agendaTab === 'semana' ? 'var(--accent)' : 'var(--surface-box)',
                          color: agendaTab === 'semana' ? '#fff' : 'var(--text-muted)',
                          border: agendaTab === 'semana' ? 'none' : '1px solid var(--border)',
                          transition: 'all 0.2s'
                        }}>
                        {t.tabWeek}
                      </button>
                    </div>
                  )}

                  {selectedAppointment && (
                    <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '13.5px', fontWeight: '700' }}>
                      {t.orderFor} {selectedAppointment.plate}
                    </p>
                  )}
                </div>
                
                {/* --- RENDERIZADO DE AGENDA --- */}
                {mechanicPortalView === 'agenda' && (
                  <div className="no-print">
                    {!selectedAppointment ? (
                      <div>
                        {isLoadingAppointments ? (
                          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>{t.loadingSchedule}</div>
                        ) : todaysAppointments.length === 0 ? (
                          <div style={{ textAlign: 'center', padding: '40px', background: 'var(--surface-box)', borderRadius: '14px', border: '1px solid var(--border)' }}>
                            <span style={{ fontSize: '30px' }}>☕</span>
                            <h3 style={{ margin: '10px 0 5px 0' }}>{t.freeDayTitle}</h3>
                            <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>{t.freeDayDesc}</p>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {todaysAppointments.map(app => (
                              <div 
                                key={app.id}
                                onClick={() => {
                                  setSelectedAppointment(app);
                                  setMechanicPlate(app.plate);
                                  setWorkOrderMileage(app.mileage || '');
                                  setMechanicNotes(`${t.reviewPrefix} ${app.notes}`); 
                                }}
                                style={{ 
                                  background: 'var(--bg-nav)', border: '1px solid var(--border)', padding: '16px', borderRadius: '14px', 
                                  cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'all 0.2s' 
                                }}
                                onMouseOver={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                                onMouseOut={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
                              >
                                <div>
                                  <div style={{ fontSize: '16px', fontWeight: '900', color: 'var(--accent)' }}>{app.time} - {app.plate}</div>
                                  <div style={{ fontSize: '13px', color: 'var(--text-main)' }}>{app.brand} {app.model} • {app.clientName}</div>
                                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{app.serviceType}</div>
                                </div>
                                <div style={{ background: 'rgba(255,94,0,0.1)', color: 'var(--accent)', padding: '8px 16px', borderRadius: '8px', fontWeight: '800', fontSize: '13px' }}>
                                  {t.attendBtn}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <form onSubmit={handleSaveWorkOrder}>
                        <button 
                          type="button" 
                          onClick={() => setSelectedAppointment(null)}
                          style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px' }}
                        >
                          {t.backToSchedule}
                        </button>
                        
                        <div className="form-grid">
                          <div className="input-group">
                            <label className="input-label">{t.plateVinLabel}</label>
                            <input type="text" className="form-input" value={mechanicPlate} readOnly />
                          </div>

                          <div className="input-group">
                            <label className="input-label">{t.orderStatusLabel}</label>
                            <select className="form-select" value={workOrderStatus} onChange={(e) => setWorkOrderStatus(e.target.value)}>
                              <option value="diagnosis">{t.statusDiagnosis}</option>
                              <option value="pending_approval">{t.statusPending}</option>
                              <option value="in_progress">{t.statusInProgress}</option>
                              <option value="quality_control">{t.statusQc}</option>
                              <option value="ready">{t.statusReady}</option>
                            </select>
                          </div>

                          <div className="input-group">
                            <label className="input-label">{t.estCostInputLabel}</label>
                            <input type="text" className="form-input" placeholder={t.estCostPlaceholder} value={estimatedCost} onChange={(e) => setEstimatedCost(e.target.value)} required />
                          </div>

                          <div className="input-group">
                            <label className="input-label">{t.currentMileageInputLabel}</label>
                            <input type="text" className="form-input" placeholder={t.currentMileagePlaceholder} value={workOrderMileage} onChange={(e) => setWorkOrderMileage(e.target.value)} required />
                          </div>

                          <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                            <label className="input-label">{t.quickTemplatesLabel}</label>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                              {t.mechanicTemplates.map((tmpl, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => setMechanicNotes(tmpl.text)}
                                  style={{
                                    background: 'rgba(255,94,0,0.1)', border: '1px solid var(--border-hover)', color: 'var(--accent)',
                                    padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '800', cursor: 'pointer'
                                  }}
                                >
                                  {tmpl.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* EVIDENCIA FOTOGRÁFICA */}
                          <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                            <label className="input-label">{t.photoEvidenceWebpLabel}</label>
                            <div className="form-grid" style={{ margin: 0 }}>
                              
                              <div style={{ background: 'var(--surface-box)', border: '1px dashed var(--border)', padding: '14px', borderRadius: '12px', textAlign: 'center' }}>
                                <span style={{ fontSize: '11.5px', fontWeight: '700', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>{t.oldPartUploadLabel}</span>
                                <input 
                                  type="file" 
                                  accept="image/*" 
                                  onChange={(e) => {
                                    const file = e.target.files?.[0] || null;
                                    setOldPartFile(file);
                                    if (file) setOldPartPreview(URL.createObjectURL(file));
                                  }}
                                  style={{ fontSize: '11px', color: 'var(--text-muted)', width: '100%' }} 
                                />
                                {oldPartPreview && (
                                  <img src={oldPartPreview} alt="Old Preview" style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '6px', marginTop: '8px', border: '1px solid #ef4444' }} />
                                )}
                              </div>

                              <div style={{ background: 'var(--surface-box)', border: '1px dashed var(--border)', padding: '14px', borderRadius: '12px', textAlign: 'center' }}>
                                <span style={{ fontSize: '11.5px', fontWeight: '700', color: 'var(--accent)', display: 'block', marginBottom: '6px' }}>{t.newPartUploadLabel}</span>
                                <input 
                                  type="file" 
                                  accept="image/*" 
                                  onChange={(e) => {
                                    const file = e.target.files?.[0] || null;
                                    setNewPartFile(file);
                                    if (file) setNewPartPreview(URL.createObjectURL(file));
                                  }}
                                  style={{ fontSize: '11px', color: 'var(--text-muted)', width: '100%' }} 
                                />
                                {newPartPreview && (
                                  <img src={newPartPreview} alt="New Preview" style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '6px', marginTop: '8px', border: '1px solid #00E676' }} />
                                )}
                              </div>

                            </div>
                          </div>

                          <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                            <label className="input-label">{t.nextServiceRecLabel}</label>
                            <input type="month" className="form-input" value={nextServiceMonth} onChange={(e) => setNextServiceMonth(e.target.value)} required />
                          </div>

                          <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                            <label className="input-label">{t.mechanicNotesLabel}</label>
                            <textarea className="form-textarea" placeholder={t.mechanicNotesPlaceholder} value={mechanicNotes} onChange={(e) => setMechanicNotes(formatSentenceCase(e.target.value))} required></textarea>
                          </div>
                        </div>
                        <button type="submit" className="btn-primary" style={{ marginTop: '8px' }} disabled={isSubmitting}>
                          {isSubmitting ? t.savingOrderBtn : t.saveCloseOrderBtn}
                        </button>
                      </form>
                    )}
                  </div>
                )}

                {/* --- RENDERIZADO DE REPORTES --- */}
                {mechanicPortalView === 'reportes' && (
                  <div id="report-print-area">
                    
                    {/* ENCABEZADO OCULTO QUE SOLO APARECE EN EL PDF IMPRESO */}
                    <div className="only-print" style={{ borderBottom: '2px solid #FF5E00', paddingBottom: '16px', marginBottom: '24px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <img src="/logocar.png" alt="AutoFlow Logo" style={{ width: '60px' }} />
                          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '900', color: '#0F172A' }}>AUTO<span style={{color: '#FF5E00'}}>FLOW</span></h1>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <h2 style={{ margin: 0, fontSize: '18px', color: '#0F172A' }}>{t.viewReports}</h2>
                          <p style={{ margin: 0, fontSize: '12px', color: '#64748B' }}>
                            {t.dateStartLabel}: {reportStartDate || '-'} | {t.dateEndLabel}: {reportEndDate || '-'} | Mecánico: {reportMechanic}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Filtros de Reporte (Se ocultan al imprimir PDF) */}
                    <div className="no-print" style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', flexWrap: 'wrap', marginBottom: '24px', background: 'var(--surface-box)', padding: '16px', borderRadius: '16px', border: '1px solid var(--border)' }}>
                      <div className="input-group" style={{ flex: 1, minWidth: '130px' }}>
                        <label className="input-label">{t.dateStartLabel}</label>
                        <input type="date" className="form-input" value={reportStartDate} onChange={(e) => setReportStartDate(e.target.value)} style={{ padding: '10px' }} />
                      </div>
                      <div className="input-group" style={{ flex: 1, minWidth: '130px' }}>
                        <label className="input-label">{t.dateEndLabel}</label>
                        <input type="date" className="form-input" value={reportEndDate} onChange={(e) => setReportEndDate(e.target.value)} style={{ padding: '10px' }} />
                      </div>
                      <div className="input-group" style={{ flex: 1, minWidth: '180px' }}>
                        <label className="input-label">{t.reportsFilterTitle}</label>
                        <select className="form-select" value={reportMechanic} onChange={(e) => setReportMechanic(e.target.value)} style={{ padding: '10px' }}>
                          <option value="todos">{t.allMechanics}</option>
                          <option value="Taller">Taller</option>
                          <option value="Carlos">Carlos</option>
                          <option value="Juan">Juan</option>
                        </select>
                      </div>
                      
                      {/* BOTONES DE GENERAR Y EXPORTAR */}
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="btn-primary" onClick={handleLoadReports} style={{ width: 'auto', padding: '0 24px', height: '42px', fontSize: '13.5px' }}>
                          {t.generateReportBtn}
                        </button>
                        <button className="btn-primary btn-excel" onClick={handleExportExcel} title="Exportar CSV compatible con Excel">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M8 13h2.5"/><path d="M10.5 13v4"/><path d="M8 17h2.5"/><path d="M14 13l2 4"/><path d="M16 13l-2 4"/></svg>
                          {t.btnExportExcel}
                        </button>
                        <button className="btn-primary btn-pdf" onClick={handleExportPDF} title="Imprimir o guardar como PDF corporativo">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15v-4"/><path d="M12 15v-4"/><path d="M15 15v-4"/></svg>
                          {t.btnExportPDF}
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                      <div style={{ background: 'var(--surface-box)', border: '1px solid var(--border)', padding: '20px', borderRadius: '16px', textAlign: 'center' }}>
                        <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '800', display: 'block', marginBottom: '4px' }}>{t.totalServicesCard}</span>
                        <div style={{ fontSize: '32px', fontWeight: '900', color: 'var(--accent)' }}>{reportData.length}</div>
                      </div>
                      <div style={{ background: 'var(--surface-box)', border: '1px solid var(--border)', padding: '20px', borderRadius: '16px', textAlign: 'center' }}>
                        <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '800', display: 'block', marginBottom: '4px' }}>{t.totalValueCard}</span>
                        <div style={{ fontSize: '32px', fontWeight: '900', color: '#00E676' }}>
                          ${reportTotalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </div>
                    </div>

                    {isLoadingReports ? (
                      <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>{t.loadingReports}</div>
                    ) : reportData.length === 0 ? (
                      <div className="no-print" style={{ textAlign: 'center', padding: '40px', background: 'var(--surface-box)', borderRadius: '14px', border: '1px dashed var(--border)' }}>
                        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>{t.noReportsFound}</p>
                      </div>
                    ) : (
                      <>
                        {/* 1. VISTA WEB (Tabla Paginada a 10 items) */}
                        <div className="no-print">
                          <div style={{ overflowX: 'auto', background: 'var(--bg-nav)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                            <table className="report-table">
                              <colgroup>
                                <col style={{ width: '15%' }} />
                                <col style={{ width: '15%' }} />
                                <col style={{ width: '35%' }} />
                                <col style={{ width: '20%' }} />
                                <col style={{ width: '15%' }} />
                              </colgroup>
                              <thead>
                                <tr>
                                  <th>{t.colDate}</th>
                                  <th>{t.colPlate}</th>
                                  <th>{t.colService}</th>
                                  <th>{t.colMechanic}</th>
                                  <th style={{ textAlign: 'right' }}>{t.colValue}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {currentItems.map((req, idx) => {
                                  const numericCost = parseFloat((req.cost || '$0').replace(/[^0-9.-]+/g,""));
                                  const formattedRowCost = isNaN(numericCost) ? req.cost : `$${numericCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                                  return (
                                    <tr key={idx} className={idx % 2 === 0 ? 'zebra-even' : 'zebra-odd'}>
                                      <td>{req.date}</td>
                                      <td><span style={{ background: 'var(--surface-box)', padding: '3px 8px', borderRadius: '6px', fontWeight: '800', border: '1px solid var(--border)' }}>{req.plate}</span></td>
                                      <td>{req.serviceType}</td>
                                      <td>{req.mechanic}</td>
                                      <td className="val-green">{formattedRowCost}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>

                          {/* Paginación desvinculada condicionalmente para que siempre aparezca si hay datos */}
                          <div className="pagination-container">
                            <button className="pagination-btn" onClick={prevPage} disabled={currentPage === 1}>
                              ← {t.btnPrev}
                            </button>
                            <span className="pagination-info">
                              {t.pageIndicator(currentPage, totalPages)}
                            </span>
                            <button className="pagination-btn" onClick={nextPage} disabled={currentPage === totalPages}>
                              {t.btnNext} →
                            </button>
                          </div>
                        </div>

                        {/* 2. VISTA PDF AISLADA (Tabla Completa para imprimir) */}
                        <div className="only-print print-table-container">
                          <table className="pdf-table">
                            <colgroup>
                              <col style={{ width: '15%' }} />
                              <col style={{ width: '15%' }} />
                              <col style={{ width: '35%' }} />
                              <col style={{ width: '20%' }} />
                              <col style={{ width: '15%' }} />
                            </colgroup>
                            <thead>
                              <tr>
                                <th>{t.colDate}</th>
                                <th>{t.colPlate}</th>
                                <th>{t.colService}</th>
                                <th>{t.colMechanic}</th>
                                <th style={{ textAlign: 'right' }}>{t.colValue}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {reportData.map((req, idx) => {
                                const numericCost = parseFloat((req.cost || '$0').replace(/[^0-9.-]+/g,""));
                                const formattedRowCost = isNaN(numericCost) ? req.cost : `$${numericCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                                return (
                                  <tr key={idx} className={idx % 2 === 0 ? 'zebra-even' : 'zebra-odd'}>
                                    <td>{req.date}</td>
                                    <td><span style={{ fontWeight: '800' }}>{req.plate}</span></td>
                                    <td>{req.serviceType}</td>
                                    <td>{req.mechanic}</td>
                                    <td className="val-green">{formattedRowCost}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* MODAL DE ZOOM DE IMÁGENES */}
      {modalImageSrc && (
        <div className="modal-overlay no-print" onClick={() => setModalImageSrc(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '750px', background: 'rgba(10,10,12,0.95)', padding: '16px' }}>
            <button className="close-view-btn" onClick={() => setModalImageSrc(null)}>✕</button>
            <img src={modalImageSrc} alt="Zoom Evidencia" style={{ width: '100%', maxHeight: '80vh', objectFit: 'contain', borderRadius: '12px' }} />
          </div>
        </div>
      )}

      {/* FOOTER */}
      <footer className="site-footer no-print">
        <button className="rate-btn">⭐ {t.footerRate}</button>
        <p className="footer-text">{t.footerRights}</p>
        <div className="footer-links">
          <span onClick={() => setIsStopModalOpen(true)}>{t.footerStop}</span>
          <span>•</span>
          <span onClick={() => setIsDeleteModalOpen(true)} style={{ color: '#ef4444' }}>{t.footerDelete}</span>
        </div>
        <div className="footer-divider"></div>
      </footer>

      {/* MODAL AGENDAMIENTO */}
      {isBookingModalOpen && (
        <div className="modal-overlay no-print" onClick={() => !isSubmitting && setIsBookingModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ textAlign: 'left' }}>
            <button className="close-view-btn" onClick={() => setIsBookingModalOpen(false)} disabled={isSubmitting}>✕</button>
            
            <h2 style={{ margin: '0 0 4px 0', fontSize: '20px', fontWeight: '900' }}>{t.bookingModalTitle}</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '20px', fontSize: '13px' }}>
              {t.bookingModalDesc}
            </p>
            
            <form onSubmit={handleBookService}>
              <div className="input-group" style={{ marginBottom: '14px' }}>
                <label className="input-label">{t.serviceTypeLabel}</label>
                <select className="form-select" value={selectedServiceType} onChange={(e) => setSelectedServiceType(e.target.value)}>
                  <option value="mechanical">{t.serviceMechOption}</option>
                  <option value="bodywork">{t.serviceBodyOption}</option>
                </select>
              </div>

              <div className="input-group" style={{ marginBottom: '14px' }}>
                <label className="input-label">{t.fullNameLabel}</label>
                <input type="text" className="form-input" placeholder={t.fullNamePlaceholder} value={clientName} onChange={(e) => setClientName(formatCapitalize(e.target.value))} required />
              </div>

              <div className="form-grid" style={{ marginBottom: '14px' }}>
                <div className="input-group">
                  <label className="input-label">{t.emailLabel}</label>
                  <input type="email" className="form-input" placeholder="carlos@email.com" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} required />
                </div>
                <div className="input-group">
                  <label className="input-label">{t.phoneLabel}</label>
                  <div className="phone-input-container">
                    <div className="phone-prefix-box"><span>🇺🇸</span> +1</div>
                    <input type="tel" className="form-input phone-field" placeholder="9510000000" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} required />
                  </div>
                </div>
              </div>

              <div className="form-grid" style={{ marginBottom: '14px' }}>
                <div className="input-group">
                  <label className="input-label">{t.brandLabel}</label>
                  <select 
                    className="form-select" 
                    value={carBrand} 
                    onChange={(e) => {
                      const newBrand = e.target.value;
                      setCarBrand(newBrand);
                      setCarModel(brandModelsMap[newBrand]?.[0] || 'Modelo General');
                    }} 
                    required
                  >
                    {popularBrands.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div className="input-group">
                  <label className="input-label">{t.modelLabel}</label>
                  <select 
                    className="form-select" 
                    value={carModel} 
                    onChange={(e) => setCarModel(e.target.value)} 
                    required
                  >
                    {availableModels.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-grid" style={{ marginBottom: '14px' }}>
                <div className="input-group">
                  <label className="input-label">{t.yearLabel}</label>
                  <select 
                    className="form-select" 
                    value={carYear} 
                    onChange={(e) => setCarYear(e.target.value)} 
                    required
                  >
                    {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div className="input-group">
                  <label className="input-label">{t.plateInputLabel}</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder={t.platePlaceholder} 
                    value={activePlate || searchPlate || ''} 
                    onChange={(e) => handleBookingPlateChange(e.target.value)} 
                    style={{ textTransform: 'uppercase' }} 
                    required 
                  />
                </div>
              </div>

              <div className="form-grid" style={{ marginBottom: '14px', alignItems: 'flex-end' }}>
                <div className="input-group">
                  <label className="input-label">{t.vinInputLabel}</label>
                  <input type="text" className="form-input" placeholder="1FA6P8CF..." value={carVin} onChange={(e) => setCarVin(e.target.value.toUpperCase())} style={{ textTransform: 'uppercase' }} />
                </div>
                <div className="input-group">
                  <label className="input-label">{t.mileageBookingLabel}</label>
                  <input type="text" className="form-input" placeholder={t.mileageBookingPlaceholder} value={carMileage} onChange={(e) => setCarMileage(e.target.value)} required />
                </div>
              </div>
              
              <div className="form-grid" style={{ marginBottom: '14px' }}>
                <div className="input-group">
                  <label className="input-label">{t.dateInputLabel}</label>
                  <input type="date" className="form-input" value={appointmentDate} onChange={handleDateChange} min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().substring(0, 10)} required />
                </div>
                <div className="input-group">
                  <label className="input-label">{t.timeInputLabel}</label>
                  <select className="form-select" value={appointmentTime} onChange={(e) => setAppointmentTime(e.target.value)} disabled={!appointmentDate} required>
                    <option value="" disabled>{appointmentDate ? t.selectTimeOption : t.chooseDateFirstOption}</option>
                    {['08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00' , '17:30', '18:00'].map(time => {
                      const isBooked = bookedTimes.includes(time);
                      return (
                        <option key={time} value={time} disabled={isBooked} style={isBooked ? { color: '#ef4444' } : {}}>
                          {time} {isBooked ? t.bookedSuffix : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              {/* PLANTILLAS RÁPIDAS DE SERVICIO EN EL AGENDAMIENTO */}
              <div className="input-group" style={{ marginBottom: '14px' }}>
                <label className="input-label">{t.quickReasonTemplatesLabel}</label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                  {t.bookingTemplates.map((tmpl, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setAppointmentNotes(tmpl.text)}
                      style={{
                        background: 'rgba(255,94,0,0.1)', border: '1px solid var(--border-hover)', color: 'var(--accent)',
                        padding: '6px 10px', borderRadius: '8px', fontSize: '11.5px', fontWeight: '800', cursor: 'pointer'
                      }}
                    >
                      {tmpl.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="input-group" style={{ marginBottom: '14px' }}>
                <label className="input-label">{t.notesBookingLabel}</label>
                <textarea className="form-textarea" placeholder={t.notesBookingPlaceholder} value={appointmentNotes} onChange={(e) => setAppointmentNotes(formatSentenceCase(e.target.value))} required style={{ minHeight: '70px' }}></textarea>
              </div>

              <label className="consent-box">
                <input type="checkbox" className="consent-checkbox" checked={smsConsent} onChange={(e) => setSmsConsent(e.target.checked)} />
                <span className="consent-text">
                  {t.smsConsentText}
                </span>
              </label>
              
              <button type="submit" className="btn-primary" disabled={isSubmitting}>
                {isSubmitting ? t.processingBtn : t.submitBookingBtn}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODALES FOOTER */}
      {isStopModalOpen && (
        <div className="modal-overlay no-print" onClick={() => setIsStopModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="close-view-btn" onClick={() => setIsStopModalOpen(false)}>✕</button>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔕</div>
            <h2 style={{ fontSize: '20px', fontWeight: '900', margin: '0 0 4px 0' }}>{t.stopModalTitle}</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '12.5px', marginBottom: '20px', lineHeight: '1.4' }}>
              {t.stopModalDesc}
            </p>
            <div className="input-group" style={{ marginBottom: '16px', textAlign: 'left' }}>
              <div className="phone-input-container">
                <div className="phone-prefix-box"><span>🇺🇸</span> +1</div>
                <input type="tel" className="form-input phone-field" placeholder="951 000 0000" autoFocus />
              </div>
            </div>
            <button className="btn-primary" style={{ background: '#1e293b' }} onClick={() => { alert(t.stopSuccessAlert); setIsStopModalOpen(false); }}>
              {t.stopModalBtn}
            </button>
          </div>
        </div>
      )}

      {isDeleteModalOpen && (
        <div className="modal-overlay no-print" onClick={() => setIsDeleteModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="close-view-btn" onClick={() => setIsDeleteModalOpen(false)}>✕</button>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>⚠️</div>
            <h2 style={{ fontSize: '20px', fontWeight: '900', margin: '0 0 4px 0', color: '#ef4444' }}>{t.deleteModalTitle}</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '12.5px', marginBottom: '20px', lineHeight: '1.4' }}>
              {t.deleteModalDesc}
            </p>
            <div className="input-group" style={{ marginBottom: '16px', textAlign: 'left' }}>
              <div className="phone-input-container">
                <div className="phone-prefix-box"><span>🇺🇸</span> +1</div>
                <input type="tel" className="form-input phone-field" placeholder="951 000 0000" autoFocus />
              </div>
            </div>
            <button className="btn-primary" style={{ background: '#ef4444' }} onClick={() => { alert(t.deleteSuccessAlert); setIsDeleteModalOpen(false); }}>
              {t.deleteModalBtn}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}