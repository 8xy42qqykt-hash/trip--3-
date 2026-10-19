<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/1a2dd612-5eee-4904-821c-4d2091e35d8f

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Chat features

- Active-user presence and call signaling use private Supabase Realtime channels. Apply [realtime_policies.sql](./supabase/realtime_policies.sql) to an existing Supabase project. Fresh installations using [schema.sql](./supabase/schema.sql) create the policies during setup.
- Voice and video calls use a six-person peer-to-peer mesh with Supabase Realtime signaling, so no application server is required. STUN-only calls may not connect on restrictive networks; set `VITE_TURN_URL`, `VITE_TURN_USERNAME`, and `VITE_TURN_CREDENTIAL` for a TURN provider to improve connectivity. For GitHub Pages, configure the matching GitHub Actions secrets. TURN credentials are included in the public client bundle, so use short-lived credentials instead of permanent secrets.
