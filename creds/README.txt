Google OAuth credentials (gitignored)

Place your Google Cloud OAuth client JSON here as:

  creds/google-oauth.json

Use the JSON downloaded from Google Cloud Console (Desktop or Web client).
The file may use a top-level "installed" or "web" object — both work.

Alternative locations (checked in order if .env.local is not set):
  - Sylos-UI/creds/google-oauth.json   (preferred)
  - Sylos-UI/creds.json
  - ../creds.json                      (Sylos monorepo root)

Or set values in Sylos-UI/.env.local instead:

  VITE_GOOGLE_CLIENT_ID=...
  VITE_GOOGLE_CLIENT_SECRET=...

.env.local overrides JSON files when both are present.
JSON auto-loading runs in `npm run dev` only (not production builds).

Do not commit real credentials.
