import { Router } from 'express';
import { getTenantById, searchDirectory } from '../controllers/directoryController';

const router = Router();

// GET /api/directory/search
router.get('/search', searchDirectory);
router.get('/:id', getTenantById);

export default router;