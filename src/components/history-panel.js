import { escapeHtml } from "../lib/formatters.js";

function renderReferenceTable(table) {
  return `
    <article class="history-card">
      <h3>${escapeHtml(table.title)}</h3>
      ${table.updated ? `<p class="history-updated">Updated ${escapeHtml(table.updated)}</p>` : ""}
      <div class="history-table-wrap">
        <table>
          <thead>
            <tr>${table.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${table.rows.map((row) => `
              <tr>${row.map((value) => `<td>${escapeHtml(value ?? "—")}</td>`).join("")}</tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </article>
  `;
}

function renderPrecipList(items) {
  return items
    .filter((item) => item.amount !== "Top")
    .map((item) => `<li><strong>${escapeHtml(item.amount)}″</strong> — ${escapeHtml(item.date ?? "year unavailable")}</li>`)
    .join("");
}

function renderSource(history) {
  const source = history.source ?? {};
  const period = source.periodOfRecord ?? {};
  const periodText = period.start && period.end ? `${period.start} through ${period.end}` : "available period of record";
  return `
    <p class="source-note">
      Source: ${escapeHtml(source.agency ?? "NOAA/NCEI")}, ${escapeHtml(source.dataset ?? "Daily Summaries")},
      station ${escapeHtml(source.stationId ?? history.station ?? "")}; ${escapeHtml(periodText)}.
      Records are calculated through ${escapeHtml(source.recordThrough ?? "the latest completed year")}.
    </p>`;
}

export function renderHistoryPanel(history, period) {
  const month = period === "season" ? "06" : period;
  const precip = history.monthlyPrecipRecords[month];

  return `
    <section aria-labelledby="history-heading">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Official NOAA/NCEI station record</p>
          <h2 id="history-heading">Reference records</h2>
        </div>
      </div>
      ${renderSource(history)}
      ${period !== "season" && precip ? `
        <div class="precip-records">
          <article class="history-card">
            <h3>Highest monthly rainfall totals</h3>
            <ol>${renderPrecipList(precip.highest)}</ol>
          </article>
          <article class="history-card">
            <h3>Lowest monthly rainfall totals</h3>
            <ol>${renderPrecipList(precip.lowest)}</ol>
          </article>
        </div>` : ""}
      <div class="history-grid">
        ${history.referenceTables.map(renderReferenceTable).join("")}
      </div>
    </section>
  `;
}
