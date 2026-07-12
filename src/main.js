import "./styles.css";
import { renderDailyTable } from "./components/daily-table.js";
import { renderHistoryPanel } from "./components/history-panel.js";
import { renderMonthTabs } from "./components/month-tabs.js";
import { renderStationSelector } from "./components/station-selector.js";
import { renderSummaryCards } from "./components/summary-cards.js";
import { renderTrendChart } from "./components/trend-chart.js";
import { renderYearSelector } from "./components/year-selector.js";
import { filterPeriod, mergeClimateData, summarizePeriod } from "./lib/climate-calcs.js";
import {
  AVAILABLE_YEARS,
  DEFAULT_STATION,
  DEFAULT_YEAR,
  PERIODS,
  getDefaultPeriod,
} from "./lib/constants.js";
import { loadStationData, loadStations } from "./lib/data-loader.js";
import { escapeHtml, formatDate } from "./lib/formatters.js";

const app = document.querySelector("#app");
const params = new URLSearchParams(window.location.search);
const requestedYear = Number(params.get("year"));
const startingYear = AVAILABLE_YEARS.includes(requestedYear) ? requestedYear : DEFAULT_YEAR;
const state = {
  station: params.get("station") ?? DEFAULT_STATION,
  year: startingYear,
  period: params.get("period") ?? getDefaultPeriod(startingYear),
};

function updateUrl() {
  const next = new URL(window.location.href);
  next.searchParams.set("station", state.station);
  next.searchParams.set("year", String(state.year));
  next.searchParams.set("period", state.period);
  window.history.replaceState({}, "", next);
}

function attachEvents(stations) {
  document.querySelector("#station-select")?.addEventListener("change", async (event) => {
    state.station = event.target.value;
    updateUrl();
    await render(stations);
  });
  document.querySelector("#year-select")?.addEventListener("change", async (event) => {
    state.year = Number(event.target.value);
    state.period = getDefaultPeriod(state.year);
    updateUrl();
    await render(stations);
  });
  document.querySelectorAll("[data-period]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.period = button.dataset.period;
      updateUrl();
      await render(stations);
    });
  });
}

function renderDataStatus(season) {
  const dataThrough = season.dataThrough ? formatDate(season.dataThrough, { month: "long", day: "numeric", year: "numeric" }) : "No completed days yet";
  const updated = season.lastUpdated ? new Date(season.lastUpdated).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "Not yet updated";
  const label = season.provisional ? "Provisional live data" : "Completed historical season";
  return `
    <aside class="data-status" aria-label="Data status">
      <div><span>${escapeHtml(label)}</span><strong>Through ${escapeHtml(dataThrough)}</strong></div>
      <div><span>Last refreshed</span><strong>${escapeHtml(updated)}</strong></div>
    </aside>`;
}

async function render(stations) {
  app.innerHTML = '<main class="loading">Loading climate data…</main>';
  try {
    if (!stations.some((station) => station.code === state.station)) state.station = DEFAULT_STATION;
    if (!AVAILABLE_YEARS.includes(state.year)) state.year = DEFAULT_YEAR;
    if (!PERIODS.some((period) => period.value === state.period)) state.period = getDefaultPeriod(state.year);

    const stationMeta = stations.find((station) => station.code === state.station);
    const { season, climatology, history } = await loadStationData(state.station, state.year);
    const merged = mergeClimateData(season.observations ?? [], climatology.daily);
    const rows = filterPeriod(merged, state.period);
    const summary = summarizePeriod(rows);
    const periodLabel = PERIODS.find((period) => period.value === state.period)?.label ?? "Season";

    app.innerHTML = `
      <header class="site-header">
        <div class="header-inner">
          <div>
            <p class="eyebrow">WFO LIX climate statistics</p>
            <h1>Summer Climate Dashboard</h1>
            <p class="header-copy">
              Daily observations, normals, records, heat hazards, rainfall, and historical context for four regional climate stations.
            </p>
          </div>
          <div class="header-badge">Summer ${state.year}</div>
        </div>
      </header>
      <main id="dashboard" class="dashboard">
        <section class="controls-panel" aria-label="Dashboard controls">
          ${renderStationSelector(stations, state.station)}
          ${renderYearSelector(AVAILABLE_YEARS, state.year)}
          <div class="station-title">
            <p class="eyebrow">Selected station</p>
            <h2>${escapeHtml(stationMeta.code)} · ${escapeHtml(stationMeta.name)}</h2>
          </div>
          ${renderMonthTabs(state.period)}
        </section>
        ${renderDataStatus(season)}
        ${renderSummaryCards(summary)}
        ${renderTrendChart(rows)}
        ${renderDailyTable(rows, state.station, periodLabel, state.year)}
        ${renderHistoryPanel(history, state.period)}
        <footer>
          <p>
            ${state.year === 2026
              ? "2026 observations are updated automatically from IEM daily station summaries, with NWS heat-alert history retained by the scheduled updater. Values are provisional and may be corrected after official climate quality control."
              : "2025 values were converted from the supplied LIX summer climate workbook. Calculated summaries are generated in the browser from the daily data."}
          </p>
        </footer>
      </main>
    `;
    attachEvents(stations);
  } catch (error) {
    console.error(error);
    app.innerHTML = `
      <main class="error-panel">
        <h1>Climate data could not be loaded</h1>
        <p>${escapeHtml(error.message)}</p>
      </main>`;
  }
}

loadStations().then(render).catch((error) => {
  app.innerHTML = `<main class="error-panel"><h1>Unable to start dashboard</h1><p>${escapeHtml(error.message)}</p></main>`;
});
