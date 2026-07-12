#!/usr/bin/env python3
"""Add daily precipitation records to generated climatology files.

The reference builder already downloads the RCC ACIS operational climate series.
This enrichment step uses the same verified station threads and year-specific
record baselines to add each calendar day's precipitation record and record
year(s) to the dashboard climatology JSON.
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from datetime import date
from pathlib import Path
from typing import Any

import build_operational_reference_data as operational

builder = operational.builder


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def enrich(data_root: Path, through_year: int) -> list[Path]:
    changed: list[Path] = []

    for code, meta in builder.STATIONS.items():
        sid = meta["record_sid"]
        verified_start = operational.VERIFIED_STARTS[sid]
        print(f"Downloading daily precipitation record history for {code} ({sid})...")
        rows, _ = builder.fetch_acis_daily(
            sid,
            verified_start,
            date(through_year, 12, 31),
        )
        if not rows:
            raise RuntimeError(f"{code}: ACIS returned no record data for {sid}")

        for display_year in builder.DISPLAY_YEARS:
            baseline = [
                item
                for item in rows
                if item["date"].year < display_year
                and item["date"].month in builder.SUMMER_MONTHS
            ]
            by_key: dict[str, list[dict[str, Any]]] = defaultdict(list)
            for item in baseline:
                by_key[item["date"].strftime("%m-%d")].append(item)

            path = data_root / "climatology" / str(display_year) / f"{code}.json"
            if not path.exists():
                raise RuntimeError(f"{code} {display_year}: missing climatology file {path}")
            payload = load_json(path)
            daily = payload.get("daily", {})

            for key, climate_row in daily.items():
                record, years = builder.record_for_day(by_key.get(key, []), "precip")
                if record is None or not years:
                    raise RuntimeError(
                        f"{code} {display_year} {key}: no daily precipitation record found"
                    )
                climate_row["recordPrecip"] = record
                climate_row["recordPrecipYears"] = years

            records_source = payload.setdefault("source", {}).setdefault("records", {})
            includes = set(records_source.get("includes", []))
            includes.update(
                {
                    "daily record high",
                    "daily warm-low record",
                    "daily precipitation record",
                }
            )
            records_source["includes"] = sorted(includes)
            write_json(path, payload)
            changed.append(path)

            if display_year == 2026:
                compatibility = data_root / "climatology" / f"{code}.json"
                write_json(compatibility, payload)
                changed.append(compatibility)

    return changed


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-root", type=Path, default=Path("public/data"))
    parser.add_argument(
        "--through-year",
        type=int,
        default=builder.HISTORY_THROUGH,
        help="Latest completed year available to the record baseline.",
    )
    args = parser.parse_args()
    paths = enrich(args.data_root, args.through_year)
    print(f"Added daily precipitation records to {len(paths)} climatology files")


if __name__ == "__main__":
    main()
