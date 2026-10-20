# Trip

## Run locally

1. Install Node.js and run `npm install`.
2. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_VAPID_PUBLIC_KEY`.
3. Start the app with `npm run dev`.
4. Run `npm run lint` and `npm run build`.

The login screen supports email/password only. Groceries and Plans are filtered views of the real-time chat; meals are added from Messages and stay in that chat.

## Supabase database setup

- **Existing project with data:** Take a backup, then run [20261020_trip_features.sql](./supabase/migrations/20261020_trip_features.sql) once in Supabase Dashboard → SQL Editor. It adds call-session, invitation, and push-notification support without dropping the existing trip data. This migration also scopes trip-content policies to joined trip members.
- **Trip overview and Draw and Guess:** Run [20261021_trip_overview_game.sql](./supabase/migrations/20261021_trip_overview_game.sql) after the previous feature migration on an existing project. On a fresh/reset project, run it after [schema.sql](./supabase/schema.sql). It creates the opt-in location, Where you at?, and multiplayer game tables and RPC functions.
- **Fresh/reset project:** [schema.sql](./supabase/schema.sql) drops every table in the `public` schema and rebuilds the schema. Do not use it on data you intend to keep. It preserves Storage objects and buckets because Supabase prohibits deleting Storage tables directly from SQL. Apply the Trip overview and Draw and Guess migration after the reset.
- Configure Supabase Auth email/password, email confirmation, and the production site/redirect URLs in Authentication → URL Configuration.

## Web Push setup (iPhone and Android)

1. Generate a VAPID key pair, for example with `npx web-push generate-vapid-keys`.
2. Set `VITE_VAPID_PUBLIC_KEY` to the public key in `.env.local` for local development and in the frontend hosting environment for production, then rebuild/redeploy. Never put the private key in a `VITE_` variable. The Settings notification toggle will show setup guidance if this key is missing.
3. Install the Supabase CLI, run `supabase login`, and link the project with `supabase link --project-ref <project-ref>`.
4. Generate a long random webhook secret and configure the server-side secrets:

   ```powershell
   supabase secrets set VAPID_PUBLIC_KEY="<public-key>" VAPID_PRIVATE_KEY="<private-key>" VAPID_SUBJECT="mailto:you@example.com" PUSH_WEBHOOK_SECRET="<random-secret>" APP_PUBLIC_URL="https://your-app.example"
   ```

5. Deploy the Edge Functions:

   ```powershell
   supabase functions deploy dispatch-push
   supabase functions deploy send-trip-invite
   ```

6. In Supabase Dashboard → Database → Webhooks, create an `INSERT` webhook for `public.notification_events`. Set its URL to `https://<project-ref>.supabase.co/functions/v1/dispatch-push`, method to `POST`, and add the header `x-webhook-secret: <same-random-secret>`. Use the standard Supabase database-webhook JSON payload. This single webhook dispatches the queued app events to all of a user's devices. Do not expose the webhook secret in the client.
7. Users enable or disable push with the single toggle in Settings. On iPhone/iPad, notifications require iOS/iPadOS 16.4+ and the installed Home Screen app; the toggle explains how to install before asking for permission. The worker groups visible notifications by trip, supports call Join actions, and removes expired endpoints.

The notification on/off setting is stored per user and device subscriptions are removed when notifications are switched off. Push delivery is skipped for the actor and for users whose app is open and focused on that trip's Messages view.

If push stops after changing the app or Edge Function, redeploy both: push the frontend changes so GitHub Pages rebuilds, and run `supabase functions deploy dispatch-push`. To trace delivery, run this in the Supabase SQL Editor after another user creates a message:

```sql
select id, category, created_at, claimed_at, sent_at
from public.notification_events
order by id desc
limit 25;
```

No new row points to the database migration/trigger setup. An event that stays unsent points to the Database Webhook or Edge Function; inspect their Supabase logs and confirm the webhook's `x-webhook-secret` matches `PUSH_WEBHOOK_SECRET`. A sent event with no device notification points to the saved device subscription, permission, or mismatched VAPID keys.

## Email invitations

Email invitations use Resend. Verify a sender/domain, then set:

```powershell
supabase secrets set RESEND_API_KEY="<resend-api-key>" INVITATION_FROM_EMAIL="Trip <invites@your-domain.example>"
```

The invitation function also needs `APP_PUBLIC_URL` from the Push setup. Invites expire after 14 days, are tied to the normalized email address, and link automatically once that address is verified. Only the trip owner can currently invite. An invited user cannot read trip content until accepting; acceptance/rejection and invitation changes are real-time.

## Calls and mobile behavior

- Calls use private Supabase Realtime signaling and a six-person peer-to-peer mesh. Calls are represented by persistent chat cards; entering or answering a call opens the full-screen call view, and calls can be left and rejoined while active. STUN-only calls may fail on restrictive networks; configure `VITE_TURN_URL`, `VITE_TURN_USERNAME`, and `VITE_TURN_CREDENTIAL` for a TURN provider. Use short-lived TURN credentials because client settings are public.
- My Trip weather uses Open-Meteo, and map tiles use OpenStreetMap. Location sharing is opt-in and depends on HTTPS, device permission, and foreground browser execution; mobile browsers do not guarantee location updates while the PWA is backgrounded.
- Draw and Guess uses Supabase Realtime and the `draw_games` RPCs. The round word is readable only by the assigned drawer. Apply the Trip overview and Draw and Guess migration before using these features.
- The manifest is `standalone`; serve over HTTPS. The SQL reset preserves Storage; remove files separately through Supabase Dashboard or the Storage API if needed.
- `npm run lint` and `npm run build` validate the web client. Physical iPhone Safari/Home Screen and Android Chrome testing is still required for actual camera/microphone permissions, keyboard behavior, push delivery, and device-specific animation smoothness.
