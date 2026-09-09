# Operación Del MVP

El camino operativo recomendado es un VPS con Compose, Nginx y Supabase gestionado. La imagen anterior, una migración correctiva o un restore aprobado son las únicas rutas de recuperación; no se hacen rollbacks destructivos del esquema.

## Publicación

1. Configura los secretos del API desde `.env.example` en el host.
2. Antes de aplicar `005_review_area.sql`, inspecciona las filas existentes de `reviews`; la migración las conserva y marca explícitamente como `legacy`, elimina el índice global de slots y crea la unicidad por área. Después ejecuta `npx supabase db push` desde un entorno controlado y verifica las migraciones `003_version_lifecycle_rpc.sql` y `005_review_area.sql`.
3. Construye y valida con `npm test`, `npm run build` y `docker compose config`.
4. Ejecuta `docker compose up -d --build` y espera los health checks de `api` y `frontend`.
5. Comprueba `/healthz`, `/readyz` y `POST /api/v1/session` (o una sesión autenticada si `AUTH_MODE=supabase`) antes de cambiar el tráfico.

## Variables

| Variable | Propósito | Exposición |
|---|---|---|
| `AUTH_MODE` | `open` acceso público intencional, `memory` local efímero o `supabase` con Auth | API solamente |
| `SUPABASE_URL` | URL del proyecto | API solamente |
| `SUPABASE_ANON_KEY` | Validación de Auth | API solamente |
| `SUPABASE_SERVICE_ROLE_KEY` | Persistencia privilegiada server-side | API solamente, secreto |
| `ALLOWED_ORIGINS` | Lista CORS exacta, separada por coma | API |
| `PUBLIC_API_BASE_URL` | URL pública del API para un frontend separado | Frontend, nunca un secreto |

## Salud Y Diagnóstico

- `GET /healthz` confirma que el proceso HTTP responde.
- `GET /readyz` confirma que Supabase responde cuando el adaptador Supabase está configurado.
- Los errores JSON mantienen `{ code, message, details }`; no se devuelven credenciales ni trazas.
- Las mutaciones exigen sesión en `memory` y `supabase`, y rechazan origen cross-site. En `open`, el API usa el observador técnico `guest-observer` sin credenciales.
- `POST /api/v1/session` devuelve el observador técnico estable en `AUTH_MODE=open`; este modo no requiere credenciales y es acceso público intencional.
- `microbiology` y `entomology` son áreas independientes de registro; `combined` es únicamente un filtro de reportes. Las revisiones `legacy` aparecen solo en el reporte Consolidado.
- `POST /api/v1/session` intercambia email/contraseña con Supabase Auth y deja el access token en una cookie HttpOnly en `AUTH_MODE=supabase`; ese endpoint debe vivir detrás de TLS.

## Backups Y Recuperación

Supabase debe tener backups automáticos y un destino cifrado definido por el responsable de infraestructura. Antes de una migración, registra el timestamp del backup y conserva el artefacto según la política de retención del proyecto. Para recuperar, restaura en un entorno de staging, ejecuta `npm test`, comprueba la versión de migración y promueve el restore aprobado. Para un bug de esquema, añade una migración correctiva; no borres tablas ni edites versiones enviadas.

## Datos Privados

`docs/base/` contiene workbooks, imágenes y documentos originales. Está excluido por `.gitignore` y `.dockerignore`. No subirlo, copiarlo a fixtures, importarlo ni generar dumps en este repositorio. Los fixtures públicos del MVP deben ser sintéticos y mínimos.
