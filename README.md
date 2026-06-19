# Cadastral Field Book

A digital field book for **Leica RTK GPS cadastral surveys**, built around the
**double-polar** workflow used in cadastral/plot surveys.

Built with **Next.js (App Router) + Tailwind CSS + MongoDB (Mongoose)**.

---

## What it does

When you survey a plot/cadastral beacon you must (1) **calibrate** the equipment
against the local grid and (2) survey each point **double polar** — i.e. measure
it independently from **two reference stations**. The two measurements are
averaged, and their spread is checked against tolerances. If they disagree by
more than the limit, the point is flagged and must be re-surveyed.

This app digitises that workflow:

1. **Jobs** — create a survey job with its calibration / coordinate-system
   metadata (system name, ellipsoid, projection, 2D-Helmert transformation
   parameters) and the double-polar tolerances (Position & Height limits).
2. **Control points** — the known reference stations (e.g. `MTRM4`, `WP1`) with
   their local-grid coordinates (and optional WGS-84 Cartesian for calibration).
3. **Survey points (double polar)** — each point gets **two observations**, one
   from each reference. The app computes the **mean coordinate**, the
   **position/height spread**, and flags **"Limit exceeded"** in real time as you
   type.
4. **Paste import (the time-saver)** — instead of re-typing, paste the machine
   CSV for the *first polar* and *second polar*. The app matches points by name,
   computes the mean + differences, and shows a **preview that flags any point
   over the limit before you save** — so transcription typos (e.g. `7333` vs
   `7033`) are caught instantly. Configurable column order; auto-detects
   comma/tab/space delimiters.
5. **Field Book Report** — a clean, printable report (Print / Save as PDF) that
   mirrors the Leica fieldbook: company header, job info, coordinate system,
   control points, observations, and mean coordinates with `Posn. diff` /
   `Hgt. diff` / `Posn.+Hgt. diff` + a pass/fail summary.

**Options:** height capture is **toggleable per job** (off by default, since many
cadastral surveys omit it); the projection/**LO** is selectable (LO15…LO33).
Codelist generation and multi-user subscriptions are planned for later.

---

## Getting started

### 1. Prerequisites
- Node.js 18.18+ (tested on Node 22)
- A MongoDB database — either:
  - **Local:** install MongoDB Community and run `mongod`, or
  - **Atlas:** a free cluster at <https://www.mongodb.com/atlas>

### 2. Configure the database
```bash
cp .env.example .env.local
```
Edit `.env.local` and set your connection string:
```
MONGODB_URI=mongodb://127.0.0.1:27017/cadastral_fieldbook
# or an Atlas SRV string
```

### 3. Install & run
```bash
npm install
npm run dev
```
Open <http://localhost:3000>.

### 4. (Optional) Load the sample field book
Loads the `MATEBELE2022` job from the original Leica report so you can see real
data immediately:
```bash
npm run seed
```

### Build for production
```bash
npm run build
npm start
```

---

## How the double-polar check is computed

For a point with observations from references A and B (`lib/survey.js`):

| Value          | Formula                                                        |
| -------------- | ------------------------------------------------------------- |
| Mean E / N / H | simple average of the observations                            |
| Position diff  | horizontal distance between the two observations (max spread)  |
| Height diff    | vertical spread between the two observations                   |
| Posn. Quality  | per observation: `√(Sd.E² + Sd.N²)`                            |
| CQ             | standard error of the mean position (RMS deviation / √n)       |
| **Limit exceeded** | `Position diff > Position limit` **or** `Height diff > Height limit` |

> **Note on CQ:** Leica's proprietary report uses a weighted Coordinate Quality.
> This app uses a transparent, recomputable definition (standard error of the
> mean). The decision-driving values — the position/height spread vs the
> tolerances — match the cadastral double-polar check exactly.

---

## Project structure

```
src/
  app/
    page.js                     Jobs list
    jobs/new/page.js            Create job
    jobs/[id]/page.js           Job dashboard
    jobs/[id]/edit/page.js      Edit job
    jobs/[id]/control/page.js   Control / reference points
    jobs/[id]/survey/page.js    Double-polar survey points
    jobs/[id]/report/page.js    Printable Field Book Report
    api/                        REST endpoints (jobs, control, survey)
  components/                   Reusable UI (forms, badges, breadcrumbs)
  lib/
    mongodb.js                  Cached Mongoose connection
    survey.js                   Double-polar computation (single source of truth)
    api.js                      Client fetch helper
  models/                       Mongoose schemas (Job, ControlPoint, SurveyPoint)
scripts/seed.mjs                Sample MATEBELE2022 data
```

---

## Notes / possible next steps
- Auth is intentionally omitted (single-user, as requested).
- The 2D-Helmert transformation parameters are stored/displayed as entered
  during calibration; the app does not currently recompute the transformation
  from the WGS-84 ↔ Local Grid identical points (that requires the TM27
  projection chain — easy to add later if needed).
- Could add: import an existing Leica `.txt` field book, CSV export, map view.
