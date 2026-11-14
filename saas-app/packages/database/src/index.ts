import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import dotenv from 'dotenv';
import path from 'path';

// Cargar .env para que funcione localmente sin quemar la URL
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../../../apps/api/.env') });

// Usar la variable de entorno de Render, o hacer fallback a tu local si no existe
const connectionString = process.env.DATABASE_URL || "postgresql://postgres:Valeria2311*@localhost:5432/multi-tenant";

// Render exige conexión segura (SSL), localhost no
const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

const client = postgres(connectionString, isLocal ? {} : { ssl: 'require', prepare: false });

export const db = drizzle(client, { schema });

export * from './schema';