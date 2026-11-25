import { Router } from 'express';
import {
  runSixHourAppointmentRemindersJob,
  notifyClientPush,
  notifyTenantPush,
  sendTelegramNotification,
} from '../controllers/appointmentController';

const devRouter = Router();

// 1) Disparar el Cron Job de recordatorios de inmediato para pruebas
devRouter.post('/dev/run-reminders-cron', async (req, res) => {
  try {
    const forceAllActive = Boolean(req.body?.forceAllActive);
    const stats = await (runSixHourAppointmentRemindersJob as any)(forceAllActive ? { forceAllActive } : undefined);
    console.log('[DEV-NOTIF] run-reminders-cron stats:', JSON.stringify(stats));
    return res.json({ success: true, forceAllActive, ...(stats && typeof stats === 'object' ? stats : {}) });
  } catch (err: any) {
    console.error('[DEV-NOTIF] run-reminders-cron error:', err);
    return res.status(500).json({ success: false, message: err?.message || 'Error ejecutando cron de recordatorios' });
  }
});

// 2) Probar envío combinado con trazas en consola/respuesta para ver dónde se queda
devRouter.post('/dev/test-notifications', async (req, res) => {
  const { tenantId, clientUserId, staffId, clientName, serviceName, whenLabel } = req.body || {};
  if (!tenantId) {
    return res.status(400).json({ success: false, message: 'Falta tenantId' });
  }

  const cName = clientName || 'Cliente Prueba';
  const sName = serviceName || 'Corte + Barba';
  const whenStr = whenLabel || 'En ~6 horas';

  console.log('[DEV-NOTIF] test-notifications start:', { tenantId, clientUserId, staffId, cName, sName, whenStr });

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

  console.log('[DEV-NOTIF] test-notifications trace:', JSON.stringify(debugTrace));

  return res.json({
    success: true,
    message: 'Prueba ejecutada. Revisa debugTrace para ver el resultado de cada canal.',
    debugTrace,
  });
});

// 3) Notificar ASIGNACIÓN de cita a staff
devRouter.post('/dev/notify-assigned', async (req, res) => {
  const { tenantId, staffId, staffName, clientName, clientPhone, serviceName, appointmentDate, appointmentTime } =
    req.body || {};
  if (!tenantId) {
    return res.status(400).json({ success: false, message: 'Falta tenantId' });
  }

  const sLabel = staffName || 'Staff asignado';
  const cLabel = clientName || 'Cliente';
  const srvLabel = serviceName || 'Servicio';
  const whenStr = [appointmentDate, appointmentTime].filter(Boolean).join(' • ') || 'Hoy';

  console.log('[DEV-NOTIF] notify-assigned:', { tenantId, staffId, sLabel, cLabel, srvLabel, whenStr });

  const settled = await Promise.allSettled([
    sendTelegramNotification(
      `📌 <b>Nueva Cita Asignada (${sLabel})</b>\n👤 <b>Cliente:</b> ${cLabel}${clientPhone ? ` (${clientPhone})` : ''}\n✂️ <b>Servicio:</b> ${srvLabel}\n🕒 <b>Horario:</b> ${whenStr}`,
      tenantId,
      'appointment'
    ),
    notifyTenantPush(
      tenantId,
      {
        title: `📌 Nueva cita asignada (${sLabel})`,
        body: `${cLabel} • ${srvLabel} (${whenStr})`,
        data: { tenantId, staffId: staffId || null, eventType: 'appointment_assigned' },
      },
      staffId || null
    ),
  ]);

  const debugTrace = settled.map((item, idx) => ({
    step: idx === 0 ? 'telegram' : 'tenantStaffPush',
    status: item.status,
    value: item.status === 'fulfilled' ? item.value : String((item as PromiseRejectedResult).reason || 'error'),
  }));

  return res.json({ success: true, eventType: 'assigned', debugTrace });
});

// 4) Notificar CANCELACIÓN de cita a staff
devRouter.post('/dev/notify-cancelled', async (req, res) => {
  const { tenantId, staffId, staffName, clientName, clientPhone, serviceName, appointmentDate, appointmentTime, reason } =
    req.body || {};
  if (!tenantId) {
    return res.status(400).json({ success: false, message: 'Falta tenantId' });
  }

  const sLabel = staffName || 'Staff asignado';
  const cLabel = clientName || 'Cliente';
  const srvLabel = serviceName || 'Servicio';
  const whenStr = [appointmentDate, appointmentTime].filter(Boolean).join(' • ') || 'Hoy';
  const reasonLine = reason ? `\n📝 <b>Motivo:</b> ${reason}` : '';

  console.log('[DEV-NOTIF] notify-cancelled:', { tenantId, staffId, sLabel, cLabel, srvLabel, whenStr, reason });

  const settled = await Promise.allSettled([
    sendTelegramNotification(
      `❌ <b>Cita Cancelada (${sLabel})</b>\n👤 <b>Cliente:</b> ${cLabel}${clientPhone ? ` (${clientPhone})` : ''}\n✂️ <b>Servicio:</b> ${srvLabel}\n🕒 <b>Horario:</b> ${whenStr}${reasonLine}`,
      tenantId,
      'status'
    ),
    notifyTenantPush(
      tenantId,
      {
        title: `❌ Cita cancelada (${sLabel})`,
        body: `${cLabel} • ${srvLabel} (${whenStr})${reason ? ` - ${reason}` : ''}`,
        data: { tenantId, staffId: staffId || null, eventType: 'appointment_cancelled' },
      },
      staffId || null
    ),
  ]);

  const debugTrace = settled.map((item, idx) => ({
    step: idx === 0 ? 'telegram' : 'tenantStaffPush',
    status: item.status,
    value: item.status === 'fulfilled' ? item.value : String((item as PromiseRejectedResult).reason || 'error'),
  }));

  return res.json({ success: true, eventType: 'cancelled', debugTrace });
});

// 5) Rutas llamadas desde el frontend (`/notifications/staff-event` y `/notifications/send`)
devRouter.post(['/notifications/staff-event', '/notifications/send'], async (req, res) => {
  try {
    const body = req.body || {};
    const tenantId = String(body.tenantId || req.headers['x-tenant-id'] || '').trim();
    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'Falta tenantId' });
    }

    const isCancelled = body.eventType === 'cancelled';
    const sLabel = body.staffName || 'Staff asignado';
    const cLabel = body.clientName || 'Cliente';
    const srvLabel = body.serviceName || 'Servicio';
    const whenStr = [body.appointmentDate, body.appointmentTime].filter(Boolean).join(' • ') || 'Hoy';

    console.log('[DEV-NOTIF] staff-event/send:', {
      tenantId,
      eventType: body.eventType,
      staffId: body.staffId,
      pushTokensCount: Array.isArray(body.pushTokens) ? body.pushTokens.length : 0,
    });

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
    console.error('[DEV-NOTIF] staff-event/send error:', err);
    return res.status(500).json({ success: false, message: err?.message || 'Error enviando notificación' });
  }
});

export default devRouter;
