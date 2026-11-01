import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// QUEMAMOS LA URL DIRECTO AQUÍ PARA ESQUIVAR EL FALLO DEL .ENV
const client = postgres("postgresql://postgres:Valeria2311*@localhost:5432/taller_db");

export const db = drizzle(client, { schema });

export * from './schema';