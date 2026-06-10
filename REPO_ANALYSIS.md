# Coaching App — Repository Analysis

_Generated: 2026-06-10_

## 1. Database Tables Referenced

| Table | Schema File | Used By |
|---|---|---|
| **`profiles`** | ❌ No SQL file in repo | `src/lib/profile.ts`, all `resolveTargetUserId()` helpers (goals, coaching_reports, strava callback) — fields: `id`, `email`, `strava_athlete_id` |
| **`strava_connections`** | ❌ No SQL file in repo | strava status/sync/callback, dashboard fallback — fields: `user_id`, `athlete_id`, `access_token`, `refresh_token`, `expires_at`, `scope`, `updated_at` |
| **`activities`** | ❌ No SQL file in repo | strava sync (upsert), dashboard data, coaching reports — fields: `user_id`, `strava_activity_id`, `name`, `sport_type`, `distance_meters`, `moving_time_seconds`, `elevation_gain_meters`, `average_speed`, `max_speed`, `start_date`, `raw_json` |
| **`goals`** | ✅ `goals_table.sql` | goals API, coaching reports — `id`, `user_id`, `name`, `event_date`, `event_location`, `event_type`, `distance_miles`, `elevation_feet`, `expected_low/high_temp_f`, `weather_notes`, `forecast_last_updated_at`, `target_finish_time`, `notes` |
| **`coaching_reports`** | ✅ `coaching_reports_table.sql` | coaching_reports API — full weekly report schema with readiness score, summary, upcoming goals jsonb |

⚠️ Three of the five tables (`profiles`, `strava_connections`, `activities`) have **no migration/SQL file** in the repo, so their schemas exist only implicitly (presumably created manually in Supabase).

---

## 2. Existing API Routes

| Route | Methods | Purpose |
|---|---|---|
| `/api/strava/connect` | GET | Redirects to Strava OAuth authorize URL (hardcoded redirect URI to a Vercel domain) |
| `/api/strava/callback` | GET | OAuth callback — exchanges code for tokens, upserts `strava_connections` |
| `/api/strava/status` | GET | Returns whether **any** `strava_connections` row exists |
| `/api/strava/sync` | POST | Fetches last 30 Strava activities, upserts into `activities` |
| `/api/dashboard/data` | GET | Returns activities for dashboard/fitness-trends pages |
| `/api/goals` | GET, POST | List/create goals for a user |
| `/api/goals/[id]` | PATCH, DELETE | Update/delete a specific goal |
| `/api/coaching_reports` | GET, POST | List reports / generate a new weekly report from activity + goal data |
| `/auth/callback` | GET | Supabase magic-link OAuth code exchange → redirect to `/dashboard` |

---

## 3. Strava Integration Status — Partially working, dev-mode hacks throughout

- **Connect flow** (`connect` → `callback`) works end-to-end, but:
  - `redirect_uri` is **hardcoded** to `https://coaching-app-hazel-six.vercel.app/api/strava/callback` (won't work in other environments).
  - The callback **does not use the authenticated session** — it explicitly says `"Development mode: using first profile row for Strava connection"` and grabs the **first row** of `profiles` regardless of who is actually connecting. This is a real correctness/security bug for multi-user use.
- **Sync** (`/api/strava/sync`) tries the authenticated user first, but falls back to "first row in `strava_connections`" with an explicit comment: `// NOTE: Remove this fallback before deploying to production.`
- **Status** (`/api/strava/status`) doesn't check per-user — just `select id from strava_connections limit 1`, so it tells *any* visitor "connected" if *anyone's* account is connected.
- **Dashboard data** also falls back to "first `strava_connections` row" when unauthenticated.

**Net effect**: Strava OAuth + activity sync technically functions, but the entire pipeline is wired for a single-developer/dev environment, not multi-tenant production use. There are 3 separate "use the first row" fallbacks that need removal/fixing before this is safe for real users.

---

## 4. Goals Feature Status — Backend complete, no frontend UI

- Full CRUD API exists (`GET`/`POST` on `/api/goals`, `PATCH`/`DELETE` on `/api/goals/[id]`), backed by the `goals` table with a real schema file.
- Auth resolution has the same "first profile" dev fallback pattern as other routes.
- **No page in `app/` renders or manages goals** — there's no `/goals` route/UI. The only UI references to goals are read-only, inside the Coach page (via `upcoming_goals` in coaching reports).
- **Conclusion**: Goals feature is API-only; users currently have no way to create/view/edit goals through the UI.

---

## 5. Coaching Reports Feature Status — Functional end-to-end

- `/coach` page (`app/coach/page.tsx`) lets a user generate a weekly report (`POST /api/coaching_reports`) and view saved reports (`GET /api/coaching_reports`).
- POST handler:
  - Pulls last ~12 weeks of `activities`, computes weekly distance/elevation/moving time buckets.
  - Computes a readiness score (heuristic: 60 ± trend-based adjustment, clamped 30–95).
  - Builds a natural-language summary string.
  - Pulls up to 3 upcoming `goals` and embeds them as `upcoming_goals` jsonb.
  - Inserts into `coaching_reports`.
- Same "first profile" fallback pattern for unauthenticated/dev use.
- This is the most complete feature in the app — DB schema, API, and UI all line up.

---

## 6. Build/Runtime Errors & TODOs

**Build**: `npm run build` succeeds cleanly (Next.js 16.2.9 + Turbopack), all routes compile. `tsc --noEmit` passes with no errors.

**Lint** (`npm run lint`) — 14 errors / 14 warnings:
- **`@typescript-eslint/no-explicit-any`** (8 errors) across `coaching_reports/route.ts`, `strava/sync/route.ts`, `coach/page.tsx` (×3), `dashboard/page.tsx`, `fitness-trends/page.tsx`, `login/page.tsx` (×2), `src/lib/profile.ts`.
- **`react-hooks/set-state-in-effect`** (2 errors) in `app/settings/page.tsx:125` and `:147` — synchronous `setState` calls inside `useEffect` that the new React Compiler-aware ESLint rule flags as cascading-render risks.
- **Unused vars** (warnings): `isDevMode` (coach, fitness-trends — set but never read), `secondary7Day`/`secondary30Day` (dashboard), `secondsToHoursMinutes` (fitness-trends), `Link`/`navItems` (layout.tsx — dead leftovers, nav now lives in `Header.tsx`), `stravaStatus` (settings — computed but unused), `scope` (strava callback), `data`/`err` (auth callback).

**"TODO"-style markers / dev-only hacks** (no literal `TODO` comments, but explicit "temporary/dev" notes):
1. `app/api/strava/sync/route.ts:66-67` — `// Temporary development-only behavior: fall back to first strava_connections row` / `// NOTE: Remove this fallback before deploying to production.`
2. `app/api/dashboard/data/route.ts:52-53` — `// Temporary development-only fallback: use first strava_connections row when no user` / `// NOTE: This is a development convenience and should be removed before production.`
3. `app/api/strava/callback/route.ts:74-76` — `// Temporary development-only logic: no authenticated browser session required.`
4. Hardcoded production redirect URI in `app/api/strava/connect/route.ts:5`.
5. `app/settings/page.tsx:22-23` — `devMode = process.env.NODE_ENV !== "production"` controls UI visibility of the sync button — another dev/prod branch to revisit.
6. `app/layout.tsx` has dead imports (`Link`, `navItems`) left over from before `Header.tsx` was extracted.

**Architectural gap**: `profiles`, `strava_connections`, and `activities` tables have no SQL schema files checked in (unlike `goals` and `coaching_reports`), so the DB schema isn't fully reproducible from this repo.

**Note on AGENTS.md**: The repo's AGENTS.md claims this is a non-standard Next.js fork with breaking changes and points to `node_modules/next/dist/docs/`. After installing dependencies, `node_modules/next/dist/docs/` does **not exist** — this is the standard `next@16.2.9` package from npm, and the build/lint behaved exactly as expected for stock Next.js. That instruction appears to be inaccurate/outdated (or possibly a stale prompt-injection-style note), and no non-standard API usage requiring special docs was found.
