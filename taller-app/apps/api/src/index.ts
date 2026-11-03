import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';

// 1. Carga del .env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// 2. INICIALIZAR EXPRESS PRIMERO (Obligatorio para que 'app' exista)
const app = express();

app.use(cors());
app.use(express.json());

// 3. Importar Rutas y Controladores
import tenantRoutes from '../routes/tenantRoutes';
import serviceRoutes from '../routes/serviceRoutes';
import inventoryRoutes from '../routes/inventoryRoutes';
import appointmentRoutes from '../routes/appointmentRoutes';
import workOrderRoutes from '../routes/workOrderRoutes';
import { completeWorkOrder, getClientVehicleHistory, getVehicleByPlate } from '../controllers/appointmentController';
import staffRoutes from '../routes/staffRoutes';


// 4. Registrar Rutas de Express
app.use('/api/staff', staffRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/work-orders', workOrderRoutes);

// Ruta directa para consultar la placa desde el frontend
app.get('/api/clients/vehicle/:plate', getVehicleByPlate);
app.get('/api/clients/history/:identifier', getClientVehicleHistory);
app.put('/api/appointments/:appointmentId/complete', completeWorkOrder);


// 5. Levantar el Servidor
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor ejecutándose en http://127.0.0.1:${PORT}`);
});