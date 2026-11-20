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

// Acciones sobre una cita específica
router.put('/:appointmentId/complete', completeWorkOrder);
router.put('/:appointmentId/confirm', confirmAppointment);
router.post('/:appointmentId/remind', sendAppointmentReminder);
router.put('/:appointmentId/cancel', cancelAppointment);

export default router;