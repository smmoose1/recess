# RECESS

Luma for kids and their parents — discover nearby family events, answer a quick survey to load more, and operate scrapers from an admin console.

**Firebase project:** [`recess-app-nyc`](https://console.firebase.google.com/project/recess-app-nyc/overview)

## Stack

- `apps/web` — Next.js parent feed + `/admin`
- `packages/shared` — shared types / metros / constants
- `functions` — survey unlock, clicks/RSVPs, Mommy Poppins + Eventbrite ingest, daily scheduler
- Plans: `PLAN.md`, `SCRAPERS.md`

## Secrets (Google Secret Manager)

Same pattern as secondSet: **secret name = env var name**. Real values live in GCP Secret Manager for project `recess-app-nyc`, never in git.

| Secret | Purpose |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Rotated browser API key (referrer-restricted) |
| `FIREBASE_WEB_CONFIG` | JSON bundle of all `NEXT_PUBLIC_FIREBASE_*` values for local/deploy pulls |

```bash
# Pull into apps/web/.env.local (gitignored)
npm run secrets:pull
```

Notes:
- Firebase **browser** keys still ship in client JS after build (public by design). Protect data with Auth + Firestore rules; the key itself is referrer-restricted to `recess-app-nyc.web.app`, `*.firebaseapp.com`, and localhost.
- Put **server-only** secrets (service accounts, third-party API keys) in Secret Manager only — never `NEXT_PUBLIC_*`.

## Local

```bash
npm run secrets:pull
npm install
npm run build -w @recess/shared
npm run dev
```

- Parent: http://localhost:3000  
- Admin: http://localhost:3000/admin  

Admin emails: `byonedegree@gmail.com`, `recessplsyes@gmail.com`

## Seed

```bash
cd apps/web
export $(grep -v '^#' .env.local | xargs)
SEED_ADMIN_PASSWORD='your-password' npm run seed
```

## Deploy

```bash
npm run secrets:pull
npm run build
npm run deploy:hosting
npx firebase-tools@latest deploy --only firestore:rules,firestore:indexes,functions --project recess-app-nyc
```

Ingest: Admin → **Run all now**, or wait for daily `scheduledIngest` (7am America/New_York).
