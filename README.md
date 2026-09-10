# Métrica Verde

MVP para registrar y analizar monitoreo agrícola por configuración, cama, planta y organismo. El navegador habla únicamente con la API versionada; Supabase y sus secretos son responsabilidad del servidor.

## Ruta rápida

1. Instala Node.js 22+ y ejecuta `npm install`.
2. En una terminal ejecuta `npm run api:dev`.
3. En otra ejecuta `PUBLIC_API_BASE_URL=http://localhost:8787 npm run dev`.
4. Abre `http://localhost:4321` y crea un borrador. `Marcar todo 0` permite completar explícitamente la matriz antes de revisar excepciones.

En local, Compose usa `AUTH_MODE=open` y, sin credenciales Supabase, un adaptador de memoria: no solicita login, pero los datos se pierden al reiniciar el proceso. Para persistencia pública, configura las credenciales Supabase descritas abajo.

## Producción Supabase

1. Copia `.env.example` a un gestor de secretos, no al repositorio.
2. Para acceso público sin registro, define `AUTH_MODE=open`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SECRET_KEY` únicamente en el API. El API usa el observador técnico `guest-observer`, por lo que todas las personas comparten esa identidad; esta opción es intencionalmente no autenticada.
3. Para exigir cuentas de Supabase Auth, define `AUTH_MODE=supabase`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SECRET_KEY` únicamente en el API.
4. Aplica migraciones con `npx supabase db push` desde el proyecto Supabase.
5. Regenera tipos después de cambios de esquema: `npx supabase gen types typescript --project-id <project-id> > supabase/types.ts`.
6. Define `ALLOWED_ORIGINS` con los orígenes HTTPS exactos y usa `SameSite=None; Secure` en el proxy TLS.

La clave service role omite RLS y nunca debe llegar al frontend. En modo `supabase`, la autenticación de producción valida el token con Supabase Auth antes de consultar datos propios del observador. En modo `open`, no hay autenticación ni aislamiento por usuario: protege el API con controles de red si los datos no deben ser públicos.

## Despliegue En Vercel

1. Importa el repositorio en Vercel y deja Astro como framework detectado. No hace falta `vercel.json`: `dist/` se sirve como frontend estático y `api/[...path].ts` atiende las rutas `/api/v1/*` sin rewrites.
2. En las variables de entorno de producción de Vercel define `AUTH_MODE=open`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY` y `ALLOWED_ORIGINS`. En `ALLOWED_ORIGINS` incluye el origen HTTPS exacto de Vercel, por ejemplo `https://<tu-proyecto>.vercel.app`, además de cualquier dominio personalizado.
3. Mantén `PUBLIC_API_BASE_URL` vacío o sin definir para que el frontend use el API same-origin de Vercel. Solo defínelo si el frontend y el API viven en dominios distintos.
4. Configura también las migraciones Supabase antes de usar el despliegue. La clave `SUPABASE_SECRET_KEY` (o la clave legacy `SUPABASE_SERVICE_ROLE_KEY`) es exclusivamente server-side; nunca la agregues como variable `PUBLIC_*`, al código del frontend ni al repositorio.

## Verificación

```bash
npm test
npm run build
docker compose config
```

El API expone `GET /healthz` sin autenticación y `GET /readyz` para comprobar la base de datos configurada. Compose publica el frontend en `http://localhost:8080` y enruta `/api/` hacia el servicio API.

## Flujo funcional

- Cinco configuraciones canónicas y ocho organismos son el único catálogo compartido del MVP.
- Las áreas de registro son `microbiology` (Cladosporium, Mildeo, Botrytis) y `entomology` (Aphids, Thrips, Mites, Tuta, Plutella); la interfaz las muestra como Microbiología y Entomología.
- Severidad válida: entero `0`, `1`, `2` o `3`; cada matriz completa exige únicamente las coordenadas de su área.
- Incidencia: plantas con score mayor que cero / plantas inspeccionadas.
- Severidad: suma de scores / (plantas inspeccionadas × 3).
- Los borradores son editables; las versiones enviadas son inmutables y las correcciones crean una nueva versión enlazada.
- Tablero, tabla paginada y CSV comparten filtros y exponen `metrics.v1` y su procedencia.
- Los slots semanales son únicos por configuración, semana, ronda y área. La migración `005_review_area.sql` marca las revisiones existentes como `legacy`: se conservan y aparecen únicamente al filtrar el reporte Consolidado, no en los espacios de registro por área.

## Límites conocidos

El MVP no importa libros históricos, no administra catálogos, no ofrece modo offline, fotos, tratamientos, alertas, mapas, PDF/XLSX, multi-tenancy ni reconciliación histórica. El adaptador Supabase requiere desplegar las funciones RPC de `supabase/migrations/003_version_lifecycle_rpc.sql`; la prueba local usa exclusivamente memoria.

Los archivos originales están en `docs/base/`, permanecen fuera del repositorio por `.gitignore` y son material de referencia/quarantine, nunca datos de producción.
