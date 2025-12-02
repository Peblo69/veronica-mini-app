# Livestream Architecture

This document explains how the livestream experience inside the Telegram WebApp is put together so it behaves like a TikTok/Twitch style surface while using Supabase for state and Agora for low‑latency media delivery.

## Goals & Constraints

- **Fast start for creators** – go-live must provision an Agora channel, store metadata/permissions in Supabase, and notify viewers within seconds.
- **Mass viewers** – thousands of concurrent viewers subscribe to the same stream, watch smooth video, and see live chat/gifts without manual refresh.
- **Revenue & permissions** – access is controlled through Supabase (private streams, entry fees, tokens), and every gift/entry/tip immediately updates creator analytics.
- **Telegram WebApp native feel** – everything runs inline with Telegram’s WebApp SDK, uses lightweight animations (Framer Motion), and never blocks the main thread.

## Component Overview

| Layer | Responsibilities | Key Modules |
| --- | --- | --- |
| Telegram WebApp (React) | UI/UX, user session, animations | `App.tsx`, `HomePage.tsx`, `LivestreamPage.tsx` |
| Media Fabric (Agora RTC) | Real-time A/V publishing + playback | `agora-rtc-sdk-ng`, `initAgoraBroadcaster`, `initAgoraViewer` |
| Supabase Postgres | Source of truth for streams, chat, gifts, viewer presence, revenue, permissions | `livestreams`, `livestream_viewers`, `livestream_messages`, `livestream_tickets`, `notifications`, `creator_earnings`, `transactions` |
| Supabase Realtime | Push updates for chat, viewer counts, live list badges | `supabase.channel(...)` subscriptions in `livestreamApi.ts` |

## Data Model (Supabase)

- **`livestreams`** – canonical record (creator, title, status, entry rules, agora channel, stats).
- **`livestream_viewers`** – upserted on join/leave to keep concurrent count and watch history.
- **`livestream_messages`** – ordered chat log, including `message_type = chat|gift|tip|system`.
- **`livestream_tickets`** *(new)* – one row per user per stream once access is purchased (prevents double charge and ties into creator earnings). Includes `paid_amount`, `granted_at`.
- **`gifts` / `creator_earnings` / `transactions`** – reused for gift catalog, ledgers, payouts.
- **RLS Policies** – creators manage their streams, everyone can read live status/messages, and ticket table allows users to insert/select their own rows.

## Real-time Channels

- `livestream_messages:{streamId}` – inserts fan out to viewers, watchers fetch full row (user, gift) before rendering.
- `livestream_viewers:{streamId}` – updates `viewer_count` + `peak_viewers`, mirrored into UI badges.
- `livestreams:lobby` – broadcast when streams change state so the “Live Now” rail auto-refreshes.
- Notifications – followers receive a `livestream` notification when a creator starts.

## User Flows

### Creator start
1. `createLivestream` inserts Supabase row (room name, metadata, status=`live`).
2. Creator page initializes Agora host, plays self preview, and subscribes to real-time chat/viewers to moderate.
3. When ending, `endLivestream` stamps `ended_at`, tears down Agora, and finalizes watch minutes via `streaming_usage`.

### Viewer join
1. Fetch `getLivestream` for metadata and `getLivestreamAccess` to evaluate privacy rules:
   - *Subscribers-only?* Uses `subscriptions` table.
   - *Entry fee?* Looks for ticket in `livestream_tickets` otherwise charges tokens via `purchaseLivestreamTicket`.
   - *Creator?* Always allowed.
2. After access granted, `joinLivestream` upserts viewer presence, subscribes to chat/viewer count, then calls `initAgoraViewer`.
3. Leaving triggers `leaveLivestream` and closes Agora tracks; page `cleanup` also runs when component unmounts.

### Live chat & gifting
1. `sendLivestreamMessage` writes chat rows (Supabase RLS ensures only authenticated users insert).
2. `sendLivestreamGift` (and optional tipping) deducts tokens, inserts special message, bumps `total_gifts_received`, and inserts `creator_earnings` rows.
3. Gift animations in the WebApp rely on the realtime feed – as soon as the insert event arrives a `motion.div` animates the overlay.

### Revenue tracking

- **Entry fees** – `purchaseLivestreamTicket` debits viewer tokens, records a transaction, inserts ticket row, and gives creator a 90% split via `add_to_balance`.
- **Gifts/Tips** – `sendLivestreamGift`/`sendLivestreamTip` update the stream aggregates plus ledger tables. Notifications are dispatched for the creator.
- **Analytics** – `livestreams` maintains running totals `viewer_count`, `peak_viewers`, `total_gifts_received`, `total_tips_received`. Historical usage per creator lives in `streaming_usage`.

## Telegram WebApp Considerations

- All Supabase auth uses a custom `localStorage` shim because the Telegram iframe sandbox can block access.
- Heavy operations (Agora initialization, Supabase fetches) run inside `useEffect` hooks with async functions to avoid blocking UI.
- Buttons and overlays use `framer-motion` for tactile feedback while keeping DOM tree small (no layout thrashing).

## Scaling & Reliability

- **Agora** handles media fan-out; only metadata/chat flow through Supabase so Postgres load stays small.
- **Realtime channels** are scoped by stream id so thousands of streams do not collide; unsubscribing on cleanup prevents ghost listeners.
- **Backpressure** – chat history queries default to last 100 rows and rely on indexed `created_at`.
- **Graceful failure** – if Agora join fails or access check rejects, UI shows actionable error and remains in WebApp (no blank screen).

## Implementation References

- React UI: `src/App.tsx`, `src/pages/HomePage.tsx`, `src/pages/LivestreamPage.tsx`
- Supabase helpers: `src/lib/livestreamApi.ts`, `src/lib/payments.ts`
- Telegram integration: `App.tsx` (WebApp init), `payments.ts` (Stars/modal helpers)

This architecture keeps Supabase as the single source of truth, Agora for real-time media, and the Telegram WebApp for UX so new features (viewer leaderboards, multi-host) can be layered without rewriting the foundation.
