import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { db, tenants } from '@taller/database';
import { sql, eq } from 'drizzle-orm';

// 1. Carga del .env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// 2. INICIALIZAR EXPRESS PRIMERO (Obligatorio para que 'app' exista)
const app = express();

// 🛡️ Seguridad: CORS Estricto + Rate Limiting por IP
const allowedOrigins = [
  'https://picktimebook.com',
  'https://www.picktimebook.com',
  'https://autoflow.app',
  'https://saas-multinicho-platform.onrender.com',
  'http://localhost:8081',
  'http://localhost:3000',
  'http://127.0.0.1:8081',
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(null, true); // Permitir subdominios web/preview sin bloquear apps móviles
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-tenant-id'],
  credentials: true,
}));

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

const apiRateLimitMap = new Map<string, { count: number; resetAt: number }>();
app.use('/api/', (req, res, next) => {
  if (req.path === '/vapi/webhook') return next(); // No limitar webhooks entrantes de Vapi
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const record = apiRateLimitMap.get(ip);
  if (!record || now > record.resetAt) {
    apiRateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return next();
  }
  record.count += 1;
  if (record.count > 90) {
    return res.status(429).json({
      success: false,
      error: 'Demasiadas solicitudes desde esta IP. Por favor espera 1 minuto.'
    });
  }
  return next();
});

app.use(express.json({ limit: '5mb' }));

// 3. Importar Rutas y Controladores
import tenantRoutes from '../routes/tenantRoutes';
import serviceRoutes from '../routes/serviceRoutes';
import inventoryRoutes from '../routes/inventoryRoutes';
import appointmentRoutes from '../routes/appointmentRoutes';
import workOrderRoutes from '../routes/workOrderRoutes';
import { 
  completeWorkOrder, 
  getClientVehicleHistory, 
  getVehicleByPlate,
  cancelAppointment,
  confirmAppointment,           // 👈 Confirmar asistencia (Política 6h/3h)
  sendAppointmentReminder,      // 👈 Recordatorio 6h antes
  configureTenantVapiAssistant,     // 👈 Autoconfigurador 1-Clic Vapi.ai (BYOK)
  handleVapiVoiceWebhook,           // 👈 Webhook Bilingüe (ES/EN) de llamadas IA
  configureTenantTelegramChannel,   // 👈 Guardar Canal Interno de Telegram en BD por Negocio
  testTenantTelegramChannel,        // 👈 Enviar mensaje de prueba al Telegram del Consultorio
  detectTenantTelegramChatId,       // 👈 Autodetectar Chat ID del grupo del Consultorio en 1 clic
  requestAutoFlowSupport,           // 👈 Soporte técnico y acompañamiento (solo a AutoFlow Telegram)
  getPushCampaigns,             // 👈 Obtener campañas push
  createPushCampaign,           // 👈 Crear campaña push
  saveClientReview,              // 👈 Guardar reseña / reacción única por cliente
  getActiveLegalDocument,
  authenticateClientUser,
  updateClientProfile,           // 👈 Actualizar nombre y teléfono en BD
  registerDevicePushToken,
  startAppointmentRemindersCron,
  runSixHourAppointmentRemindersJob,
  notifyClientPush,
  notifyTenantPush,
  sendTelegramNotification
} from '../controllers/appointmentController';
import staffRoutes from '../routes/staffRoutes';
import directoryRoutes from '../routes/directoryRoutes';
import router from '../routes/reportsRoute';
import { generatePromoCode, getPromoCodes, validatePromoCode, backfillTenantTranslations } from '../controllers/tenantController';
import { backfillServiceTranslations } from '../controllers/serviceController';
import {
  getPlatformSettings,
  setCardPaymentsEnabled,
  createStripeCheckoutSession,
  handleStripeWebhook,
  getTenantPayments,
} from '../controllers/paymentController';
import { deleteAllNotifications, deleteNotificationById, getNotifications, markNotificationsRead } from '../controllers/notificationController';
import { handleClientAnonymize } from '../../controllers/authController';

// =========================================================================
// 🗄️ AUTO-MIGRACIÓN Y SEMILLA EN BD PARA NUEVOS NICHOS (LEGAL & DENTAL)
// Garantiza que PostgreSQL acepte 'legal', 'dental' y 'confirmed', crea el
// catálogo oficial de categorías en BD y registra negocios demo si no existen.
// =========================================================================
const DEFAULT_CATEGORIES = [
  { code: 'automotive', name: 'Talleres Mecánicos y Automotriz', shortTitle: 'Talleres & Auto', icon: 'car-sport-outline', color: '#FF5E00' },
  { code: 'spa', name: 'Spas y Centros de Belleza', shortTitle: 'Spas & Bienestar', icon: 'sparkles-outline', color: '#10B981' },
  { code: 'barbershop', name: 'Barberías y Salones Masculinos', shortTitle: 'Barberías', icon: 'scissors', color: '#FF5E00' },
  { code: 'legal', name: 'Abogados y Firmas Legales', shortTitle: 'Abogados & Firmas', icon: 'shield', color: '#3B82F6' },
  { code: 'dental', name: 'Odontología y Clínicas Dentales', shortTitle: 'Odontología & Clínicas', icon: 'tooth-outline', color: '#06B6D4' },
];

async function ensureMultinicheDatabaseReady() {
  try {
    // 1. Si en PostgreSQL existe algún ENUM para niche / business_type o status, agregamos 'legal', 'dental' y 'confirmed'
    await db.execute(sql`
      DO $$
      DECLARE
        enum_rec RECORD;
      BEGIN
        FOR enum_rec IN
          SELECT t.typname
          FROM pg_type t
          JOIN pg_enum e ON t.oid = e.enumtypid
          WHERE e.enumlabel IN ('automotive', 'spa', 'barbershop')
          GROUP BY t.typname
        LOOP
          EXECUTE format('ALTER TYPE %I ADD VALUE IF NOT EXISTS %L', enum_rec.typname, 'legal');
          EXECUTE format('ALTER TYPE %I ADD VALUE IF NOT EXISTS %L', enum_rec.typname, 'dental');
        END LOOP;

        FOR enum_rec IN
          SELECT t.typname
          FROM pg_type t
          JOIN pg_enum e ON t.oid = e.enumtypid
          WHERE e.enumlabel IN ('scheduled', 'completed')
          GROUP BY t.typname
        LOOP
          EXECUTE format('ALTER TYPE %I ADD VALUE IF NOT EXISTS %L', enum_rec.typname, 'confirmed');
          EXECUTE format('ALTER TYPE %I ADD VALUE IF NOT EXISTS %L', enum_rec.typname, 'cancelled');
        END LOOP;
      END $$;
    `);

    // 2. Crear tabla public.business_categories en BD e insertar las 5 categorías oficiales
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS public.business_categories (
        code VARCHAR(50) PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        short_title VARCHAR(80) NOT NULL,
        icon VARCHAR(60) DEFAULT 'briefcase',
        primary_color VARCHAR(20) DEFAULT '#FF5E00',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    for (const cat of DEFAULT_CATEGORIES) {
      await db.execute(sql`
        INSERT INTO public.business_categories (code, name, short_title, icon, primary_color, is_active)
        VALUES (${cat.code}, ${cat.name}, ${cat.shortTitle}, ${cat.icon}, ${cat.color}, true)
        ON CONFLICT (code) DO UPDATE SET
          name = EXCLUDED.name,
          short_title = EXCLUDED.short_title,
          icon = EXCLUDED.icon,
          primary_color = EXCLUDED.primary_color,
          is_active = true;
      `);
    }

    // 3. Sembrar 1 Bufete de Abogados y 1 Clínica Odontológica en public.tenants si aún no existen en BD
    const existingLegal = await db.select().from(tenants).where(eq(tenants.niche, 'legal' as any));
    if (existingLegal.length === 0) {
      await db.insert(tenants).values({
        id: '123e4567-e89b-12d3-a456-426614174004',
        name: 'Firma Legal Gómez & Asociados',
        niche: 'legal',
        address: '450 N Brand Blvd, Suite 600',
        city: 'Pasadena',
        state: 'CA',
        zipCode: '91101',
        latitude: '34.1478',
        longitude: '-118.1445',
        primaryColor: '#3B82F6',
        planTier: 'elite',
        subscriptionStatus: 'active'
      } as any);
      console.log('⚖️ Negocio demo de Abogados (legal) creado en la BD.');
    }

    const existingDental = await db.select().from(tenants).where(eq(tenants.niche, 'dental' as any));
    if (existingDental.length === 0) {
      await db.insert(tenants).values({
        id: '123e4567-e89b-12d3-a456-426614174005',
        name: 'Clínica Dental Sonrisa Pro',
        niche: 'dental',
        address: '820 Foothill Blvd, Suite 102',
        city: 'Rancho Cucamonga',
        state: 'CA',
        zipCode: '91730',
        latitude: '34.1064',
        longitude: '-117.5931',
        primaryColor: '#06B6D4',
        planTier: 'pro',
        subscriptionStatus: 'active'
      } as any);
      console.log('🦷 Negocio demo de Odontología (dental) creado en la BD.');
    }

    // 4. Asegurar columnas parametrizadas de Telegram por negocio en public.tenants
    await db.execute(sql`
      ALTER TABLE public.tenants
        ADD COLUMN IF NOT EXISTS telegram_chat_id VARCHAR(100),
        ADD COLUMN IF NOT EXISTS telegram_bot_token VARCHAR(255),
        ADD COLUMN IF NOT EXISTS telegram_enabled BOOLEAN DEFAULT true;
    `);

    // 5. Asegurar columnas de proveedor validado (iOS / Google / Usuario) en public.users
    await db.execute(sql`
      ALTER TABLE public.users
        ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(30) DEFAULT 'manual',
        ADD COLUMN IF NOT EXISTS is_verified_provider BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS apple_user_id VARCHAR(255);
    `);

    // 6. Asegurar columna bilingüe (ES/EN) JSONB en public.services
    await db.execute(sql`
      ALTER TABLE public.services
        ADD COLUMN IF NOT EXISTS translations JSONB DEFAULT '{}'::jsonb;
    `);

    // 7. Asegurar tabla public.platform_settings y public.payments (Stripe + Cupones)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS public.platform_settings (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);
    await db.execute(sql`
      INSERT INTO public.platform_settings (key, value)
      VALUES ('card_payments_enabled', 'false')
      ON CONFLICT (key) DO NOTHING;
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS public.payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES public.tenants(id),
        user_id UUID REFERENCES public.users(id),
        stripe_customer_id VARCHAR(255),
        stripe_subscription_id VARCHAR(255),
        stripe_checkout_session_id VARCHAR(255) UNIQUE,
        stripe_payment_intent_id VARCHAR(255) UNIQUE,
        stripe_invoice_id VARCHAR(255) UNIQUE,
        amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
        currency VARCHAR(10) NOT NULL DEFAULT 'usd',
        status VARCHAR(40) NOT NULL DEFAULT 'pending',
        payment_method VARCHAR(40) NOT NULL DEFAULT 'stripe_card',
        plan_tier VARCHAR(50),
        promo_code VARCHAR(60),
        billing_period_start TIMESTAMP,
        billing_period_end TIMESTAMP,
        receipt_url TEXT,
        failure_reason TEXT,
        metadata JSONB DEFAULT '{}'::jsonb,
        paid_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    // 8. Asegurar tabla public.account_deletion_logs (motivos de salida sin PII)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS public.account_deletion_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID,
        user_id UUID,
        role VARCHAR(30) DEFAULT 'client',
        reason_code VARCHAR(60) NOT NULL,
        reason_label TEXT NOT NULL,
        custom_feedback TEXT,
        appointments_count INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    console.log('✅ Base de datos sincronizada con los nichos (automotive, spa, barbershop, legal, dental) y Canal Interno de Telegram por negocio.');
  } catch (err) {
    console.warn('⚠️ Aviso verificando esquema multi-nicho en BD:', err);
  }
}

// Endpoint para obtener las categorías directamente desde la Base de Datos (usado en register.tsx y directorio)
app.get('/api/categories', async (_req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT code, name, short_title AS "shortTitle", icon, primary_color AS "color"
      FROM public.business_categories
      WHERE is_active = true
      ORDER BY CASE code
        WHEN 'automotive' THEN 1
        WHEN 'spa' THEN 2
        WHEN 'barbershop' THEN 3
        WHEN 'legal' THEN 4
        WHEN 'dental' THEN 5
        ELSE 6
      END
    `);
    const rows = Array.isArray(result) ? result : (result as any).rows || [];
    return res.status(200).json({
      success: true,
      categories: rows.length > 0 ? rows : DEFAULT_CATEGORIES
    });
  } catch (error) {
    return res.status(200).json({
      success: true,
      categories: DEFAULT_CATEGORIES
    });
  }
});

// 4. Registrar Rutas de Express
// Healthcheck ligero (sin tocar BD) para waking / monitoreo rápido en Render o proxies
app.get('/health', (_req, res) => {
  return res.status(200).json({ ok: true, status: 'alive', timestamp: new Date().toISOString() });
});
app.get('/api/health', (_req, res) => {
  return res.status(200).json({ ok: true, status: 'alive', timestamp: new Date().toISOString() });
});

app.use('/api/reports', router); // Ruta para reportar comentarios
app.use('/api/staff', staffRoutes);
app.use('/api/tenants', tenantRoutes);
app.post('/api/services/backfill-translations', backfillServiceTranslations);
app.post('/api/tenants/backfill-translations', backfillTenantTranslations);
app.use('/api/services', serviceRoutes);
app.use('/api/directory', directoryRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/work-orders', workOrderRoutes);
app.use('/api/appointments', appointmentRoutes);

// Rutas de Configuración Global (SuperAdmin) y Pagos Stripe (`public.payments`)
app.get('/api/platform-settings', getPlatformSettings);
app.put('/api/platform-settings/card-payments', setCardPaymentsEnabled);
app.post('/api/payments/create-checkout-session', createStripeCheckoutSession);
app.post('/api/payments/webhook', handleStripeWebhook);
app.get('/api/payments/history', getTenantPayments);

// Rutas de Cupones Promocionales (public.promo_codes)
app.get('/api/promo-codes', getPromoCodes);
app.post('/api/promo-codes/generate', generatePromoCode);
app.post('/api/promo-codes/validate', validatePromoCode);

// Rutas directas para Expediente, Perfil, Cierre de Orden, Cancelación y Confirmación 6h/3h
app.get('/api/clients/vehicle/:plate', getVehicleByPlate);
app.get('/api/clients/history/:identifier', getClientVehicleHistory);
app.post('/api/clients/auth', authenticateClientUser);
app.post('/api/clients/anonymize', handleClientAnonymize);
app.post('/api/clients/auth/anonymize', handleClientAnonymize);
app.put('/api/clients/profile', updateClientProfile);
app.put('/api/appointments/:appointmentId/cancel', cancelAppointment);
app.put('/api/appointments/:appointmentId/complete', completeWorkOrder);
app.put('/api/appointments/:appointmentId/confirm', confirmAppointment);
app.post('/api/appointments/:appointmentId/remind', sendAppointmentReminder);
app.get('/api/legal-documents/active', getActiveLegalDocument);

// Rutas de Recepción Telefónica IA (Vapi.ai 1-Clic BYOK + Webhook Bilingüe ES/EN)
app.post('/api/tenants/vapi-setup', configureTenantVapiAssistant);
app.post('/api/vapi/webhook', handleVapiVoiceWebhook);

router.post('/api/push-tokens/register', registerDevicePushToken);

// Rutas del Canal Interno de Telegram Parametrizado por Consultorio / Negocio
app.put('/api/tenants/telegram-config', configureTenantTelegramChannel);
app.post('/api/tenants/telegram-test', testTenantTelegramChannel);
app.post('/api/tenants/telegram-detect-chat', detectTenantTelegramChatId);

// Ruta de Soporte y Acompañamiento AutoFlow (solo al Telegram central de AutoFlow, nunca al cliente)
app.post('/api/support/autoflow', requestAutoFlowSupport);

// Rutas de Campañas Push y Reseñas Únicas por Cliente
app.get('/api/campaigns', getPushCampaigns);
app.post('/api/campaigns', createPushCampaign);
app.post('/api/reviews', saveClientReview);

// Rutas de Bandeja de Notificaciones (Cliente y Negocio)
app.get('/api/notifications', getNotifications);
app.put('/api/notifications/read', markNotificationsRead);
app.delete('/api/notifications/:id', deleteNotificationById);
app.delete('/api/notifications', deleteAllNotifications);

// Rutas de prueba (Cron 6h + Telegram + Push)
app.post('/api/dev/run-reminders-cron', async (req, res) => {
  const forceAllActive = Boolean(req.body?.forceAllActive);
  const stats = await (runSixHourAppointmentRemindersJob as any)(forceAllActive ? { forceAllActive } : undefined);
  return res.json({ success: true, forceAllActive, ...stats });
});

app.post('/api/dev/test-notifications', async (req, res) => {
  const { tenantId, clientUserId, staffId, clientName, serviceName, whenLabel } = req.body || {};
  if (!tenantId) {
    return res.status(400).json({ success: false, message: 'Falta tenantId' });
  }
  const cName = clientName || 'Cliente Prueba';
  const sName = serviceName || 'Corte + Barba';
  const whenStr = whenLabel || 'En ~6 horas';

  const settled = await Promise.allSettled([
    sendTelegramNotification(
      `💈 <b>[PRUEBA] Cita en Barbería</b>\n👤 <b>Cliente:</b> ${cName}\n✂️ <b>Servicio:</b> ${sName}\n🕒 <b>Horario:</b> ${whenStr}`,
      tenantId,
      'status'
    ),
    clientUserId
      ? notifyClientPush(
          tenantId,
          clientUserId,
          {
            title: '⏰ Recordatorio de tu Cita',
            body: `Hola ${cName}, tienes ${sName} (${whenStr}).`,
            data: { tenantId, eventType: 'dev_test_client' },
          },
          'dev_test_client'
        )
      : Promise.resolve({ skipped: true, reason: 'no_clientUserId' }),
    notifyTenantPush(
      tenantId,
      {
        title: `✂️ Cita asignada: ${cName}`,
        body: `${sName} • ${whenStr}`,
        data: { tenantId, staffId: staffId || null, eventType: 'dev_test_staff' },
      },
      staffId || null
    ),
  ]);

  const debugTrace = settled.map((item, idx) => ({
    step: idx === 0 ? 'telegram' : idx === 1 ? 'clientPush' : 'tenantStaffPush',
    status: item.status,
    value: item.status === 'fulfilled' ? item.value : String((item as PromiseRejectedResult).reason || 'error'),
  }));

  return res.json({ success: true, message: 'Prueba ejecutada (Telegram si aplica + Push cliente + Push trabajador).', debugTrace });
});

app.post(['/api/notifications/staff-event', '/api/notifications/send', '/api/dev/notify-assigned', '/api/dev/notify-cancelled'], async (req, res) => {
  try {
    const body = req.body || {};
    const tenantId = String(body.tenantId || req.headers['x-tenant-id'] || '').trim();
    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'Falta tenantId' });
    }

    const isCancelled = body.eventType === 'cancelled' || String(req.path || '').includes('notify-cancelled');
    const sLabel = body.staffName || 'Staff asignado';
    const cLabel = body.clientName || 'Cliente';
    const srvLabel = body.serviceName || 'Servicio';
    const whenStr = [body.appointmentDate, body.appointmentTime].filter(Boolean).join(' • ') || 'Hoy';

    const tgText = isCancelled
      ? `❌ <b>Cita Cancelada (${sLabel})</b>\n👤 <b>Cliente:</b> ${cLabel}\n✂️ <b>Servicio:</b> ${srvLabel}\n🕒 <b>Horario:</b> ${whenStr}${body.reason ? `\n📝 <b>Motivo:</b> ${body.reason}` : ''}`
      : `📌 <b>Nueva Cita Asignada (${sLabel})</b>\n👤 <b>Cliente:</b> ${cLabel}\n✂️ <b>Servicio:</b> ${srvLabel}\n🕒 <b>Horario:</b> ${whenStr}`;

    const pushTitle = body.title || (isCancelled ? `❌ Cita cancelada (${sLabel})` : `📌 Nueva cita asignada (${sLabel})`);
    const pushBody = body.body || `${cLabel} • ${srvLabel} (${whenStr})`;

    const settled = await Promise.allSettled([
      sendTelegramNotification(tgText, tenantId, isCancelled ? 'status' : 'appointment'),
      notifyTenantPush(
        tenantId,
        {
          title: pushTitle,
          body: pushBody,
          data: {
            tenantId,
            staffId: body.staffId || null,
            eventType: isCancelled ? 'appointment_cancelled' : 'appointment_assigned',
          },
        },
        body.staffId || null
      ),
    ]);

    const debugTrace = settled.map((item, idx) => ({
      step: idx === 0 ? 'telegram' : 'tenantStaffPush',
      status: item.status,
      value: item.status === 'fulfilled' ? item.value : String((item as PromiseRejectedResult).reason || 'error'),
    }));

    return res.json({ success: true, debugTrace });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message || 'Error enviando notificación a staff' });
  }
});

// 🛡️ Manejador global de errores para que una falla puntual de conexión no deje colgada la petición
app.use((err: any, _req: Request, res: Response, _next: any) => {
  console.error('❌ Error no controlado en Express:', err);
  if (!res.headersSent) {
    return res.status(500).json({
      success: false,
      message: err?.message || 'Error temporal de conexión en el servidor. Intenta de nuevo.',
    });
  }
});

// 5. Levantar el Servidor, sincronizar BD y arrancar Cron de recordatorios
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor ejecutándose en http://127.0.0.1:${PORT}`);
  ensureMultinicheDatabaseReady().finally(() => {
    startAppointmentRemindersCron();
    setInterval(() => {
      db.execute(sql`SELECT 1`).catch(() => {});
    }, 4 * 60 * 1000);
  });
});