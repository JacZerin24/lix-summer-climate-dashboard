import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultGraphicDate,
  defaultGraphicTitle,
  graphicGrid,
  stationGraphicModel,
} from "../src/lib/graphic-data.js";

const meta = { code: "KBTR", name: "Baton Rouge, LA", city: "Baton Rouge" };
const season = {
  provisional: false,
  dataThrough: "2024-09-30",
  observations: [
    {
      date: "2024-06-01",
      high: 95,
      low: 76,
      maxHeatIndex: 103,
      precip: 0.5,
      precipTrace: false,
      accumulatedPrecip: 20,
      hazards: ["HT.Y", "EH.W"],
    },
    {
      date: "2024-06-02",
      high: 100,
      low: 80,
      maxHeatIndex: 110,
      precip: 0,
      precipTrace: false,
      accumulatedPrecip: 20,
      hazards: [],
    },
  ],
};
const climatology = {
  daily: {
    "06-01": {
      normalHigh: 90,
      normalLow: 70,
      normalYtdPrecip: 18,
      recordHigh: 99,
      recordWarmLow: 80,
      recordPrecip: 0.4,
    },
    "06-02": {
      normalHigh: 91,
      normalLow: 71,
      normalYtdPrecip: 18.1,
      recordHigh: 101,
      recordWarmLow: 79,
      recordPrecip: 2,
    },
  },
};

test("graphic grid supports one, three, and four climate sites", () => {
  assert.equal(graphicGrid(1).length, 1);
  assert.equal(graphicGrid(3).length, 3);
  assert.equal(graphicGrid(4).length, 4);
  assert.equal(graphicGrid(3)[2].x, 532);
});

test("overview graphic replaces threshold cards with combined record cards and dates", () => {
  const model = stationGraphicModel(meta, season, climatology, {
    type: "overview",
    year: 2024,
    period: "06",
    date: "2024-06-01",
  });
  assert.equal(model.metrics.length, 6);
  assert.equal(model.metrics[0].id, "average-high");
  assert.equal(model.metrics[0].label, "Average high");
  assert.equal(model.metrics[0].value, "97.5°F");
  assert.equal(model.metrics[2].id, "period-rainfall");
  assert.equal(model.metrics[2].value, "0.50″");

  const temperatureRecords = model.metrics[4];
  assert.equal(temperatureRecords.id, "temperature-records");
  assert.equal(temperatureRecords.value, "1 / 0");
  assert.match(temperatureRecords.detail, /B: Jun 2/);
  assert.match(temperatureRecords.detail, /T: none/);

  const rainfallRecords = model.metrics[5];
  assert.equal(rainfallRecords.id, "rainfall-records");
  assert.equal(rainfallRecords.value, "1 / 0");
  assert.match(rainfallRecords.detail, /B: Jun 1/);
  assert.match(rainfallRecords.detail, /T: none/);
});

test("rainfall graphic lists record dates instead of generic record text", () => {
  const model = stationGraphicModel(meta, season, climatology, {
    type: "rain",
    year: 2024,
    period: "06",
    date: "2024-06-01",
  });
  const broken = model.metrics.find((item) => item.id === "rain-records-broken");
  const tied = model.metrics.find((item) => item.id === "rain-records-tied");
  assert.equal(broken.value, "1");
  assert.equal(broken.detail, "Jun 1");
  assert.equal(tied.value, "0");
  assert.equal(tied.detail, "none");
});

test("heat graphic retains 90 and 100 degree day counts", () => {
  const model = stationGraphicModel(meta, season, climatology, {
    type: "heat",
    year: 2024,
    period: "06",
    date: "2024-06-01",
  });
  assert.equal(model.metrics[2].id, "days-90");
  assert.equal(model.metrics[2].value, "2");
  assert.equal(model.metrics[3].id, "days-100");
  assert.equal(model.metrics[3].value, "1");
});

test("daily graphic normalizes legacy heat-product terminology", () => {
  const model = stationGraphicModel(meta, season, climatology, {
    type: "daily",
    year: 2024,
    period: "06",
    date: "2024-06-01",
  });
  const hazards = model.metrics.find((item) => item.label === "Heat products");
  assert.equal(hazards.id, "heat-products");
  assert.match(hazards.value, /Heat Advisory/);
  assert.match(hazards.value, /Extreme Heat Warning/);
});

test("graphic defaults use the selected year and period", () => {
  assert.equal(defaultGraphicTitle("rain", 2024, "07", "2024-07-01"), "Summer Rainfall Summary · July 2024");
  assert.equal(defaultGraphicDate(2024, new Date("2026-07-13T12:00:00Z")), "2024-09-30");
});
