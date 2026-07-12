#!/usr/bin/env python3
"""Probe RCC ACIS threaded-station identifiers and response schemas."""

from __future__ import annotations

import json
import urllib.request
from pathlib import Path

BASE = "https://data.rcc-acis.org"
CANDIDATES = {
    "KBTR": ["BTRthr", "KBTRthr", "BTR"],
    "KMSY": ["MSYthr", "KMSYthr", "MSY"],
    "KGPT": ["GPTthr", "KGPTthr", "GPT"],
    "KMCB": ["MCBthr", "KMCBthr", "MCB"],
}


def post(endpoint: str, payload: dict):
    request = urllib.request.Request(
        f"{BASE}/{endpoint}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "User-Agent": "lix-summer-climate-dashboard/2.0"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))


results = {}
for station, candidates in CANDIDATES.items():
    results[station] = {}
    for sid in candidates:
        item = {}
        try:
            item["meta"] = post(
                "StnMeta",
                {"sids": sid, "meta": ["name", "state", "sids", "valid_daterange", "ll"]},
            )
        except Exception as exc:
            item["meta_error"] = repr(exc)
        try:
            item["data"] = post(
                "StnData",
                {
                    "sid": sid,
                    "sdate": "2023-07-01",
                    "edate": "2023-07-03",
                    "elems": [
                        {"name": "maxt", "interval": "dly", "duration": 1},
                        {"name": "mint", "interval": "dly", "duration": 1},
                        {"name": "pcpn", "interval": "dly", "duration": 1},
                    ],
                    "meta": ["name", "state", "sids", "valid_daterange", "ll"],
                },
            )
        except Exception as exc:
            item["data_error"] = repr(exc)
        results[station][sid] = item

Path("acis-probe.json").write_text(json.dumps(results, indent=2) + "\n", encoding="utf-8")
print(json.dumps(results, indent=2))
