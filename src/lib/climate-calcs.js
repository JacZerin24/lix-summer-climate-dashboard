const average = (values) => {
  const valid = values.filter((value) => Number.isFinite(value));
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
};

const maxWithDates = (rows, key) => {
  const valid = rows.filter((row) => Number.isFinite(row[key]));
  if (!valid.length) return { value: null, dates: [] };
  const value = Math.max(...valid.map((row) => row[key]));
  return { value, dates: valid.filter((row) => row[key] === value).map((row) => row.date) };
};

export function getRecordStatus(observed, record) {
  if (!Number.isFinite(observed) || !Number.isFinite(record)) return "none";
  if (observed > record) return "broken";
  if (observed === record) return "tied";
  return "none";
}

export function mergeClimateData(observations, climatology) {
  return observations.map((observation) => {
    const climate = climatology[observation.date.slice(5)] ?? {};
    return {
      ...observation,
      ...climate,
      highDeparture:
        Number.isFinite(observation.high) && Number.isFinite(climate.normalHigh)
          ? observation.high - climate.normalHigh
          : null,
      lowDeparture:
        Number.isFinite(observation.low) && Number.isFinite(climate.normalLow)
          ? observation.low - climate.normalLow
          : null,
      precipDeparture:
        Number.isFinite(observation.accumulatedPrecip) && Number.isFinite(climate.normalYtdPrecip)
          ? observation.accumulatedPrecip - climate.normalYtdPrecip
          : null,
      highRecordStatus: getRecordStatus(observation.high, climate.recordHigh),
      warmLowRecordStatus: getRecordStatus(observation.low, climate.recordWarmLow),
    };
  });
}

export function filterPeriod(rows, period) {
  if (period === "season") return rows;
  return rows.filter((row) => row.date.slice(5, 7) === period);
}

export function summarizePeriod(rows) {
  const hazardCounts = { "HT.Y": 0, "EH.A": 0, "EH.W": 0 };
  rows.forEach((row) => {
    (row.hazards ?? []).forEach((hazard) => {
      hazardCounts[hazard] = (hazardCounts[hazard] ?? 0) + 1;
    });
  });

  const hottest = maxWithDates(rows, "high");
  const warmestLow = maxWithDates(rows, "low");
  const maxHeatIndex = maxWithDates(rows, "maxHeatIndex");
  const observedHighAverage = average(rows.map((row) => row.high));
  const normalHighAverage = average(rows.map((row) => row.normalHigh));
  const observedLowAverage = average(rows.map((row) => row.low));
  const normalLowAverage = average(rows.map((row) => row.normalLow));
  const totalPrecip = rows.reduce(
    (sum, row) => sum + (Number.isFinite(row.precip) ? row.precip : 0),
    0,
  );

  return {
    dayCount: rows.length,
    hazardCounts,
    daysAtOrAbove99: rows.filter((row) => row.high >= 99).length,
    daysAtOrAbove100: rows.filter((row) => row.high >= 100).length,
    daysAboveNormal: rows.filter((row) => row.highDeparture > 0).length,
    nightsAtOrAbove80: rows.filter((row) => row.low >= 80).length,
    nightsAboveNormal: rows.filter((row) => row.lowDeparture > 0).length,
    hottest,
    warmestLow,
    maxHeatIndex,
    averageHeatIndex: average(rows.map((row) => row.maxHeatIndex)),
    observedHighAverage,
    normalHighAverage,
    highDeparture:
      Number.isFinite(observedHighAverage) && Number.isFinite(normalHighAverage)
        ? observedHighAverage - normalHighAverage
        : null,
    observedLowAverage,
    normalLowAverage,
    lowDeparture:
      Number.isFinite(observedLowAverage) && Number.isFinite(normalLowAverage)
        ? observedLowAverage - normalLowAverage
        : null,
    totalPrecip,
    highRecordsBroken: rows.filter((row) => row.highRecordStatus === "broken").length,
    highRecordsTied: rows.filter((row) => row.highRecordStatus === "tied").length,
    warmLowRecordsBroken: rows.filter((row) => row.warmLowRecordStatus === "broken").length,
    warmLowRecordsTied: rows.filter((row) => row.warmLowRecordStatus === "tied").length,
    endingAccumulatedPrecip: rows.at(-1)?.accumulatedPrecip ?? null,
    endingPrecipDeparture: rows.at(-1)?.precipDeparture ?? null,
  };
}
