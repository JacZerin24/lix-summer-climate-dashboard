# LIX Summer Climate Dashboard

A responsive GitHub Pages dashboard for summer climate statistics at the four primary WFO LIX climate sites:

- KBTR — Baton Rouge, Louisiana
- KMSY — New Orleans, Louisiana
- KGPT — Gulfport, Mississippi
- KMCB — McComb, Mississippi

The spreadsheet supplied during development is now used only as a design reference. Published climatology, records, observations, and historical tables are rebuilt from documented external datasets.

## Data sources and precedence

### Official NOAA/NCEI data

The following values come from NOAA's National Centers for Environmental Information:

- Daily high temperature
- Daily low temperature
- Daily precipitation
- 1991–2020 daily normal high and low temperature
- 1991–2020 year-to-date normal precipitation
- Daily record high and warm-low values and years
- Longest hot streaks, annual hot-day rankings, daily-record-year rankings, and monthly rainfall rankings

Reference records use the NCEI GHCN-Daily station record for these identifiers:

| Site | NCEI GHCN-Daily station |
|---|---|
| KBTR | USW00013970 |
| KMSY | USW00012916 |
| KGPT | USW00093874 |
| KMCB | USW00093919 |

The dashboard creates a separate record baseline for each displayed year. For example, 2025 record comparisons use records through 2024, while 2026 comparisons use records through 2025.

### NWS heat products

Current terminology and VTEC codes are:

- Heat Advisory — `HT.Y`
- Extreme Heat Watch — `XH.A`
- Extreme Heat Warning — `XH.W`

The official NWS API supplies recent alerts. Because that API retains only the most recent seven days, the dashboard uses the Iowa Environmental Mesonet archive of **NWS-issued VTEC products** to reconstruct the rest of the summer. Legacy `EH.A` and `EH.W` values are normalized to the current `XH.A` and `XH.W` codes.

The dashboard reports **product-days**: a two-day Heat Advisory contributes one advisory day to each applicable date. It does not claim that each date represents a separate issuance.

### Derived/provisional values

IEM provides maximum daily heat index/“feels like” and acts as a provisional fallback only when a newly completed day has not yet appeared in NCEI Daily Summaries. Each season JSON includes source counts so the webpage can show how many rows use official NCEI data versus the fallback.

## Automated accuracy audit

Every deployment runs `scripts/audit_dashboard_data.py`. The deployment fails when it finds issues such as:

- Missing summer normals or record values
- Workbook-derived source metadata
- Record years that improperly include the displayed year
- Duplicate or unsorted dates
- High temperatures below low temperatures
- Negative or internally inconsistent precipitation
- Legacy/unknown heat-product codes
- Missing or incomplete historical tables
- Zero 2026 heat-product days across all four sites

The latest machine-readable report is published at:

`https://jaczerin24.github.io/lix-summer-climate-dashboard/data/audit/latest.json`

## Active season: Summer 2026

The main workflow runs four times daily. It:

1. Refreshes completed 2026 daily values.
2. Backfills the full-season heat-product archive.
3. Rebuilds official reference records weekly and whenever source code changes.
4. Rebuilds the completed 2025 comparison season during a reference refresh.
5. Runs the data audit and JavaScript calculation tests.
6. Commits changed data and deploys GitHub Pages.

The newest observations remain provisional until NCEI completes quality control.

## Repository layout

```text
.github/workflows/
├── update-live-data.yml              # refreshes, audits, builds, and deploys
└── deploy.yml                         # manual audited backup deployment

public/data/
├── audit/latest.json                  # latest validation report
├── stations.json
├── climatology/
│   ├── 2025/                          # records through 2024
│   └── 2026/                          # records through 2025
├── history/                           # official NCEI-derived reference tables
├── overrides/2026.json                # documented manual corrections
└── seasons/
    ├── 2025/                          # rebuilt from official daily summaries
    └── 2026/                          # live official/provisional season

scripts/
├── build_official_reference_data.py   # NOAA normals, records, history
├── update_live_data.py                # observations and heat products
└── audit_dashboard_data.py            # deployment-blocking audit
```

## Local development

Requires Python 3.12 and Node.js 20.19+ or 22.12+.

```bash
python scripts/build_official_reference_data.py
python scripts/update_live_data.py --year 2025 --through 2025-09-30
python scripts/update_live_data.py --year 2026
python scripts/audit_dashboard_data.py
npm install
npm test
npm run dev
```

Production build:

```bash
npm run build
```

## Manual corrections

Use `public/data/overrides/2026.json` only for a documented correction that should survive automated refreshes.

```json
{
  "stations": {
    "KBTR": {
      "2026-07-12": {
        "high": 96,
        "low": 78,
        "maxHeatIndex": 108,
        "precip": 0.15,
        "precipTrace": false,
        "hazards": ["HT.Y"]
      }
    }
  }
}
```

Only included fields replace automated values.

## Site

`https://jaczerin24.github.io/lix-summer-climate-dashboard/`
