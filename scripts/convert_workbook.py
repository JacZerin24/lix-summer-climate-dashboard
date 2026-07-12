#!/usr/bin/env python3
"""Convert the LIX summer climate workbook into dashboard JSON.

This script uses only the Python standard library. It reads cached cell values
from the XLSX package, so Google Sheets IMPORTRANGE results remain available
without needing access to the source sheets.
"""

from __future__ import annotations

import argparse
import json
import posixpath
import re
import zipfile
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET

MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
NS = {"m": MAIN_NS, "r": REL_NS, "pr": PKG_REL_NS}

STATIONS = {
    "KBTR": {"sheet": "Summer 25 - KBTR", "name": "Baton Rouge, LA", "city": "Baton Rouge", "state": "LA"},
    "KMSY": {"sheet": "Summer 25 - KMSY", "name": "New Orleans, LA", "city": "New Orleans", "state": "LA"},
    "KGPT": {"sheet": "Summer 25 - KGPT", "name": "Gulfport, MS", "city": "Gulfport", "state": "MS"},
    "KMCB": {"sheet": "Summer 25 - KMCB", "name": "McComb, MS", "city": "McComb", "state": "MS"},
}

MONTH_ROWS = {
    "06": {"data": (7, 36), "summary": (37, 43)},
    "07": {"data": (47, 77), "summary": (78, 84)},
    "08": {"data": (88, 118), "summary": (119, 125)},
    "09": {"data": (129, 158), "summary": (159, 165)},
}


def column_number(reference: str) -> int:
    letters = re.match(r"[A-Z]+", reference)
    if not letters:
        raise ValueError(f"Invalid cell reference: {reference}")
    total = 0
    for char in letters.group(0):
        total = total * 26 + ord(char) - 64
    return total


def cell_ref(column: int, row: int) -> str:
    letters = ""
    while column:
        column, remainder = divmod(column - 1, 26)
        letters = chr(65 + remainder) + letters
    return f"{letters}{row}"


def number_or_text(value: str | None) -> Any:
    if value is None:
        return None
    try:
        number = float(value)
    except ValueError:
        return value
    return int(number) if number.is_integer() else number


def excel_date(value: Any) -> str | None:
    if value is None:
        return None
    try:
        serial = float(value)
    except (TypeError, ValueError):
        return str(value)
    return (datetime(1899, 12, 30) + timedelta(days=serial)).date().isoformat()


def read_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []
    root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    strings: list[str] = []
    for item in root.findall("m:si", NS):
        strings.append("".join(node.text or "" for node in item.iter(f"{{{MAIN_NS}}}t")))
    return strings


def worksheet_paths(archive: zipfile.ZipFile) -> dict[str, str]:
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    relationship_map = {rel.attrib["Id"]: rel.attrib["Target"] for rel in relationships.findall("pr:Relationship", NS)}
    paths: dict[str, str] = {}
    sheets = workbook.find("m:sheets", NS)
    if sheets is None:
        return paths
    for sheet in sheets:
        relationship_id = sheet.attrib[f"{{{REL_NS}}}id"]
        target = relationship_map[relationship_id]
        paths[sheet.attrib["name"]] = posixpath.normpath(posixpath.join("xl", target))
    return paths


def parse_sheet(archive: zipfile.ZipFile, path: str, shared_strings: list[str]) -> dict[str, dict[str, Any]]:
    root = ET.fromstring(archive.read(path))
    cells: dict[str, dict[str, Any]] = {}
    for cell in root.findall(".//m:sheetData/m:row/m:c", NS):
        reference = cell.attrib["r"]
        cell_type = cell.attrib.get("t")
        formula_node = cell.find("m:f", NS)
        value_node = cell.find("m:v", NS)
        inline = cell.find("m:is", NS)
        raw_value = value_node.text if value_node is not None else None
        if cell_type == "s" and raw_value is not None:
            value: Any = shared_strings[int(raw_value)]
        elif cell_type == "inlineStr" and inline is not None:
            value = "".join(node.text or "" for node in inline.iter(f"{{{MAIN_NS}}}t"))
        elif cell_type == "b":
            value = raw_value == "1"
        elif cell_type in {"str", "e"}:
            value = raw_value
        else:
            value = number_or_text(raw_value)
        cells[reference] = {"value": value, "formula": formula_node.text if formula_node is not None else None}
    return cells


def get(cells: dict[str, dict[str, Any]], reference: str) -> Any:
    value = cells.get(reference, {}).get("value")
    if isinstance(value, str) and value.strip().upper() in {"N/A", "#N/A"}:
        return None
    return value


def parse_precip_record(value: Any) -> dict[str, str] | None:
    if value is None:
        return None
    parts = str(value).strip().replace("\t", " ").split()
    if not parts:
        return None
    return {"amount": parts[0], "date": parts[-1] if len(parts) > 1 else ""}


def parse_reference_tables(cells: dict[str, dict[str, Any]], end_column: int) -> list[dict[str, Any]]:
    values = [[get(cells, cell_ref(column, row)) for column in range(23, end_column + 1)] for row in range(1, 61)]
    spans = [(0, 2), (4, 5), (7, 9)]
    if end_column >= 35:
        spans.append((10, 12))
    tables: list[dict[str, Any]] = []
    for start, end in spans:
        current: dict[str, Any] | None = None
        for row in values:
            items = row[start : end + 1]
            first = items[0] if items else None
            is_title = isinstance(first, str) and (first.startswith("Longest Consecutive") or first.startswith("Yearly Greatest") or "Total Year Record Highs" in first)
            if is_title:
                if current and current["rows"]:
                    tables.append(current)
                current = {"title": first, "updated": None, "headers": [], "rows": []}
                continue
            if current is None:
                continue
            if isinstance(first, str) and first.startswith("Updated"):
                current["updated"] = first.replace("Updated ", "")
                continue
            if first in {"Total #", "Broke By:"}:
                current["headers"] = [str(value) if value is not None else "" for value in items]
                continue
            if current["headers"] and any(value is not None for value in items):
                output_row = []
                for header, value in zip(current["headers"], items):
                    if header in {"Date", "Dates"} and isinstance(value, (int, float)):
                        value = excel_date(value)
                    output_row.append(value)
                current["rows"].append(output_row)
        if current and current["rows"]:
            tables.append(current)
    return tables


def build_station_data(code: str, metadata: dict[str, str], cells: dict[str, dict[str, Any]], workbook_name: str) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    observations: list[dict[str, Any]] = []
    climatology: dict[str, Any] = {}
    monthly_precip_records: dict[str, Any] = {}
    for month, ranges in MONTH_ROWS.items():
        start, end = ranges["data"]
        for row in range(start, end + 1):
            date = excel_date(get(cells, f"D{row}"))
            if not date or not date.startswith("2025-"):
                continue
            hazards = []
            for column in "ABC":
                hazard = get(cells, f"{column}{row}")
                if hazard:
                    hazards.append({"XH.A": "EH.A", "XH.W": "EH.W"}.get(str(hazard), str(hazard)))
            rain_value = get(cells, f"R{row}")
            trace = isinstance(rain_value, str) and rain_value.strip().upper() == "T"
            precipitation = 0 if trace else rain_value
            observations.append({"date": date, "hazards": hazards, "high": get(cells, f"E{row}"), "low": get(cells, f"K{row}"), "maxHeatIndex": get(cells, f"Q{row}"), "precip": precipitation, "precipTrace": trace, "accumulatedPrecip": get(cells, f"S{row}")})
            climatology[date[5:]] = {"normalHigh": get(cells, f"F{row}"), "recordHigh": get(cells, f"H{row}"), "recordHighYears": get(cells, f"I{row}"), "normalLow": get(cells, f"L{row}"), "recordWarmLow": get(cells, f"N{row}"), "recordWarmLowYears": get(cells, f"O{row}"), "normalYtdPrecip": get(cells, f"T{row}")}
        summary_start, summary_end = ranges["summary"]
        highest, lowest = [], []
        for row in range(summary_start, summary_end + 1):
            high_record = parse_precip_record(get(cells, f"T{row}"))
            low_record = parse_precip_record(get(cells, f"U{row}"))
            if high_record:
                highest.append(high_record)
            if low_record:
                lowest.append(low_record)
        monthly_precip_records[month] = {"highest": highest, "lowest": lowest}
    season = {"station": code, "year": 2025, "sourceWorkbook": workbook_name, "observations": observations}
    climate = {"station": code, "daily": climatology}
    history = {"station": code, "referenceTables": parse_reference_tables(cells, 35 if code == "KBTR" else 32), "monthlyPrecipRecords": monthly_precip_records}
    return season, climate, history


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def convert(workbook_path: Path, output: Path) -> None:
    with zipfile.ZipFile(workbook_path) as archive:
        shared_strings = read_shared_strings(archive)
        paths = worksheet_paths(archive)
        station_list = []
        for code, metadata in STATIONS.items():
            sheet_name = metadata["sheet"]
            if sheet_name not in paths:
                raise KeyError(f"Workbook is missing required sheet: {sheet_name}")
            cells = parse_sheet(archive, paths[sheet_name], shared_strings)
            season, climate, history = build_station_data(code, metadata, cells, workbook_path.name)
            write_json(output / "seasons" / "2025" / f"{code}.json", season)
            write_json(output / "climatology" / f"{code}.json", climate)
            write_json(output / "history" / f"{code}.json", history)
            station_list.append({"code": code, "name": metadata["name"], "city": metadata["city"], "state": metadata["state"], "year": 2025})
        write_json(output / "stations.json", station_list)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workbook", type=Path, help="Path to the LIX summer XLSX workbook")
    parser.add_argument("--output", type=Path, default=Path("public/data"), help="Dashboard data directory (default: public/data)")
    args = parser.parse_args()
    if not args.workbook.exists():
        parser.error(f"Workbook not found: {args.workbook}")
    convert(args.workbook, args.output)
    print(f"Wrote dashboard JSON to {args.output}")


if __name__ == "__main__":
    main()
