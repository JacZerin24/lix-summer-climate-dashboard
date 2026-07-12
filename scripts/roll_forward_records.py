#!/usr/bin/env python3
"""Roll daily record baselines forward through a completed season."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def append_year(value, year: int) -> str:
    years = [item.strip() for item in str(value or "").split(",") if item.strip()]
    text = str(year)
    if text not in years:
        years.append(text)
    return ", ".join(years)


def update_station(data_root: Path, station: str, year: int) -> bool:
    season_path = data_root / "seasons" / str(year) / f"{station}.json"
    climate_path = data_root / "climatology" / f"{station}.json"
    season = json.loads(season_path.read_text(encoding="utf-8"))
    climate = json.loads(climate_path.read_text(encoding="utf-8"))
    changed = False

    for observation in season.get("observations", []):
        daily = climate["daily"].get(observation["date"][5:])
        if not daily:
            continue
        high = observation.get("high")
        record_high = daily.get("recordHigh")
        if isinstance(high, (int, float)) and isinstance(record_high, (int, float)):
            if high > record_high:
                daily["recordHigh"] = high
                daily["recordHighYears"] = str(year)
                changed = True
            elif high == record_high:
                updated = append_year(daily.get("recordHighYears"), year)
                if updated != daily.get("recordHighYears"):
                    daily["recordHighYears"] = updated
                    changed = True

        low = observation.get("low")
        record_low = daily.get("recordWarmLow")
        if isinstance(low, (int, float)) and isinstance(record_low, (int, float)):
            if low > record_low:
                daily["recordWarmLow"] = low
                daily["recordWarmLowYears"] = str(year)
                changed = True
            elif low == record_low:
                updated = append_year(daily.get("recordWarmLowYears"), year)
                if updated != daily.get("recordWarmLowYears"):
                    daily["recordWarmLowYears"] = updated
                    changed = True

    if changed:
        climate_path.write_text(json.dumps(climate, indent=2) + "\n", encoding="utf-8")
    return changed


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--year", type=int, required=True)
    parser.add_argument("--data-root", type=Path, default=Path("public/data"))
    args = parser.parse_args()
    stations = [path.stem for path in (args.data_root / "climatology").glob("*.json")]
    for station in sorted(stations):
        print(f"{station}: {'updated' if update_station(args.data_root, station, args.year) else 'no changes'}")


if __name__ == "__main__":
    main()
