import { formatDate, formatNumber } from "../lib/formatters.js";

const WIDTH = 960;
const HEIGHT = 300;
const PADDING = { top: 24, right: 24, bottom: 42, left: 48 };

function points(rows, key, min, max) {
  const usableWidth = WIDTH - PADDING.left - PADDING.right;
  const usableHeight = HEIGHT - PADDING.top - PADDING.bottom;
  return rows
    .map((row, index) => {
      const value = row[key];
      if (!Number.isFinite(value)) return null;
      const x = PADDING.left + (index / Math.max(rows.length - 1, 1)) * usableWidth;
      const y = PADDING.top + ((max - value) / Math.max(max - min, 1)) * usableHeight;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .filter(Boolean)
    .join(" ");
}

export function renderTrendChart(rows) {
  const values = rows.flatMap((row) => [row.high, row.normalHigh, row.low, row.normalLow]).filter(Number.isFinite);
  if (!values.length) return "";

  const min = Math.floor(Math.min(...values) / 5) * 5 - 5;
  const max = Math.ceil(Math.max(...values) / 5) * 5 + 5;
  const ticks = Array.from({ length: 5 }, (_, index) => min + ((max - min) * index) / 4).reverse();
  const start = rows[0]?.date;
  const middle = rows[Math.floor(rows.length / 2)]?.date;
  const end = rows.at(-1)?.date;

  return `
    <section class="chart-panel" aria-labelledby="trend-heading">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Daily comparison</p>
          <h2 id="trend-heading">Observed temperatures versus normals</h2>
        </div>
      </div>
      <div class="chart-scroll">
        <svg viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="Line chart of observed and normal high and low temperatures">
          ${ticks.map((tick) => {
            const y = PADDING.top + ((max - tick) / (max - min)) * (HEIGHT - PADDING.top - PADDING.bottom);
            return `
              <line class="grid-line" x1="${PADDING.left}" y1="${y}" x2="${WIDTH - PADDING.right}" y2="${y}" />
              <text class="axis-label" x="${PADDING.left - 10}" y="${y + 4}" text-anchor="end">${formatNumber(tick, 0)}°</text>`;
          }).join("")}
          <polyline class="chart-line high" points="${points(rows, "high", min, max)}" />
          <polyline class="chart-line normal-high" points="${points(rows, "normalHigh", min, max)}" />
          <polyline class="chart-line low" points="${points(rows, "low", min, max)}" />
          <polyline class="chart-line normal-low" points="${points(rows, "normalLow", min, max)}" />
          <text class="axis-label" x="${PADDING.left}" y="${HEIGHT - 12}">${formatDate(start)}</text>
          <text class="axis-label" x="${WIDTH / 2}" y="${HEIGHT - 12}" text-anchor="middle">${formatDate(middle)}</text>
          <text class="axis-label" x="${WIDTH - PADDING.right}" y="${HEIGHT - 12}" text-anchor="end">${formatDate(end)}</text>
        </svg>
      </div>
      <div class="chart-legend" aria-hidden="true">
        <span><i class="legend-swatch high"></i>Observed high</span>
        <span><i class="legend-swatch normal-high"></i>Normal high</span>
        <span><i class="legend-swatch low"></i>Observed low</span>
        <span><i class="legend-swatch normal-low"></i>Normal low</span>
      </div>
    </section>
  `;
}
