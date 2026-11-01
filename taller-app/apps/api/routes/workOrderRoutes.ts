import { Router } from 'express';
// AQUÍ ESTÁ LA MAGIA: agregamos getReports al import
import { createWorkOrder, getReports } from '../controllers/workOrderController';

const router = Router();

router.post('/work-orders', createWorkOrder);
router.get('/reports', getReports);

export default router;