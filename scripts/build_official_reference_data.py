#!/usr/bin/env python3
"""Build dashboard normals, records, and historical tables from NOAA/NCEI.

Sources
-------
* NOAA 1991-2020 U.S. Climate Normals daily station CSV files.
* NOAA/NCEI Access Data Service, Daily Summaries (GHCN-Daily).

The generated records are the official NCEI station record for the GHCN-Daily
identifier listed for each airport climate site. They are not copied from the
reference workbook.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import math
import time
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable

USER_AGENT = "lix-summer-climate-dashboard/2.0 (NOAA climate dashboard data audit)"
NCEI_ACCESS = "https://www.ncei.noaa.gov/access/services/data/v1"
NORMALS_BASE = "https://www.ncei.noaa.gov/data/normals-daily/1991-2020/access"
SUMMER_MONTHS = {6, 7, 8, 9}
DISPLAY_YEARS = (2025, 2026)
HISTORY_THROUGH = 2025
EARLIEST_YEAR = 1890

STATIONS: dict[str, dict[str, Any]] = {
    "KBTR": {
        "name": "Baton Rouge, LA",
        "ghcn": "USW00013970",
        "lat": 30.5332,
        "lon": -91.1496,
    },
    "KMSY": {
        "name": "New Orleans, LA",
        "ghcn": "USW00012916",
        "lat": 29.9934,
        "lon": -90.2580,
    },
    "KGPT": {
        "name": "Gulfport, MS",
        "ghcn": "USW00093874",
        "lat": 30.4073,
        "lon": -89.0701,
    },
    "KMCB": {
        "name": "McComb, MS",
        "ghcn": "USW00093919",
        "lat": 31.1785,
        "lon": -90.4719,
    },
}


def request_text(url: str, attempts: int = 4) -> str:
    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            request = urllib.request.Request(
                url,
                headers={
                    "User-Agent": USER_AGENT,
                    "Accept": "application/json,text/csv,text/plain,*/*",
                },
            )
            with urllib.request.urlopen(request, timeout=120) as response:
                return response.read().decode("utf-8-sig")
        except Exception as exc:  # network retry is intentional
            last_error = exc
            if attempt + 1 < attempts:
                time.sleep(2 ** attempt)
    assert last_error is not None
    raise last_error


def parse_number(value: Any) -> float | int | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text or text.upper() in {"M", "NA", "N/A", "NULL", "NONE", "-9999", "-7777"}:
        return None
    if text.upper() == "T":
        return 0
    try:
        number = float(text)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number) or number <= -900:
        return None
    return int(number) if number.is_integer() else round(number, 2)


def date_key(value: str) -> str | None:
    text = value.strip()
    if not text:
        return None
    if len(text) >= 10 and text[4] == "-":
        return text[5:10]
    if len(text) == 5 and text[2] == "-":
        return text
    digits = "".join(char for char in text if char.isdigit())
    if len(digits) >= 4:
        return f"{digits[-4:-2]}-{digits[-2:]}"
    return None


def fetch_normals(ghcn: str) -> tuple[dict[str, dict[str, Any]], str]:
    url = f"{NORMALS_BASE}/{ghcn}.csv"
    rows = csv.DictReader(io.StringIO(request_text(url)))
    daily: dict[str, dict[str, Any]] = {}
    cumulative = 0.0
    for row in rows:
        key = date_key(row.get("DATE", ""))
        if not key:
            continue
        daily_precip = parse_number(row.get("DLY-PRCP-NORMAL"))
        if isinstance(daily_precip, (int, float)):
            cumulative += float(daily_precip)
        ytd = parse_number(row.get("YTD-PRCP-NORMAL"))
        if ytd is None:
            ytd = round(cumulative, 2)
        if int(key[:2]) not in SUMMER_MONTHS:
            continue
        daily[key] = {
            "normalHigh": parse_number(row.get("DLY-TMAX-NORMAL")),
            "normalLow": parse_number(row.get("DLY-TMIN-NORMAL")),
            "normalYtdPrecip": ytd,
        }
    return daily, url


def ncei_url(ghcn: str, start: date, end: date) -> str:
    params = {
        "dataset": "daily-summaries",
        "stations": ghcn,
        "startDate": start.isoformat(),
        "endDate": end.isoformat(),
        "format": "json",
        "units": "standard",
        "includeAttributes": "false",
        "includeStationName": "true",
        "dataTypes": "TMAX,TMIN,PRCP",
    }
    return f"{NCEI_ACCESS}?{urllib.parse.urlencode(params)}"


def fetch_ncei_daily(ghcn: str, start: date, end: date, chunk_years: int = 10) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    cursor = start
    while cursor <= end:
        chunk_end = min(end, date(cursor.year + chunk_years - 1, 12, 31))
        payload = json.loads(request_text(ncei_url(ghcn, cursor, chunk_end)))
        if isinstance(payload, dict):
            payload = payload.get("results") or payload.get("data") or []
        for row in payload:
            day_text = str(row.get("DATE") or row.get("date") or "")[:10]
            try:
                day = date.fromisoformat(day_text)
            except ValueError:
                continue
            output.append(
                {
                    "date": day,
                    "high": parse_number(row.get("TMAX")),
                    "low": parse_number(row.get("TMIN")),
                    "precip": parse_number(row.get("PRCP")),
                }
            )
        cursor = chunk_end + timedelta(days=1)
    deduped = {item["date"]: item for item in output}
    return [deduped[key] for key in sorted(deduped)]


def record_for_day(rows: Iterable[dict[str, Any]], field: str) -> tuple[float | int | None, str]:
    valid = [(item[field], item["date"].year) for item in rows if isinstance(item.get(field), (int, float))]
    if not valid:
        return None, ""
    value = max(item[0] for item in valid)
    years = sorted({year for observed, year in valid if observed == value})
    return value, ", ".join(str(year) for year in years)


def expected_days(year: int, month: int | None = None) -> int:
    if month is None:
        return sum(expected_days(year, item) for item in SUMMER_MONTHS)
    start = date(year, month, 1)
    if month == 12:
        end = date(year + 1, 1, 1)
    else:
        end = date(year, month + 1, 1)
    return (end - start).days


def longest_streaks(rows: list[dict[str, Any]], threshold: int) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    start: date | None = None
    previous: date | None = None
    count = 0

    def date_label(value: date) -> str:
        return f"{value:%b} {value.day}"

    def finish() -> None:
        nonlocal start, previous, count
        if start is not None and previous is not None and count:
            output.append(
                {
                    "days": count,
                    "year": start.year,
                    "dates": f"{date_label(start)}–{date_label(previous)}, {previous.year}",
                }
            )
        start = previous = None
        count = 0

    for item in sorted(rows, key=lambda value: value["date"]):
        day = item["date"]
        high = item.get("high")
        qualifying = isinstance(high, (int, float)) and high >= threshold
        consecutive = previous is not None and day == previous + timedelta(days=1)
        same_year = start is None or day.year == start.year
        if qualifying:
            if start is None or not consecutive or not same_year:
                finish()
                start = day
                count = 1
            else:
                count += 1
            previous = day
        else:
            finish()
    finish()
    return sorted(output, key=lambda item: (-item["days"], item["year"], item["dates"]))[:10]


def yearly_hot_counts(rows: list[dict[str, Any]], threshold: int) -> list[dict[str, Any]]:
    grouped: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for item in rows:
        grouped[item["date"].year].append(item)
    result = []
    for year, items in grouped.items():
        valid_days = {item["date"] for item in items if isinstance(item.get("high"), (int, float))}
        if len(valid_days) < expected_days(year) - 1:
            continue
        result.append(
            {
                "count": sum(1 for item in items if isinstance(item.get("high"), (int, float)) and item["high"] >= threshold),
                "year": year,
            }
        )
    return sorted(result, key=lambda item: (-item["count"], item["year"]))[:10]


def monthly_precip_records(rows: list[dict[str, Any]], through_year: int) -> dict[str, Any]:
    grouped: dict[tuple[int, int], list[dict[str, Any]]] = defaultdict(list)
    for item in rows:
        day = item["date"]
        if day.year <= through_year and day.month in SUMMER_MONTHS:
            grouped[(day.year, day.month)].append(item)
    output: dict[str, Any] = {}
    for month in sorted(SUMMER_MONTHS):
        totals = []
        for (year, item_month), items in grouped.items():
            if item_month != month:
                continue
            valid = [item for item in items if isinstance(item.get("precip"), (int, float))]
            if len({item["date"] for item in valid}) != expected_days(year, month):
                continue
            totals.append({"amount": round(sum(float(item["precip"]) for item in valid), 2), "date": str(year)})
        output[f"{month:02d}"] = {
            "highest": sorted(totals, key=lambda item: (-item["amount"], item["date"]))[:5],
            "lowest": sorted(totals, key=lambda item: (item["amount"], item["date"]))[:5],
        }
    return output


def record_year_counts(rows: list[dict[str, Any]], through_year: int) -> list[dict[str, Any]]:
    by_key: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in rows:
        if item["date"].year <= through_year and item["date"].month in SUMMER_MONTHS:
            by_key[item["date"].strftime("%m-%d")].append(item)
    counts: Counter[int] = Counter()
    for items in by_key.values():
        value, years_text = record_for_day(items, "high")
        if value is None:
            continue
        for year in years_text.split(", "):
            if year:
                counts[int(year)] += 1
    return [{"count": count, "year": year} for year, count in sorted(counts.items(), key=lambda item: (-item[1], item[0]))[:10]]


def history_payload(code: str, meta: dict[str, Any], rows: list[dict[str, Any]], generated: str) -> dict[str, Any]:
    summer = [item for item in rows if item["date"].month in SUMMER_MONTHS and item["date"].year <= HISTORY_THROUGH]
    observed_dates = [item["date"] for item in rows if any(isinstance(item.get(key), (int, float)) for key in ("high", "low", "precip"))]
    por_start = min(observed_dates).isoformat() if observed_dates else None
    por_end = max(observed_dates).isoformat() if observed_dates else None

    streak_99 = longest_streaks(summer, 99)
    streak_100 = longest_streaks(summer, 100)
    yearly_99 = yearly_hot_counts(summer, 99)
    yearly_100 = yearly_hot_counts(summer, 100)
    record_years = record_year_counts(summer, HISTORY_THROUGH)

    def rows_of(items: list[dict[str, Any]], fields: tuple[str, ...]) -> list[list[Any]]:
        return [[item[field] for field in fields] for item in items]

    return {
        "station": code,
        "generatedAt": generated,
        "source": {
            "agency": "NOAA National Centers for Environmental Information",
            "dataset": "Global Historical Climatology Network Daily / Daily Summaries",
            "stationId": meta["ghcn"],
            "recordThrough": HISTORY_THROUGH,
            "periodOfRecord": {"start": por_start, "end": por_end},
            "basis": "NCEI station record; no spreadsheet values used",
        },
        "referenceTables": [
            {
                "title": "Longest consecutive days at or above 99°F",
                "updated": f"Through {HISTORY_THROUGH}",
                "headers": ["Days", "Year", "Dates"],
                "rows": rows_of(streak_99, ("days", "year", "dates")),
            },
            {
                "title": "Longest consecutive days at or above 100°F",
                "updated": f"Through {HISTORY_THROUGH}",
                "headers": ["Days", "Year", "Dates"],
                "rows": rows_of(streak_100, ("days", "year", "dates")),
            },
            {
                "title": "Yearly greatest number of days at or above 99°F",
                "updated": f"Through {HISTORY_THROUGH}",
                "headers": ["Total #", "Year"],
                "rows": rows_of(yearly_99, ("count", "year")),
            },
            {
                "title": "Yearly greatest number of days at or above 100°F",
                "updated": f"Through {HISTORY_THROUGH}",
                "headers": ["Total #", "Year"],
                "rows": rows_of(yearly_100, ("count", "year")),
            },
            {
                "title": "Years holding the most June–September daily record highs",
                "updated": f"Records through {HISTORY_THROUGH}",
                "headers": ["Total #", "Year"],
                "rows": rows_of(record_years, ("count", "year")),
            },
        ],
        "monthlyPrecipRecords": monthly_precip_records(summer, HISTORY_THROUGH),
    }


def climate_payload(
    code: str,
    meta: dict[str, Any],
    normals: dict[str, dict[str, Any]],
    normals_url: str,
    rows: list[dict[str, Any]],
    target_year: int,
    generated: str,
) -> dict[str, Any]:
    baseline = [item for item in rows if item["date"].year < target_year and item["date"].month in SUMMER_MONTHS]
    by_key: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in baseline:
        by_key[item["date"].strftime("%m-%d")].append(item)
    daily: dict[str, dict[str, Any]] = {}
    for key in sorted(normals):
        high, high_years = record_for_day(by_key.get(key, []), "high")
        warm_low, warm_low_years = record_for_day(by_key.get(key, []), "low")
        daily[key] = {
            **normals[key],
            "recordHigh": high,
            "recordHighYears": high_years,
            "recordWarmLow": warm_low,
            "recordWarmLowYears": warm_low_years,
        }
    observed_dates = [item["date"] for item in baseline if any(isinstance(item.get(field), (int, float)) for field in ("high", "low", "precip"))]
    return {
        "station": code,
        "displayYear": target_year,
        "generatedAt": generated,
        "source": {
            "normals": {
                "agency": "NOAA National Centers for Environmental Information",
                "dataset": "U.S. Climate Normals 1991-2020, Daily",
                "stationId": meta["ghcn"],
                "url": normals_url,
            },
            "records": {
                "agency": "NOAA National Centers for Environmental Information",
                "dataset": "GHCN-Daily / Daily Summaries",
                "stationId": meta["ghcn"],
                "throughYear": target_year - 1,
                "periodOfRecord": {
                    "start": min(observed_dates).isoformat() if observed_dates else None,
                    "end": max(observed_dates).isoformat() if observed_dates else None,
                },
                "basis": "NCEI station record; no spreadsheet values used",
            },
        },
        "daily": daily,
    }


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def build(output: Path, start_year: int = EARLIEST_YEAR, through_year: int = HISTORY_THROUGH) -> list[Path]:
    generated = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    changed: list[Path] = []
    for code, meta in STATIONS.items():
        print(f"Downloading official NCEI reference data for {code} ({meta['ghcn']})...")
        normals, normals_url = fetch_normals(meta["ghcn"])
        rows = fetch_ncei_daily(meta["ghcn"], date(start_year, 1, 1), date(through_year, 12, 31))
        if len(normals) != 122:
            raise RuntimeError(f"{code}: expected 122 summer normal rows, found {len(normals)}")
        if not rows:
            raise RuntimeError(f"{code}: NCEI returned no historical daily data")
        for year in DISPLAY_YEARS:
            path = output / "climatology" / str(year) / f"{code}.json"
            payload = climate_payload(code, meta, normals, normals_url, rows, year, generated)
            write_json(path, payload)
            changed.append(path)
        compatibility = output / "climatology" / f"{code}.json"
        write_json(compatibility, climate_payload(code, meta, normals, normals_url, rows, 2026, generated))
        changed.append(compatibility)
        history = output / "history" / f"{code}.json"
        write_json(history, history_payload(code, meta, rows, generated))
        changed.append(history)
    return changed


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("public/data"))
    parser.add_argument("--start-year", type=int, default=EARLIEST_YEAR)
    parser.add_argument("--through-year", type=int, default=HISTORY_THROUGH)
    args = parser.parse_args()
    paths = build(args.output, args.start_year, args.through_year)
    print(f"Wrote {len(paths)} official reference files")


if __name__ == "__main__":
    main()
