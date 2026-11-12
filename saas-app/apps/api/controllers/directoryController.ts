import { Request, Response } from 'express';
// Importamos la interfaz SQL explícita para tipar correctamente los filtros
import { sql, eq, and, ilike, or, SQL } from 'drizzle-orm';



// Importamos la BD y el esquema desde el paquete del monorepo
import { db } from '@taller/database'; 
import { tenants, services } from '@taller/database'; 

// 🗺️ Diccionario Geográfico de Prueba (En producción se reemplaza por Google Maps API / Mapbox)
const MOCK_GEOCODER: Record<string, { lat: number; lng: number }> = {
  '91730': { lat: 34.1064, lng: -117.5931 }, // Rancho Cucamonga
  'rancho cucamonga': { lat: 34.1064, lng: -117.5931 },
  '90036': { lat: 34.0620, lng: -118.3490 }, // Los Angeles
  'los angeles': { lat: 34.0620, lng: -118.3490 },
  '91101': { lat: 34.1458, lng: -118.1319 }, // Pasadena
  'pasadena': { lat: 34.1458, lng: -118.1319 },
};

export const searchDirectory = async (req: Request, res: Response) => {
  try {
    const { locationQuery, niche, radius, nameQuery } = req.query;

    // 1. Inicializamos el arreglo tipado estrictamente como consultas SQL
    const filters: SQL[] = [];

    // 2. Filtro por Categoría/Nicho (Taller, Spa, Barbería)
    if (niche && niche !== 'all') {
      filters.push(eq(tenants.niche, niche as string));
    }

    // 3. Filtro Específico por Nombre de Negocio
    if (nameQuery) {
      filters.push(ilike(tenants.name, `%${nameQuery}%`));
    }

    let userLat: number | null = null;
    let userLng: number | null = null;

    // 4. Geocodificación y Fallback
    if (locationQuery) {
      const queryLower = (locationQuery as string).toLowerCase().trim();
      const coordinates = MOCK_GEOCODER[queryLower];

      if (coordinates) {
        // Tenemos coordenadas exactas para la fórmula de Haversine
        userLat = coordinates.lat;
        userLng = coordinates.lng;
      } else {
        // Fallback: Si no tenemos coordenadas, buscamos directamente por texto en ciudad o zip
        // Guardamos la condición en una variable para validar que no sea 'undefined' (Fix TypeScript)
        const fallbackCondition = or(
          ilike(tenants.city, `%${queryLower}%`),
          ilike(tenants.zipCode, `%${queryLower}%`)
        );
        
        if (fallbackCondition) {
          filters.push(fallbackCondition);
        }
      }
    }

    let results;
    const maxDistance = radius ? parseFloat(radius as string) : 30; // 30 millas por defecto

    // ========================================================================
    // 🧠 MOTOR DE BÚSQUEDA GEOGRÁFICA (FÓRMULA HAVERSINE EN POSTGRESQL)
    // ========================================================================
    if (userLat !== null && userLng !== null) {
      // Fórmula matemática para calcular distancia en Millas
      const distanceSql = sql<number>`(
        3959 * acos(
          cos(radians(${userLat})) * 
          cos(radians(${tenants.latitude})) * 
          cos(radians(${tenants.longitude}) - radians(${userLng})) + 
          sin(radians(${userLat})) * 
          sin(radians(${tenants.latitude}))
        )
      )`;

      filters.push(sql`${distanceSql} <= ${maxDistance}`);

      results = await db.select({
        id: tenants.id,
        name: tenants.name,
        niche: tenants.niche,
        city: tenants.city,
        zipCode: tenants.zipCode,
        logoUrl: tenants.logoUrl,
        primaryColor: tenants.primaryColor,
        distance: distanceSql.mapWith(Number) 
      })
      .from(tenants)
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(distanceSql); // Ordenamos del más cercano al más lejano automáticamente

    } else {
      // ========================================================================
      // BÚSQUEDA ESTÁNDAR (Sin coordenadas)
      // ========================================================================
      results = await db.select({
        id: tenants.id,
        name: tenants.name,
        niche: tenants.niche,
        city: tenants.city,
        zipCode: tenants.zipCode,
        logoUrl: tenants.logoUrl,
        primaryColor: tenants.primaryColor,
      })
      .from(tenants)
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(tenants.name);
    }

    // 5. Formatear los resultados para la UI del Directorio
    const formattedResults = results.map(biz => ({
      ...biz,
      label: biz.niche === 'automotive' ? 'Taller Automotriz' : biz.niche === 'spa' ? 'Spa & Relajación' : 'Barbería Clásica',
      icon: biz.niche === 'automotive' ? '🚗' : biz.niche === 'spa' ? '💆‍♀️' : '✂️',
      // Redondear la distancia a 1 decimal (ej. "4.2")
      distance: 'distance' in biz && biz.distance !== null ? Number(biz.distance).toFixed(1) : null 
    }));

    return res.status(200).json({
      success: true,
      count: formattedResults.length,
      data: formattedResults
    });

  } catch (error) {
    console.error("Error en búsqueda de directorio:", error);
    return res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
};

export const getTenantById = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
  
      // 1. Buscar la información base del Tenant (Marca Blanca, Info legal, etc)
      const tenantResult = await db.select()
        .from(tenants)
        .where(eq(tenants.id, id as string))
        .limit(1);
  
      if (tenantResult.length === 0) {
        return res.status(404).json({ success: false, message: 'Negocio no encontrado' });
      }
  
      const tenantData = tenantResult[0];
  
      // 2. Buscar el catálogo de servicios de este negocio
      const catalog = await db.select({
        id: services.id,
        name: services.name,
        price: services.price,
        durationMinutes: services.durationMinutes
      })
      .from(services)
      .where(eq(services.tenantId, id as string))
      .orderBy(services.name);
  
      return res.status(200).json({
        success: true,
        data: {
          ...tenantData,
          services: catalog
        }
      });
  
    } catch (error) {
      console.error("Error al obtener perfil del negocio:", error);
      return res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
  };