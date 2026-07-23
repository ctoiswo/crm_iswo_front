# CRM ISWO — Frontend

SPA en React + Vite + TypeScript. UI con Radix + Tailwind v4.

## Requisitos

- **Node >= 20** (ver `.nvmrc`). Node 18 **no funciona**: `@tailwindcss/oxide` requiere Node >= 20 para su binding nativo; con una versión menor, `pnpm install` lo omite en silencio y `vite dev` falla con `Cannot find native binding`.
- **pnpm** (único gestor soportado en este proyecto, no usar `npm` ni `yarn`).
- Backend del CRM corriendo aparte (por defecto se espera en `http://localhost:3000`).

Si usás [nvm](https://github.com/nvm-sh/nvm):

```bash
nvm install   # instala/usa la versión fijada en .nvmrc
nvm use
```

## Instalación

```bash
pnpm install
```

## Variables de entorno

Copiar el ejemplo y ajustar según tu entorno:

```bash
cp .env.example .env
```

| Variable | Descripción |
|---|---|
| `VITE_API_BASE_URL` | Prefijo de las rutas de API (default `/api/v1`) |
| `VITE_BACKEND_ORIGIN` | Origen del backend (default `http://localhost:3000`) |
| `VITE_FRONTEND_PORT` | Puerto donde corre este frontend (default `3001`) |
| `VITE_LANDING_PUBLIC_HOST` | (opcional) URL pública de landings, ej. ngrok, para pruebas de páginas públicas |
| `VITE_TENANT_SLUG` | Slug de tenant por defecto en login / recuperar contraseña (debe existir en la BD) |
| `API_PUBLIC_ORIGIN` | URL pública del backend (ej. ngrok) cuando se prueban integraciones externas |

## Ejecutar en local

```bash
pnpm dev
```

Levanta en `http://localhost:3001` (o el puerto configurado en `VITE_FRONTEND_PORT`). Requiere que el backend esté corriendo en `VITE_BACKEND_ORIGIN`; si no, las llamadas a la API fallan.

## Otros comandos

```bash
pnpm build          # type-check + build de producción
pnpm preview         # sirve el build de producción localmente
pnpm lint            # eslint
pnpm test            # vitest (una corrida)
pnpm test:watch      # vitest en modo watch
pnpm test:coverage   # vitest con reporte de cobertura
```

## Troubleshooting

**`Cannot find native binding` (PostCSS / lightningcss / @tailwindcss/oxide) al correr `pnpm dev`**

Causa casi siempre: Node < 20. Solución:

```bash
nvm install 20
nvm use 20
rm -rf node_modules
pnpm install
```

No usar `npm i` para "arreglarlo" — el proyecto usa pnpm exclusivamente y mezclar lockfiles rompe la resolución de dependencias.
