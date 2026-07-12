#!/usr/bin/env python3
"""Update the active LIX summer season from public station and alert services.

Daily high/low temperature, precipitation, and maximum apparent temperature are
pulled from the Iowa Environmental Mesonet daily-summary service. Heat hazards
are retained from the previous JSON and supplemented with the most recent seven
days of NWS API alerts. All values are provisional until official climate QC.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import os
import urllib.parse
import urllib.request
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

CENTRAL = ZoneInfo("America/Chicago")
USER_AGENT = "lix-summer-climate-dashboard/1.0 (WFO LIX climate dashboard)"
IEM_ENDPOINT = "https://mesonet.agron.iastate.edu/cgi-bin/request/daily.py"
NWS_ALERTS_ENDPOINT = "https://api.weather.gov/alerts"

STATIONS = {
    "KBTR": {"iem": "BTR", "network": "LA_ASOS", "lat": 30.5332, "lon": -91.1496},
    "KMSY": {"iem": "MSY", "network": "LA_ASOS", "lat": 29.9934, "lon": -90.2580},
    "KGPT": {"iem": "GPT", "network": "MS_ASOS", "lat": 30.4073, "lon": -89.0701},
    "KMCB": {"iem": "MCB", "network": "MS_ASOS", "lat": 31.1785, "lon": -90.4719},
}

HAZARD_CODES = {
    "Heat Advisory": "HT.Y",
    "Excessive Heat Watch": "EH.A",
    "Excessive Heat Warning": "EH.W",
}


def request_text(url: str, accept: str = "text/plain") -> str:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": accept})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read().decode("utf-8")


def parse_number(value: Any) -> float | int | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text or text.upper() in {"M", "NONE", "NULL", "N/A"}:
        return None
    try:
        number = float(text)
    except ValueError:
        return None
    return int(number) if number.is_integer() else round(number, 2)


def fetch_daily(network: str, station_ids: list[str], year: int, end_date: date) -> list[dict[str, str]]:
    params = {
        "sts": f"{year}-01-01",
        "ets": end_date.isoformat(),
        "network": network,
        "stations": ",".join(station_ids),
        "var": "max_temp_f,min_temp_f,precip_in,max_feel",
        "format": "csv",
        "na": "",
    }
    url = f"{IEM_ENDPOINT}?{urllib.parse.urlencode(params)}"
    return list(csv.DictReader(io.StringIO(request_text(url))))


def parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def fetch_recent_hazards(meta: dict[str, Any], today: date) -> dict[str, set[str]]:
    start = today - timedelta(days=7)
    params = {
        "point": f"{meta['lat']},{meta['lon']}",
        "start": datetime.combine(start, time.min, CENTRAL).astimezone(timezone.utc).isoformat(),
        "end": datetime.combine(today + timedelta(days=1), time.min, CENTRAL).astimezone(timezone.utc).isoformat(),
        "status": "actual",
    }
    url = f"{NWS_ALERTS_ENDPOINT}?{urllib.parse.urlencode(params)}"
    payload = json.loads(request_text(url, "application/geo+json"))
    hazards: dict[str, set[str]] = {}

    for feature in payload.get("features", []):
        properties = feature.get("properties", {})
        code = HAZARD_CODES.get(properties.get("event"))
        if not code:
            continue
        begins = parse_iso(properties.get("onset") or properties.get("effective") or properties.get("sent"))
        ends = parse_iso(properties.get("ends") or properties.get("expires"))
        if not begins:
            continue
        if not ends:
            ends = begins
        local_start = begins.astimezone(CENTRAL).date()
        local_end = ends.astimezone(CENTRAL).date()
        current = local_start
        while current <= local_end:
            hazards.setdefault(current.isoformat(), set()).add(code)
            current += timedelta(days=1)
    return hazards


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def apply_override(observation: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    allowed = {"high", "low", "maxHeatIndex", "precip", "precipTrace", "accumulatedPrecip", "hazards"}
    for key, value in override.items():
        if key in allowed:
            observation[key] = value
    return observation


def update(year: int, output: Path, through: date | None = None) -> list[Path]:
    today = datetime.now(CENTRAL).date()
    season_end = date(year, 9, 30)
    default_through = min(today - timedelta(days=1), season_end)
    end_date = through or default_through
    if end_date < date(year, 1, 1):
        raise ValueError(f"No completed {year} days are available yet")

    by_iem = {meta["iem"]: code for code, meta in STATIONS.items()}
    fetched: dict[str, list[dict[str, str]]] = {code: [] for code in STATIONS}
    for network in sorted({meta["network"] for meta in STATIONS.values()}):
        ids = [meta["iem"] for meta in STATIONS.values() if meta["network"] == network]
        for row in fetch_daily(network, ids, year, end_date):
            code = by_iem.get((row.get("station") or "").strip())
            if code:
                fetched[code].append(row)

    overrides_path = output / "overrides" / f"{year}.json"
    overrides = load_json(overrides_path, {"stations": {}}).get("stations", {})
    changed: list[Path] = []

    for code, meta in STATIONS.items():
        target = output / "seasons" / str(year) / f"{code}.json"
        existing = load_json(target, {"observations": []})
        existing_hazards = {item["date"]: set(item.get("hazards", [])) for item in existing.get("observations", []) if item.get("date")}
        try:
            recent_hazards = fetch_recent_hazards(meta, today)
        except Exception as exc:
            print(f"Warning: NWS hazards unavailable for {code}: {exc}")
            recent_hazards = {}

        ytd_precip = 0.0
        observations: list[dict[str, Any]] = []
        for row in sorted(fetched[code], key=lambda item: item.get("day", "")):
            day_text = (row.get("day") or "").strip()
            if not day_text:
                continue
            day = date.fromisoformat(day_text)
            precip_raw = parse_number(row.get("precip_in"))
            trace = precip_raw == 0.0001
            precip = 0 if trace else precip_raw
            if isinstance(precip, (int, float)):
                ytd_precip += float(precip)

            if day.month not in {6, 7, 8, 9}:
                continue

            hazards = existing_hazards.get(day_text, set()) | recent_hazards.get(day_text, set())
            observation = {
                "date": day_text,
                "hazards": sorted(hazards),
                "high": parse_number(row.get("max_temp_f")),
                "low": parse_number(row.get("min_temp_f")),
                "maxHeatIndex": parse_number(row.get("max_feel")),
                "precip": precip,
                "precipTrace": trace,
                "accumulatedPrecip": round(ytd_precip, 2),
            }
            station_override = overrides.get(code, {}).get(day_text, {})
            observations.append(apply_override(observation, station_override))

        sources = {
            "dailyObservations": "Iowa Environmental Mesonet computed daily summaries",
            "heatHazards": "National Weather Service API seven-day alert feed",
        }
        data_through = observations[-1]["date"] if observations else None
        content_changed = (
            existing.get("observations", []) != observations
            or existing.get("dataThrough") != data_through
            or existing.get("sources") != sources
            or existing.get("provisional") is not True
        )
        if not content_changed:
            continue

        payload = {
            "station": code,
            "year": year,
            "provisional": True,
            "dataThrough": data_through,
            "lastUpdated": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
            "sources": sources,
            "observations": observations,
        }
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        changed.append(target)
    return changed


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--year", type=int, default=int(os.getenv("CLIMATE_YEAR", "2026")))
    parser.add_argument("--output", type=Path, default=Path("public/data"))
    parser.add_argument("--through", type=date.fromisoformat, help="Override final date (YYYY-MM-DD)")
    args = parser.parse_args()
    changed = update(args.year, args.output, args.through)
    if changed:
        print("Updated:")
        for path in changed:
            print(f"  {path}")
    else:
        print("No live-data changes detected")


if __name__ == "__main__":
    main()
