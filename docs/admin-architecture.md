# Secure Admin Architecture

## Goals
- Keep the Telegram mini app running on the Supabase anon key with RLS enforced for every table.
- Move privileged operations (approvals, bans, payouts, analytics) to a hardened backend with service-role access.
- Provide a future-proof “god mode” console that can live outside Telegram or inside the mini app but only communicates with the secure backend.

## Components
1. **Telegram Client (current app)**
   - Only stores the Supabase anon key.
   - Obtains a Supabase session via a backend exchange of `Telegram.WebApp.initData`.
   - Sends admin intents via `fetch(VITE_ADMIN_API_BASE_URL, { action, data })`; no service key leaks.

2. **Admin Backend (Edge Function / Worker / API route)**
   - Validates every request (e.g., Telegram signature or internal SSO).
   - Uses Supabase service role or Postgres pool to execute privileged queries.
   - Emits structured logs of every action.
   - Provides streaming/webhook endpoints for live metrics (views, likes, etc.).
   - This repo now includes `supabase/functions/admin-api/index.ts`, an Edge Function that implements the current set of admin actions. Deploy it with `supabase functions deploy admin-api` and set `ADMIN_API_TOKEN` (shared secret) plus `SUPABASE_SERVICE_ROLE_KEY`.

3. **Admin Console UI (web dashboard / internal tool)**
   - Talks only to the Admin Backend.
   - Surfaces live telemetry, moderation queues, impersonation tools, etc.

## Implementation Steps
1. **Auth Hardening**
   - Build `/api/telegram/session` endpoint that validates `initData` and issues Supabase JWTs.
   - Require all Supabase RLS policies to derive the user from `auth.uid()`.
2. **Admin RPC Endpoint**
   - Deploy a Worker (Cloudflare/Next/Supabase Edge Function) exposed via `VITE_ADMIN_API_BASE_URL`.
   - Accept `{ action, data }` payloads, verify Authorization header / admin SSO, and run corresponding service-role operations.
3. **Telemetry + God Mode**
   - Add event tables (`view_events`, `session_logs`, `message_events`) capturing all user actions.
   - Stream them via Supabase Realtime / Kafka to the admin backend for dashboards.
   - Build impersonation endpoints that generate temporary login links using Supabase auth admin APIs; lock them to audited admin IDs.
4. **UI Overhaul**
   - Replace the current in-app AdminPage with modules that call the backend (users, content, payments, messaging, audit logs).
   - Add live charts (views, tips, ARPU), moderation queues with diff viewers, and “preview as user” mode powered by impersonation tokens.
5. **Compliance & Audit**
   - Store every admin action (who, what, when, payload summary).
   - Provide downloadable audit trails for finance/legal.

The new `src/lib/adminApi.ts` already forwards every action to the backend endpoint so you can progressively extend the Edge Function with additional `action` cases. Configure:

```bash
VITE_ADMIN_API_BASE_URL=https://<your-project-id>.functions.supabase.co/admin-api
VITE_ADMIN_API_TOKEN=super-secret-jwt
```

Once the backend is live, both the Telegram mini app and any standalone admin dashboard can call the same hardened interface.***
