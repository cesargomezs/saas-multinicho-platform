import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';

// Carga explícita del .env ubicado en apps/api/.env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import appointmentRoutes from '../routes/appointmentRoutes';
import vehicleRoutes from '../routes/vehicleRoutes';
import workOrderRoutes from '../routes/workOrderRoutes';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Montaje de rutas modulares bajo el prefijo /api
app.use('/api', appointmentRoutes);
app.use('/api', vehicleRoutes);
app.use('/api', workOrderRoutes);

app.listen(PORT, () => {
  console.log(`🚀 API del taller corriendo en el puerto ${PORT}`);
});