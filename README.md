# RECESS

Luma for kids and their parents — discover nearby family events, answer a quick survey to load more, and operate scrapers from an admin console.

**Firebase project:** [`recess-app-nyc`](https://console.firebase.google.com/project/recess-app-nyc/overview)

## Stack

- `apps/web` — Next.js parent feed + `/admin`
- `packages/shared` — shared types / metros / constants
- `functions` — survey unlock, clicks/RSVPs, Mommy Poppins + Eventbrite ingest, daily scheduler
- Plans: `PLAN.md`, `SCRAPERS.md`

## Local

```bash
cp .env.example apps/web/.env.local   # already filled for recess-app-nyc
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
npx firebase-tools@latest deploy --only firestore:rules,firestore:indexes,functions --project recess-app-nyc
```

Ingest: Admin → **Run all now**, or wait for daily `scheduledIngest` (7am America/New_York).
