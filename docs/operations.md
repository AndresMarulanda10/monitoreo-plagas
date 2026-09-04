# Operación Del MVP

El camino operativo recomendado es un VPS con Compose, Nginx y Supabase gestionado. La imagen anterior, una migración correctiva o un restore aprobado son las únicas rutas de recuperación; no se hacen rollbacks destructivos del esquema.

## Publicación

1. Configura los secretos del API desde `.env.example` en el host.
2. Ejecuta `npx supabase db push` desde un entorno controlado y verifica la migración `003_version_lifecycle_rpc.sql`.
3. Construye y valida con `npm test`, `npm run build` y `docker compose config`.
4. Ejecuta `docker compose up -d --build` y espera los health checks de `api` y `frontend`.
5. Comprueba `/healthz`, `/readyz` y una sesión autenticada antes de cambiar el tráfico.

## Variables

| Variable | Propósito | Exposición |
|---|---|---|
| `AUTH_MODE` | `memory` local o `supabase` producción | API solamente |
| `SUPABASE_URL` | URL del proyecto | API solamente |
| `SUPABASE_ANON_KEY` | Validación de Auth | API solamente |
| `SUPABASE_SERVICE_ROLE_KEY` | Persistencia privilegiada server-side | API solamente, secreto |
| `ALLOWED_ORIGINS` | Lista CORS exacta, separada por coma | API |
| `PUBLIC_API_BASE_URL` | URL pública del API para un frontend separado | Frontend, nunca un secreto |

## Salud Y Diagnóstico

- `GET /healthz` confirma que el proceso HTTP responde.
- `GET /readyz` confirma que Supabase responde cuando `AUTH_MODE=supabase`.
- Los errores JSON mantienen `{ code, message, details }`; no se devuelven credenciales ni trazas.
- Las mutaciones exigen sesión y rechazan origen cross-site.
- `POST /api/v1/session` intercambia email/contraseña con Supabase Auth y deja el access token en una cookie HttpOnly; ese endpoint debe vivir detrás de TLS.

## Backups Y Recuperación

Supabase debe tener backups automáticos y un destino cifrado definido por el responsable de infraestructura. Antes de una migración, registra el timestamp del backup y conserva el artefacto según la política de retención del proyecto. Para recuperar, restaura en un entorno de staging, ejecuta `npm test`, comprueba la versión de migración y promueve el restore aprobado. Para un bug de esquema, añade una migración correctiva; no borres tablas ni edites versiones enviadas.

## Datos Privados

`docs/base/` contiene workbooks, imágenes y documentos originales. Está excluido por `.gitignore` y `.dockerignore`. No subirlo, copiarlo a fixtures, importarlo ni generar dumps en este repositorio. Los fixtures públicos del MVP deben ser sintéticos y mínimos.
