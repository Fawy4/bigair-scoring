# STATUS — running progress log

## Phase 0 – scaffold

### Done
- Next.js 15 app (App Router, TypeScript strict, Tailwind 3, ESLint) at the repository root.
- shadcn/ui-style components: button, card, input, dialog, tabs, badge, table, toast (`src/components/ui`).
- Zod, Vitest (1 placeholder test), Playwright (1 smoke test in `e2e/`), Supabase JS + SSR helpers (`src/lib/supabase`: browser, server, service).
- Folder layout from CLAUDE.md, empty `src/lib/engine` (scoring/, ladder/, schedule/ with index files), `src/lib/schemas`, `supabase/migrations`.
- Home page shows `NEXT_PUBLIC_PRODUCT_NAME` (default `[PRODUCT_NAME]`) and "Build OK".
- Scripts: dev, build, typecheck, test, test:e2e, lint, seed:presets (stub).
- `.env.example` with all six variables; `.env*` is git-ignored (except `.env.example`).

### Not done / next (Phase 1)
- Zod schemas for ScoringModel / FormatTemplate / Schedule and loading of `presets/`.
- Scoring engine, written test-first from `docs/08-TEST-SCENARIOS.md`.
- Database migrations, RLS, real `seed:presets`.
- `<Toaster />` is not yet mounted (toast component only, no `useToast` wiring); to be wired in Phase 4.

### Pinned choices
- Zod 4, TypeScript 6, Tailwind 3 (not 4), Next.js 15, React 19. Write Phase 1 schemas for Zod 4.
- Extra packages beyond the original stack are shadcn/ui helpers only, now pre-approved in CLAUDE.md rule 8.

### How to test
- Locally: `npm install && npm run dev`, open http://localhost:3000 — you should see the product name and "Build OK".
- On a phone: open `http://<laptop-IP>:3000` on the same Wi-Fi.
- Vercel preview: open the preview link from the pull request; same page should appear. No environment variables are required for Phase 0 (name falls back to `[PRODUCT_NAME]`).

## Phase 1 – scoring engine

### Done
- Zod 4 schema `src/lib/schemas/scoring-model.ts` (`ScoringModelSchema`, `parseScoringModel`, types). New field `heat.duplicateWindowSec` (default 20). All 7 presets in `presets/scoring/` parse.
- Pure scoring engine `src/lib/engine/scoring/`: `judgeTrickScore`, `panelScore` (mean / trimmed mean / median, Missed vs missing, outliers), `selectCounted` (best N, best N with distinct names, best per category, single best, all, none), `computeHeat` (impression, height bonus/criterion, interference, DNS/DNF/DSQ, attempt cap, `repeatIndex`, duplicates, publish blockers), `rankHeat` (tie-breakers), `explain`, `maxRawFor`, `checkCanAddAttempt`.
- 95 tests covering every value in `docs/08-TEST-SCENARIOS.md` §1 (1A–1F) plus a dedicated "best N of M" suite for the owner's default model. No expected value in doc 08 needed changing.
- `docs/03` §4.2 wording fixed (Missed ≠ incomplete) and a **Decisions log** (§10) added.
- Legacy preset description now says the 0.5 step is editable per event.

### Not done / next
- Speech/text trick parser (doc 08 §1F "Speech/text parsing") → Phase 5, `src/lib/engine/tricks/`.
- Database migrations, RLS, real `seed:presets`, and the server-side use of `checkCanAddAttempt`.
- Decisions 12–13 in doc 03 §10 (uncategorised tricks under best-per-category; unresolved ties) await the owner's confirmation.

### How to test
- Nothing new to see on a phone yet (engine only).
- On a laptop: `npm install && npm test` → "Test Files 8 passed, Tests 95 passed"; `npm run typecheck` → no errors.
