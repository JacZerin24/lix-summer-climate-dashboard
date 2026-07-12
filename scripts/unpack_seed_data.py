#!/usr/bin/env python3
"""Expand workbook-derived JSON from the compact repository seed archive."""

from __future__ import annotations

import base64
import io
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SEED = ROOT / "data" / "seed"
PREFIXES = (
    "public/data/climatology/",
    "public/data/history/",
    "public/data/seasons/2025/",
)


def main() -> None:
    encoded = b"".join(path.read_bytes() for path in sorted(SEED.glob("part-*")))
    archive_bytes = base64.b64decode(encoded)
    with tarfile.open(fileobj=io.BytesIO(archive_bytes), mode="r:gz") as archive:
        for member in archive.getmembers():
            name = member.name.removeprefix("./")
            if not member.isfile() or not name.startswith(PREFIXES):
                continue
            source = archive.extractfile(member)
            if source is None:
                continue
            target = ROOT / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(source.read())
    print("Workbook-derived climate baseline is ready.")


if __name__ == "__main__":
    main()
