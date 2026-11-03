import { Router } from 'express';
import { getServices, createService, updateService, deleteService } from '../controllers/serviceController';

const router = Router();

router.get('/', getServices);
router.post('/', createService);
router.put('/:id', updateService);
router.delete('/:id', deleteService);

export default router;