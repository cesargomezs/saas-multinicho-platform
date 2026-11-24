import { Router } from 'express';
import {
  runSixHourAppointmentRemindersJob,
  notifyClientPush,
  notifyTenantPush,
  sendTelegramNotification,
} from '../controllers/appointmentController';

const devRouter = Router();

// 1) Disparar el Cron Job de recordatorios de inmediato para pruebas
// Envía { "forceAllActive": true } en el body para probar con cualquier cita activa sin ajustar la hora a 6h
devRouter.post('/dev/run-reminders-cron', async (req, res) => {
  const forceAllActive = Boolean(req.body?.forceAllActive);
  const stats = await runSixHourAppointmentRemindersJob({ forceAllActive });
  return res.json({ success: true, forceAllActive, ...stats });
});

// 2) Probar envío combinado: Telegram del negocio (si está configurado) + Push al cliente + Push al trabajador/barbero
devRouter.post('/dev/test-notifications', async (req, res) => {
  const { tenantId, clientUserId, staffId, clientName, serviceName, whenLabel } = req.body || {};
  if (!tenantId) {
    return res.status(400).json({ success: false, message: 'Falta tenantId' });
  }

  const cName = clientName || 'Cliente Prueba';
  const sName = serviceName || 'Corte + Barba';
  const whenStr = whenLabel || 'En ~6 horas';

  await Promise.allSettled([
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
      : Promise.resolve(),
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

  return res.json({ success: true, message: 'Prueba ejecutada (Telegram si aplica + Push cliente + Push trabajador).' });
});

export default devRouter;
