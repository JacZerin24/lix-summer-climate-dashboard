import { filterPeriod, mergeClimateData, summarizePeriod } from "./climate-calcs.js";
import { HAZARD_LABELS, PERIODS } from "./constants.js";

export const GRAPHIC_TYPES = [
  { value: "overview", label: "Period overview" },
  { value: "heat", label: "Heat summary" },
  { value: "rain", label: "Rainfall summary" },
  { value: "daily", label: "Daily snapshot" },
];

function number(value, digits = 0) {
  return Number.isFinite(value) ? Number(value).toFixed(digits) : "—";
}

function temperature(value, digits = 0) {
  return Number.isFinite(value) ? `${Number(value).toFixed(digits)}°F` : "—";
}

function precipitation(value) {
  return Number.isFinite(value) ? `${Number(value).toFixed(2)}″` : "—";
}

function departure(value, digits = 1, suffix = "°F") {
  if (!Number.isFinite(value)) return "—";
  const rounded = Number(value).toFixed(digits);
  return `${value > 0 ? "+" : ""}${rounded}${suffix}`;
}

function dateLabel(value) {
  if (!value) return "—";
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function dateList(values = []) {
  return values.length ? values.map(dateLabel).join(", ") : "—";
}

function metric(label, value, detail = "") {
  return { label, value, detail };
}

function wettestDay(rows) {
  const valid = rows.filter((row) => Number.isFinite(row.precip));
  if (!valid.length) return { value: null, dates: [] };
  const value = Math.max(...valid.map((row) => row.precip));
  return {
    value,
    dates: valid.filter((row) => row.precip === value).map((row) => row.date),
  };
}

function normalizedHazards(hazards = []) {
  return hazards.map((hazard) => {
    if (hazard === "EH.A") return "XH.A";
    if (hazard === "EH.W") return "XH.W";
    return hazard;
  });
}

function overviewMetrics(rows, summary) {
  return [
    metric(
      "Average high",
      temperature(summary.observedHighAverage, 1),
      `Normal ${temperature(summary.normalHighAverage, 1)} · ${departure(summary.highDeparture)}`,
    ),
    metric(
      "Average low",
      temperature(summary.observedLowAverage, 1),
      `Normal ${temperature(summary.normalLowAverage, 1)} · ${departure(summary.lowDeparture)}`,
    ),
    metric("Period rainfall", precipitation(summary.totalPrecip), `${summary.dayCount} completed days`),
    metric("Hottest high", temperature(summary.hottest.value), dateList(summary.hottest.dates)),
    metric("90° days", String(summary.daysAtOrAbove90), "High at or above 90°F"),
    metric("100° days", String(summary.daysAtOrAbove100), "High at or above 100°F"),
  ];
}

function heatMetrics(summary) {
  return [
    metric("Hottest high", temperature(summary.hottest.value), dateList(summary.hottest.dates)),
    metric("Maximum heat index", temperature(summary.maxHeatIndex.value), dateList(summary.maxHeatIndex.dates)),
    metric("90° days", String(summary.daysAtOrAbove90), "High at or above 90°F"),
    metric("100° days", String(summary.daysAtOrAbove100), "High at or above 100°F"),
    metric("Heat Advisory days", String(summary.hazardCounts["HT.Y"] ?? 0), "Product-days"),
    metric(
      "Watch / Warning days",
      `${summary.hazardCounts["XH.A"] ?? 0} / ${summary.hazardCounts["XH.W"] ?? 0}`,
      "Extreme Heat Watch / Warning",
    ),
  ];
}

function rainfallMetrics(rows, summary) {
  const wettest = wettestDay(rows);
  const rainDays = rows.filter(
    (row) => row.precipTrace || (Number.isFinite(row.precip) && row.precip > 0),
  ).length;
  return [
    metric("Period rainfall", precipitation(summary.totalPrecip), `${rainDays} day${rainDays === 1 ? "" : "s"} with rain`),
    metric("YTD rainfall", precipitation(summary.endingAccumulatedPrecip), "At the end of the selected period"),
    metric("YTD departure", departure(summary.endingPrecipDeparture, 2, "″"), "Compared with 1991–2020 normal"),
    metric("Wettest day", precipitation(wettest.value), dateList(wettest.dates)),
    metric("Daily records broken", String(summary.precipRecordsBroken), "Rainfall records"),
    metric("Daily records tied", String(summary.precipRecordsTied), "Rainfall records"),
  ];
}

function dailyMetrics(row) {
  if (!row) {
    return [
      metric("High", "—", "No completed observation"),
      metric("Low", "—", "No completed observation"),
      metric("Maximum heat index", "—"),
      metric("Rainfall", "—"),
      metric("YTD rainfall", "—"),
      metric("Heat products", "None"),
    ];
  }
  const hazards = normalizedHazards(row.hazards)
    .map((hazard) => HAZARD_LABELS[hazard] ?? hazard)
    .join(" · ");
  return [
    metric("High", temperature(row.high), `Departure ${departure(row.highDeparture)}`),
    metric("Low", temperature(row.low), `Departure ${departure(row.lowDeparture)}`),
    metric("Maximum heat index", temperature(row.maxHeatIndex), ""),
    metric("Rainfall", row.precipTrace ? "Trace" : precipitation(row.precip), ""),
    metric("YTD rainfall", precipitation(row.accumulatedPrecip), `Departure ${departure(row.precipDeparture, 2, "″")}`),
    metric("Heat products", hazards || "None", ""),
  ];
}

export function graphicPeriodLabel(period) {
  return PERIODS.find((item) => item.value === period)?.label ?? "Season";
}

export function defaultGraphicTitle(type, year, period, date) {
  if (type === "daily") return `Climate Snapshot · ${dateLabel(date)}, ${year}`;
  const label = graphicPeriodLabel(period);
  const titles = {
    overview: "Summer Climate Overview",
    heat: "Summer Heat Summary",
    rain: "Summer Rainfall Summary",
  };
  return `${titles[type] ?? "Summer Climate Summary"} · ${label} ${year}`;
}

export function defaultGraphicDate(year, now = new Date()) {
  const start = `${year}-06-01`;
  const end = `${year}-09-30`;
  if (year < now.getFullYear()) return end;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const iso = yesterday.toISOString().slice(0, 10);
  if (iso < start) return start;
  if (iso > end) return end;
  return iso;
}

export function stationGraphicModel(meta, season, climatology, options) {
  const merged = mergeClimateData(season.observations ?? [], climatology.daily ?? {});
  const rows =
    options.type === "daily"
      ? merged.filter((row) => row.date === options.date)
      : filterPeriod(merged, options.period);
  const summary = summarizePeriod(rows, merged);
  let metrics;
  if (options.type === "heat") metrics = heatMetrics(summary);
  else if (options.type === "rain") metrics = rainfallMetrics(rows, summary);
  else if (options.type === "daily") metrics = dailyMetrics(rows[0]);
  else metrics = overviewMetrics(rows, summary);
  return {
    code: meta.code,
    name: meta.name,
    city: meta.city,
    dataThrough: season.dataThrough,
    provisional: Boolean(season.provisional),
    metrics,
  };
}

export function graphicGrid(count) {
  const safeCount = Math.max(1, Math.min(4, Number(count) || 1));
  if (safeCount === 1) {
    return [{ x: 120, y: 220, width: 1680, height: 610 }];
  }
  if (safeCount === 2) {
    return [
      { x: 85, y: 225, width: 855, height: 610 },
      { x: 980, y: 225, width: 855, height: 610 },
    ];
  }
  const slots = [
    { x: 85, y: 180, width: 855, height: 330 },
    { x: 980, y: 180, width: 855, height: 330 },
    { x: 85, y: 545, width: 855, height: 330 },
    { x: 980, y: 545, width: 855, height: 330 },
  ];
  if (safeCount === 3) {
    slots[2] = { x: 532, y: 545, width: 855, height: 330 };
  }
  return slots.slice(0, safeCount);
}
