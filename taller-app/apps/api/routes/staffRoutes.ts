import { Router } from 'express';
import { getStaff, createStaff, updateStaff } from '../controllers/staffController';

const router = Router();

router.get('/', getStaff);
router.post('/', createStaff);
router.put('/:id', updateStaff);

export default router;