# Adil's Job Tracker V2

<p align="center">
  <img alt="React 19" src="https://img.shields.io/badge/React-19.2.5-61DAFB?logo=react&logoColor=0b1220" />
  <img alt="Vite 8" src="https://img.shields.io/badge/Vite-8.0.8-646CFF?logo=vite&logoColor=white" />
  <img alt="GitHub Pages" src="https://img.shields.io/badge/GitHub_Pages-Ready-0F172A?logo=github&logoColor=white" />
  <img alt="Local Storage" src="https://img.shields.io/badge/Storage-IndexedDB_%2B_localStorage-1F4E79" />
  <img alt="Seed Data" src="https://img.shields.io/badge/Seed-61_Applications-10B981" />
</p>

Personal job search tracker built for my own workflow. It runs locally in the browser, supports encrypted starter data, and deploys cleanly to GitHub Pages.

## Architecture

```mermaid
flowchart LR
  A[Login] --> B[Decrypt Seed]
  B --> C[Tracker UI]
  C --> D[(IndexedDB)]
  C --> E[(localStorage Backup)]
  C --> F[Import / Export]
```

## What It Does

- Track applications, statuses, interview stages, follow-ups, and notes.
- Show quick analytics for progress, response rate, and outcomes.
- Auto-mark stale applications as ghosted after 21 days.
- Import and export JSON backups.
- Seed the app from the encrypted starter dataset on first unlock.

## Run Locally

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
```

## Deploy

The GitHub Actions workflow in [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml) publishes the app to GitHub Pages from `main`.

## Notes

- Raw backup files are ignored by [`.gitignore`](.gitignore).
- The repo can stay private, but a GitHub Pages site is still public-facing.
- The login is a client-side gate for a static site, not full server-side authentication.
