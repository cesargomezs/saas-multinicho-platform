import { Router } from 'express';
import { createTenant, getTenantInfo, updateTenantConfig } from '../controllers/tenantController';

const router = Router();

router.post('/', createTenant);
router.post('/register', createTenant); // 🌟 Ruta añadida para que coincida exactamente con el frontend
router.get('/info', getTenantInfo);
router.put('/config', updateTenantConfig); // 🌟 AQUÍ ESTÁ LA NUEVA RUTA 

export default router;