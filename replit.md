# Legends SMP

The official Legends SMP website, with public server information and secure admin and owner panels for managing site content.

## Run & Operate

- Cloudflare Workers Builds: use `pnpm --filter @workspace/legends-smp run deploy`. The command builds the frontend and deploys the dynamic Worker API. `pnpm --filter @workspace/legends-smp run deploy --dry-run` builds and bundles without publishing.
- Create a Cloudflare D1 database named `legends`, then set its ID as `D1_DATABASE_ID` in the Cloudflare Workers Builds environment.
- Staff portraits do not use file uploads or an object-storage bucket. In the admin/owner editor, use a publicly accessible image URL or the member's Minecraft skin.
- Configure `SESSION_SECRET`, `LEGENDS_ADMIN_CODE`, and `LEGENDS_OWNER_CODE` as Cloudflare Worker secrets. Never put their values in source code. The Worker hashes the access codes when it initializes its settings row.
- The Worker creates its D1 settings table on first request. Existing PostgreSQL content is not copied into D1 automatically; migrate it separately before switching production traffic if it must be retained.
- The optional Replit Express API server uses PostgreSQL via `DATABASE_URL`: `pnpm --filter @workspace/api-server run dev`.
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Cloudflare API: dynamic Workers API with D1 storage
- Optional Replit API: Express 5 with PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
