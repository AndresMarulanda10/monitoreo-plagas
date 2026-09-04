# Métrica Verde

MVP para registrar y analizar monitoreo agrícola por configuración, cama, planta y organismo. El navegador habla únicamente con la API versionada; Supabase y sus secretos son responsabilidad del servidor.

## Ruta rápida

1. Instala Node.js 22+ y ejecuta `npm install`.
2. En una terminal ejecuta `npm run api:dev`.
3. En otra ejecuta `PUBLIC_API_BASE_URL=http://localhost:8787 npm run dev`.
4. Abre `http://localhost:4321` y crea un borrador. `Marcar todo 0` permite completar explícitamente la matriz antes de revisar excepciones.

La configuración local usa un adaptador de memoria y una sesión de desarrollo efímera. No es autenticación de producción ni persiste al reiniciar el proceso.

## Producción Supabase

1. Copia `.env.example` a un gestor de secretos, no al repositorio.
2. Define `AUTH_MODE=supabase`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` únicamente en el API.
3. Aplica migraciones con `npx supabase db push` desde el proyecto Supabase.
4. Regenera tipos después de cambios de esquema: `npx supabase gen types typescript --project-id <project-id> > supabase/types.ts`.
5. Define `ALLOWED_ORIGINS` con los orígenes HTTPS exactos y usa `SameSite=None; Secure` en el proxy TLS.

La clave service role omite RLS y nunca debe llegar al frontend. La autenticación de producción valida el token con Supabase Auth antes de consultar datos propios del observador.

## Verificación

```bash
npm test
npm run build
docker compose config
```

El API expone `GET /healthz` sin autenticación y `GET /readyz` para comprobar la base de datos configurada. Compose publica el frontend en `http://localhost:8080` y enruta `/api/` hacia el servicio API.

## Flujo funcional

- Cinco configuraciones canónicas y ocho organismos son el único catálogo del MVP.
- Severidad válida: entero `0`, `1`, `2` o `3`; una matriz completa exige las 8 coordenadas por cada planta.
- Incidencia: plantas con score mayor que cero / plantas inspeccionadas.
- Severidad: suma de scores / (plantas inspeccionadas × 3).
- Los borradores son editables; las versiones enviadas son inmutables y las correcciones crean una nueva versión enlazada.
- Tablero, tabla paginada y CSV comparten filtros y exponen `metrics.v1` y su procedencia.

## Límites conocidos

El MVP no importa libros históricos, no administra catálogos, no ofrece modo offline, fotos, tratamientos, alertas, mapas, PDF/XLSX, multi-tenancy ni reconciliación histórica. El adaptador Supabase requiere desplegar las funciones RPC de `supabase/migrations/003_version_lifecycle_rpc.sql`; la prueba local usa exclusivamente memoria.

Los archivos originales están en `docs/base/`, permanecen fuera del repositorio por `.gitignore` y son material de referencia/quarantine, nunca datos de producción.
