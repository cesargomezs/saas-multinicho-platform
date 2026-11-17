import { Router } from 'express';
import { getTenantInfo, createTenant, updateTenantConfig, authenticateTenantStaff, loginOwnerAccount, searchDirectory } from '../controllers/tenantController';

const router = Router();

router.get('/info', getTenantInfo);
router.post('/register', createTenant);
router.put('/config', updateTenantConfig);
router.post('/auth-staff', authenticateTenantStaff);
router.post('/owner-login', loginOwnerAccount);
router.get('/directory/search', searchDirectory);

export default router;