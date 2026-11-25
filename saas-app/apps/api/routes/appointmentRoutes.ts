import { Router } from 'express';
import {
  createAppointment,
  getAppointments,
  checkAvailability,
  getTodaysAppointments,
  getActiveLegalDocument,
  updateClientProfile,
  authenticateClientUser,
  getClientVehicleHistory,
  completeWorkOrder,
  confirmAppointment,
  sendAppointmentReminder,
  cancelAppointment,
  registerDevicePushToken,
  notifyTenantPush,
  sendTelegramNotification,
} from '../controllers/appointmentController';

const router = Router();

// Rutas de citas y disponibilidad
router.post('/', createAppointment);
router.get('/', getAppointments);
router.get('/availability', checkAvailability);
router.get('/today', getTodaysAppointments);
router.get('/legal-documents/active', getActiveLegalDocument);

// Rutas de perfil, autenticación e historial de cliente
router.put('/profile', updateClientProfile);
router.post('/clients/auth', authenticateClientUser);
router.get('/clients/history/:identifier', getClientVehicleHistory);

// Notificaciones de asignación y cancelación de citas para staff
router.post(['/notifications/staff-event', '/notifications/send'], async (req, res) => {
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

    const tgText = isCancelled
      ? `❌ <b>Cita Cancelada (${sLabel})</b>\n👤 <b>Cliente:</b> ${cLabel}\n✂️ <b>Servicio:</b> ${srvLabel}\n🕒 <b>Horario:</b> ${whenStr}${body.reason ? `\n📝 <b>Motivo:</b> ${body.reason}` : ''}`
      : `📌 <b>Nueva Cita Asignada (${sLabel})</b>\n👤 <b>Cliente:</b> ${cLabel}\n✂️ <b>Servicio:</b> ${srvLabel}\n🕒 <b>Horario:</b> ${whenStr}`;

    const pushTitle = body.title || (isCancelled ? `❌ Cita cancelada (${sLabel})` : `📌 Nueva cita asignada (${sLabel})`);
    const pushBody = body.body || `${cLabel} • ${srvLabel} (${whenStr})`;

    const results = await Promise.allSettled([
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

    return res.json({ success: true, results });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message || 'Error enviando notificación a staff' });
  }
});

// Acciones sobre una cita específica
router.put('/:appointmentId/complete', completeWorkOrder);
router.put('/:appointmentId/confirm', confirmAppointment);
router.post('/:appointmentId/remind', sendAppointmentReminder);
router.put('/:appointmentId/cancel', cancelAppointment);

router.post('/push-tokens/register', registerDevicePushToken);

export default router;
