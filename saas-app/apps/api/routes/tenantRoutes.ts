import { Router } from 'express';
import { getTenantInfo, createTenant, updateTenantConfig, authenticateTenantStaff } from '../controllers/tenantController';

const router = Router();

router.get('/info', getTenantInfo);
router.post('/register', createTenant);
router.put('/config', updateTenantConfig);
router.post('/auth-staff', authenticateTenantStaff);

export default router;