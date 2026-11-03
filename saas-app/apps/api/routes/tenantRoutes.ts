import { Router } from 'express';
import { createTenant, getTenantInfo } from '../controllers/tenantController';

const router = Router();

router.post('/', createTenant);
router.get('/info', getTenantInfo);

export default router;