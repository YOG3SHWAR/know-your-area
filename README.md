# Know Your Area

A mobile-responsive webapp for reporting civic/municipal problems (potholes, garbage, broken
streetlights, water/drainage issues, malfunctioning traffic lights) in India. Users capture a
live, geo-tagged photo of a problem; anyone nearby can browse a proximity-sorted feed of
photo-verified reports without needing an account.

See `.planning/PROJECT.md` for the full product context and requirements.

## Run the full stack locally

Prerequisites:

- Node.js 20+
- Docker (for local Postgres+PostGIS) — or a hosted Postgres+PostGIS instance (e.g. a free
  Supabase project) if Docker isn't available on your machine
- A Cloudflare R2 bucket + API token (photo storage has no local fallback — see
  `.env.example`)

Steps:

1. **Start Postgres+PostGIS:**
   ```bash
   docker compose up -d
   ```
   If Docker isn't available, point `DATABASE_URL` at a hosted Postgres+PostGIS instance
   instead (e.g. a Supabase project with the PostGIS extension enabled via the dashboard's
   Extensions tab).

2. **Configure environment:**
   ```bash
   cp .env.example .env.local
   ```
   Fill in `DATABASE_URL` and the five `R2_*` variables (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
   `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_BASE_URL`). Photo uploads go directly
   from the browser to R2 via a presigned URL, so R2 credentials are required even in dev —
   there is no local storage fallback.

   On the R2 bucket, add a CORS rule allowing `PUT` (with the `Content-Type` header) from
   `http://localhost:3000` so the browser → R2 direct upload succeeds.

3. **Push the schema:**
   ```bash
   npx drizzle-kit push
   ```
   Note: `drizzle-kit` (0.31.10) is known to drop the `location` column's SRID on both
   `generate` and `push` — after pushing, verify with
   `SELECT srid FROM geometry_columns WHERE f_table_name = 'complaints';` (expect `4326`, not
   `0`) and re-run the fix documented as an inline comment in `src/lib/db/schema.ts` if needed.

4. **Run the app:**
   ```bash
   npm run dev
   ```

5. **Try it end-to-end:** open `http://localhost:3000/capture`, allow camera + location
   access, capture a photo, pick a category, and publish. You'll be redirected to `/`, where
   the report you just published appears in the proximity-sorted feed.

## Tests

```bash
npm run test:unit   # Vitest
npm run test:e2e    # Playwright (spins up `npm run dev` automatically)
npm test            # both
```

The Playwright suite drives a fake camera/geolocation device (see
`tests/e2e/fixtures.ts`, `playwright.config.ts`) and exercises the real capture → R2 upload →
DB insert → feed render path against whatever `DATABASE_URL`/`R2_*` config is active in your
environment.
