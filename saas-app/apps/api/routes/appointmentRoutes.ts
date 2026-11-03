import { Router } from 'express';
import { createAppointment, getAppointments, checkAvailability, getTodaysAppointments } from '../controllers/appointmentController';

const router = Router();

router.post('/', createAppointment);
router.get('/', getAppointments);
router.get('/availability', checkAvailability);
router.get('/today', getTodaysAppointments);

export default router;