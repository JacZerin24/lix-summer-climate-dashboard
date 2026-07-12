import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mergeClimateData, summarizePeriod } from "../src/lib/climate-calcs.js";

const loadJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));

test("KBTR June reproduces the workbook summary", async () => {
  const season = await loadJson("../public/data/seasons/2025/KBTR.json");
  const climatology = await loadJson("../public/data/climatology/KBTR.json");
  const rows = mergeClimateData(season.observations, climatology.daily)
    .filter((row) => row.date.startsWith("2025-06"));
  const summary = summarizePeriod(rows);

  assert.equal(summary.dayCount, 30);
  assert.equal(summary.hazardCounts["HT.Y"], 3);
  assert.equal(summary.daysAboveNormal, 20);
  assert.equal(summary.hottest.value, 95);
  assert.equal(summary.warmestLow.value, 78);
  assert.equal(summary.highRecordsBroken, 0);
  assert.equal(summary.highRecordsTied, 0);
  assert.equal(summary.warmLowRecordsBroken, 0);
  assert.equal(summary.warmLowRecordsTied, 2);
  assert.ok(Math.abs(summary.observedHighAverage - 91.53333333) < 1e-6);
  assert.ok(Math.abs(summary.highDeparture - 1.03333333) < 1e-6);
  assert.ok(Math.abs(summary.observedLowAverage - 72.63333333) < 1e-6);
  assert.ok(Math.abs(summary.lowDeparture - 1.06666667) < 1e-6);
  assert.ok(Math.abs(summary.totalPrecip - 6.6) < 1e-9);
  assert.equal(summary.maxHeatIndex.value, 105);
});
