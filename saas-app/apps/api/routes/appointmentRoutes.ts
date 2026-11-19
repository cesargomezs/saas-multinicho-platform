import { Router } from 'express';
import {
  createAppointment,
  getAppointments,
  checkAvailability,
  getTodaysAppointments,
  getActiveLegalDocument,
} from '../controllers/appointmentController';

const router = Router();

router.post('/', createAppointment);
router.get('/', getAppointments);
router.get('/availability', checkAvailability);
router.get('/today', getTodaysAppointments);
router.get('/legal-documents/active', getActiveLegalDocument);

export default router;