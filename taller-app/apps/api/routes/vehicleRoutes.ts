import { Router } from 'express';
import { lookupVehicle } from '../controllers/vehicleController';

const router = Router();

router.get('/vehicles/lookup/:plate', lookupVehicle);

export default router;