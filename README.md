# Health Dashboard

A personal health tracker that runs entirely in your browser. It is a single page app with no server and no database. Every entry you make is stored in your browser's local storage, and you can back everything up to a file at any time.

Live site: https://aahmadf123.github.io/health-dashboard/

## What it tracks

- Weight and body composition from a smart scale, imported from the scale app's export file or entered by hand
- Blood pressure and pulse, with AHA category labels on every reading
- Blood test results, imported from a Rythm CSV export or entered manually with preset markers and reference ranges
- Weight loss medication injections: dose, schedule, injection site rotation, and a next dose countdown
- Body measurements such as waist, hips, and chest
- Sleep hours and quality
- A symptom and side effect journal, with injection days marked so you can spot patterns after dose changes

## Importing and exporting

The Data tab handles all files.

Imports accept the scale app's Body Composition Data export (.xlsx or .csv) and the Rythm blood test CSV. Re-importing the same file is safe. Duplicate readings are skipped and existing lab results are updated in place.

Exports include a full JSON backup of everything, plus per-section CSV files for use in spreadsheets. The backup file can be imported back on any device, either merged with existing data or replacing it.

## Where your data lives

All data stays in the browser you entered it in. Nothing is sent to any server, which also means there is no sync between devices. To move to a new device or protect against a cleared browser, download a backup from the Data tab now and then. This repository is public, so never commit personal data files to it.

## Development

```bash
npm install
npm run dev      # local dev server
npm run build    # production build in dist/
npm run preview  # serve the production build locally
```

Built with React, TypeScript, Vite, Tailwind CSS, Recharts, SheetJS, and dayjs.

## Deployment

Pushes to `main` deploy automatically to GitHub Pages through the workflow in `.github/workflows/deploy.yml`. If the first run fails with a Pages error, open the repository's Settings, choose Pages, and set Source to "GitHub Actions", then re-run the workflow.

## Disclaimer

This is a personal tracking tool, not medical advice. Talk to your clinician about your results and before changing any medication.
