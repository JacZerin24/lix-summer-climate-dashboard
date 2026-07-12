# LIX Summer Climate Dashboard

A responsive GitHub Pages dashboard for summer climate statistics at the four primary WFO LIX climate sites:

- KBTR — Baton Rouge, Louisiana
- KMSY — New Orleans, Louisiana
- KGPT — Gulfport, Mississippi
- KMCB — McComb, Mississippi

The dashboard reproduces the useful parts of the original spreadsheet—daily observations, normals, departures, records, heat hazards, maximum heat index, rainfall, monthly and seasonal summaries, and historical reference tables—without requiring viewers to navigate a workbook.

## Active season: Summer 2026

Summer 2026 is the default live season. One GitHub Actions workflow refreshes completed daily summaries four times per day, retains changed data in the repository, tests the calculations, builds the site, and redeploys GitHub Pages during the same run.

Automated sources:

- **Daily high/low temperature, rainfall, and maximum apparent temperature:** Iowa Environmental Mesonet computed daily summaries
- **Heat Advisory, Excessive Heat Watch, and Excessive Heat Warning history:** National Weather Service API seven-day alert feed, retained in the repository after each update
- **Normals and daily records:** the supplied 2025 LIX workbook, rolled forward through the completed 2025 season

The automated 2026 values are **provisional**. Official climate products and later quality control may revise station totals.

## Repository layout

```text
.github/workflows/
├── update-live-data.yml       # refreshes data, tests, builds, and deploys
└── deploy.yml                 # manual backup deployment

public/data/
├── stations.json
├── climatology/               # normals and daily records
├── history/                   # historical reference tables
├── overrides/2026.json        # manual corrections and hazard overrides
└── seasons/
    ├── 2025/                  # converted completed workbook season
    └── 2026/                  # live provisional season

scripts/
├── convert_workbook.py        # converts the source XLSX to JSON
├── roll_forward_records.py    # adds completed-season records to baselines
└── update_live_data.py        # downloads and writes live-season JSON
```

## Local development

Requires Node.js 20.19+ or 22.12+.

```bash
npm install
npm run dev
```

Validation:

```bash
npm test
npm run build
python -m py_compile scripts/*.py
```

## Refresh 2026 data manually

```bash
npm run update:data
```

The script normally publishes completed days through yesterday. A specific ending date can be used for testing:

```bash
python scripts/update_live_data.py --year 2026 --through 2026-07-11
```

## Correct a provisional value

Use `public/data/overrides/2026.json` for a climate-product correction or a heat-hazard correction that should survive the next automated update.

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

Only fields included in an override replace the automated values.

## Rebuild from another workbook

```bash
python scripts/convert_workbook.py "LIX 2025 Summer Climate Stats BTR_MSY_MCB_GPT.xlsx" --output public/data
python scripts/roll_forward_records.py --year 2025
npm test
npm run build
```

## One-time GitHub Pages setup

1. Open **Settings → Pages** in this repository.
2. Under **Build and deployment**, choose **GitHub Actions**.
3. Open **Actions → Update and deploy 2026 climate data** and choose **Run workflow** if the initial run happened before Pages was enabled.

The main workflow also runs when its automation is installed or changed, so it immediately attempts to seed the 2026 files and launch the site. Later data-only commits made by the workflow do not recursively start another update.

Site URL:

`https://jaczerin24.github.io/lix-summer-climate-dashboard/`
