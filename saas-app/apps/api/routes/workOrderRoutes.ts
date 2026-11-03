import { Router } from 'express';
import { createWorkOrder, getReports } from '../controllers/workOrderController';

const router = Router();

router.post('/', createWorkOrder);
router.get('/reports', getReports);

export default router;