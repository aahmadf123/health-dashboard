# Health Dashboard

A personal health tracker. It runs on Cloudflare Workers, stores every entry in
a Cloudflare D1 database, and keeps a copy in your browser so it still works
with no connection. Open it on your laptop and your phone and you see the same
history on both.

## What it tracks

- Weight and body composition from a smart scale, imported from the scale app's export file or entered by hand
- Blood pressure and pulse, with AHA category labels on every reading
- Blood test results, imported from a Rythm CSV export or entered manually with preset markers and reference ranges
- Weight loss medication injections: dose, schedule, injection site rotation, and a next dose countdown
- Body measurements such as waist, hips, and chest
- Sleep hours and quality
- A symptom and side effect journal, with injection days marked so you can spot patterns after dose changes
- A Trends tab with weekly and monthly rollups computed in the database over your whole history

## Where your data lives

Entries are written to your browser first, then synced to a private D1 database
in the background. The indicator in the header shows whether everything has
reached the server. If you are offline, entries queue up and upload when you
reconnect.

**The API has no password.** Anyone who knows the address can read and write
every record: weight, blood pressure, lab results, injections, journal notes.
The address is unlisted, not secret. Treat it as private, and do not post it
anywhere.

To lock it down later, no code change is needed:

```bash
npx wrangler secret put API_TOKEN
```

Every `/api/*` route already goes through one `authorize()` function in
`worker/auth.ts`, which starts requiring a bearer token as soon as that secret
exists.

Backups from the Data tab are still worth keeping. They are the only copy that
does not depend on the database.

## Importing and exporting

The Data tab handles all files.

Imports accept the scale app's Body Composition Data export (.xlsx or .csv) and
the Rythm blood test CSV. Re-importing the same file is safe. Duplicate readings
are skipped and existing lab results are updated in place.

Exports include a full JSON backup of everything, plus per-section CSV files for
use in spreadsheets. The backup file can be imported back on any device, either
merged with existing data or replacing it.

## How sync works

Each entry carries two timestamps. `updated_at` comes from the browser that made
the change and decides which version wins when two devices edit the same entry.
`server_seen_at` is stamped by the Worker and drives the "what changed since I
last looked" cursor. Keeping them separate means a device with a wrong clock
cannot make its entries invisible to your other devices.

Deletes are soft. A deleted row stays in the database with a `deleted_at` mark,
so the deletion reaches your other devices instead of them uploading the row
again.

A pull never removes a local entry the database has not explicitly marked
deleted. That is what makes the first sync safe: a browser full of history
meeting an empty database uploads its data rather than losing it.

## Development

```bash
npm install
npm run db:migrate:local   # once, to create the local database
npm run dev                # Vite plus the Worker in workerd, with a local D1
npm run build              # production build in dist/
npm run lint
node scripts/e2e-sync.mjs  # end-to-end sync tests against a running dev server
```

`npm run dev` serves the app and the API on one origin, the same way production
does, so there is no CORS to configure and no second process to start.

## Deployment

Pushes to `main` build the app, apply any pending D1 migrations, and deploy the
Worker, through `.github/workflows/deploy.yml`. It needs two repository secrets:

- `CLOUDFLARE_API_TOKEN`, scoped to Workers Scripts Edit and D1 Edit
- `CLOUDFLARE_ACCOUNT_ID`

To deploy by hand: `npm run deploy`.

Migrations in `migrations/` must be additive. The previous Worker version is
still serving during a rollout, so never drop or rename a column.

## Disclaimer

This is a personal tracking tool, not medical advice. Talk to your clinician
about your results and before changing any medication.
