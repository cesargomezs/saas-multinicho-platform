import { Router } from 'express';
import { createAppointment, checkAvailability, getTodaysAppointments } from '../controllers/appointmentController';

const router = Router();

// <-- Se quitó el '/today' para que coincida con el frontend y reciba los filtros (hoy, manana, semana)
router.get('/appointments', getTodaysAppointments); 
router.get('/appointments/availability', checkAvailability);
router.post('/appointments', createAppointment);

export default router;