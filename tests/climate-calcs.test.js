import test from "node:test";
import assert from "node:assert/strict";
import { getRecordStatus, mergeClimateData, summarizePeriod } from "../src/lib/climate-calcs.js";

test("record comparisons distinguish ties and new records", () => {
  assert.equal(getRecordStatus(100, 99), "broken");
  assert.equal(getRecordStatus(99, 99), "tied");
  assert.equal(getRecordStatus(98, 99), "none");
  assert.equal(getRecordStatus(null, 99), "none");
});

test("summary calculations use merged official climatology fields", () => {
  const observations = [
    { date: "2026-06-01", high: 100, low: 80, precip: 0.5, accumulatedPrecip: 10.5, maxHeatIndex: 110, hazards: ["HT.Y"] },
    { date: "2026-06-02", high: 98, low: 78, precip: 0, accumulatedPrecip: 10.5, maxHeatIndex: 105, hazards: ["XH.W"] },
  ];
  const climatology = {
    "06-01": { normalHigh: 90, normalLow: 70, recordHigh: 100, recordWarmLow: 79, normalYtdPrecip: 10 },
    "06-02": { normalHigh: 91, normalLow: 71, recordHigh: 99, recordWarmLow: 78, normalYtdPrecip: 10.2 },
  };
  const rows = mergeClimateData(observations, climatology);
  const summary = summarizePeriod(rows);

  assert.equal(summary.dayCount, 2);
  assert.equal(summary.observedHighAverage, 99);
  assert.equal(summary.highDeparture, 8.5);
  assert.equal(summary.totalPrecip, 0.5);
  assert.equal(summary.highRecordsTied, 1);
  assert.equal(summary.warmLowRecordsBroken, 1);
  assert.equal(summary.warmLowRecordsTied, 1);
  assert.equal(summary.hazardCounts["HT.Y"], 1);
  assert.equal(summary.hazardCounts["XH.W"], 1);
});

test("legacy EH codes are normalized into current XH summary buckets", () => {
  const summary = summarizePeriod([{ date: "2025-07-01", hazards: ["EH.A", "EH.W"] }]);
  assert.equal(summary.hazardCounts["XH.A"], 1);
  assert.equal(summary.hazardCounts["XH.W"], 1);
});
