import type { Config } from 'drizzle-kit';
import * as dotenv from 'dotenv';

// Carga el .env desde la raíz de taller-app
dotenv.config({ path: '../../.env' });

export default {
  schema: './src/schema.ts',
  out: './drizzle',
  driver: 'pg',
  dbCredentials: {
    connectionString: process.env.DATABASE_URL || '',
  },
} as Config;