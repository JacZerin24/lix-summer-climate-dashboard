import "../graphic-builder.css";
import { AVAILABLE_YEARS, PERIODS } from "../lib/constants.js";
import { loadStationData } from "../lib/data-loader.js";
import { escapeHtml } from "../lib/formatters.js";
import {
  GRAPHIC_TYPES,
  defaultGraphicDate,
  defaultGraphicTitle,
  graphicGrid,
  graphicPeriodLabel,
  stationGraphicModel,
} from "../lib/graphic-data.js";

const WIDTH = 1920;
const HEIGHT = 1080;
const CENTRAL = "America/Chicago";

function optionMarkup(items, selected) {
  return items
    .map(
      (item) =>
        `<option value="${escapeHtml(item.value)}"${item.value === selected ? " selected" : ""}>${escapeHtml(item.label)}</option>`,
    )
    .join("");
}

function roundedRect(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}

function fitText(context, text, maxWidth, startSize, minimumSize = 15, weight = 700) {
  let size = startSize;
  do {
    context.font = `${weight} ${size}px Arial, sans-serif`;
    if (context.measureText(text).width <= maxWidth) return size;
    size -= 1;
  } while (size > minimumSize);
  return minimumSize;
}

function wrapLines(context, text, maxWidth, maximumLines = 2) {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
    } else if (lines.length < maximumLines - 1) {
      lines.push(line);
      line = word;
    } else {
      line = `${line} ${word}`;
    }
  });
  if (line) lines.push(line);
  if (lines.length > maximumLines) lines.length = maximumLines;
  const last = lines.length - 1;
  if (last >= 0 && context.measureText(lines[last]).width > maxWidth) {
    let shortened = lines[last];
    while (shortened.length > 1 && context.measureText(`${shortened}…`).width > maxWidth) {
      shortened = shortened.slice(0, -1);
    }
    lines[last] = `${shortened.trim()}…`;
  }
  return lines;
}

function drawNwsBadge(context, x, y) {
  context.save();
  context.beginPath();
  context.arc(x, y, 38, 0, Math.PI * 2);
  context.fillStyle = "#ffffff";
  context.fill();
  context.lineWidth = 4;
  context.strokeStyle = "#d71920";
  context.stroke();

  context.beginPath();
  context.arc(x, y, 28, 0, Math.PI * 2);
  context.fillStyle = "#1261a0";
  context.fill();

  context.fillStyle = "#ffffff";
  context.font = "900 17px Arial, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("NWS", x, y - 2);

  context.fillStyle = "#d71920";
  context.beginPath();
  context.moveTo(x - 6, y + 5);
  context.lineTo(x + 2, y + 5);
  context.lineTo(x - 3, y + 18);
  context.lineTo(x + 12, y);
  context.lineTo(x + 4, y);
  context.lineTo(x + 9, y - 12);
  context.closePath();
  context.fill();
  context.restore();
}

function centralTimestamp(value = new Date()) {
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: CENTRAL,
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(value);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: CENTRAL,
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
  return { date, time };
}

function drawFrame(context, title, subtitle, generatedAt) {
  context.clearRect(0, 0, WIDTH, HEIGHT);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, WIDTH, HEIGHT);

  context.fillStyle = "#252525";
  context.fillRect(0, 0, WIDTH, 105);
  context.shadowColor = "rgba(0, 0, 0, 0.28)";
  context.shadowBlur = 10;
  context.fillStyle = "#d71920";
  context.fillRect(0, 105, WIDTH, 12);
  context.shadowBlur = 0;

  context.fillStyle = "#ffffff";
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  fitText(context, title, 1750, 48, 30, 800);
  context.fillText(title, 72, 62);
  context.fillStyle = "#d7d7d7";
  fitText(context, subtitle, 1750, 22, 16, 500);
  context.fillText(subtitle, 74, 92);

  context.shadowColor = "rgba(0, 0, 0, 0.28)";
  context.shadowBlur = 10;
  context.fillStyle = "#d71920";
  context.fillRect(0, 970, WIDTH, 12);
  context.shadowBlur = 0;
  context.fillStyle = "#252525";
  context.fillRect(0, 982, WIDTH, 98);

  drawNwsBadge(context, 84, 1031);
  context.fillStyle = "#ffffff";
  context.textAlign = "left";
  context.font = "400 31px Arial, sans-serif";
  context.fillText("New Orleans/Baton Rouge", 145, 1023);
  context.font = "800 24px Arial, sans-serif";
  context.fillText("Follow:", 145, 1059);
  context.font = "400 25px Arial, sans-serif";
  context.fillStyle = "#b5d2e8";
  context.fillText("𝕏  f  @NWSNewOrleans", 245, 1059);

  const timestamp = centralTimestamp(generatedAt);
  context.textAlign = "right";
  context.fillStyle = "#ffffff";
  context.font = "800 29px Arial, sans-serif";
  context.fillText(timestamp.date, 1885, 1026);
  context.font = "800 28px Arial, sans-serif";
  context.fillText(timestamp.time, 1885, 1062);
}

function drawMetric(context, metric, x, y, width, height, compact) {
  context.fillStyle = "#607086";
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.font = `800 ${compact ? 15 : 20}px Arial, sans-serif`;
  context.fillText(metric.label.toUpperCase(), x, y + (compact ? 24 : 30));

  const valueSize = compact ? 30 : 43;
  const adjusted = fitText(context, metric.value, width, valueSize, compact ? 19 : 25, 850);
  context.fillStyle = "#112f4f";
  context.font = `850 ${adjusted}px Arial, sans-serif`;
  const valueLines = wrapLines(context, metric.value, width, 2);
  const valueStart = y + (compact ? 60 : 82);
  valueLines.forEach((line, index) => context.fillText(line, x, valueStart + index * (adjusted + 4)));

  if (metric.detail) {
    context.fillStyle = "#607086";
    context.font = `500 ${compact ? 15 : 18}px Arial, sans-serif`;
    const detailLines = wrapLines(context, metric.detail, width, 2);
    const detailY = Math.min(y + height - 12, valueStart + valueLines.length * (adjusted + 4) + 13);
    detailLines.forEach((line, index) => context.fillText(line, x, detailY + index * (compact ? 18 : 21)));
  }
}

function drawStationCard(context, station, slot, count) {
  const compact = count >= 3;
  context.save();
  context.shadowColor = "rgba(17, 47, 79, 0.17)";
  context.shadowBlur = 18;
  context.shadowOffsetY = 6;
  roundedRect(context, slot.x, slot.y, slot.width, slot.height, 20);
  context.fillStyle = "#ffffff";
  context.fill();
  context.shadowColor = "transparent";
  context.lineWidth = 2;
  context.strokeStyle = "#ced9e3";
  context.stroke();

  const headerHeight = compact ? 58 : 72;
  roundedRect(context, slot.x, slot.y, slot.width, headerHeight, 20);
  context.fillStyle = "#112f4f";
  context.fill();
  context.fillRect(slot.x, slot.y + headerHeight - 20, slot.width, 20);

  context.textBaseline = "alphabetic";
  context.fillStyle = "#ffffff";
  context.textAlign = "left";
  context.font = `800 ${compact ? 25 : 31}px Arial, sans-serif`;
  context.fillText(station.name, slot.x + 28, slot.y + (compact ? 39 : 47));
  context.textAlign = "right";
  context.fillStyle = "#bfe4f8";
  context.font = `800 ${compact ? 19 : 23}px Arial, sans-serif`;
  context.fillText(station.code, slot.x + slot.width - 28, slot.y + (compact ? 38 : 46));

  const bodyTop = slot.y + headerHeight;
  const paddingX = compact ? 24 : 34;
  const columns = 3;
  const rows = 2;
  const innerWidth = slot.width - paddingX * 2;
  const innerHeight = slot.height - headerHeight - (compact ? 20 : 30);
  const cellWidth = innerWidth / columns;
  const cellHeight = innerHeight / rows;

  context.strokeStyle = "#e1e8ee";
  context.lineWidth = 1.5;
  for (let column = 1; column < columns; column += 1) {
    const dividerX = slot.x + paddingX + cellWidth * column;
    context.beginPath();
    context.moveTo(dividerX, bodyTop + 16);
    context.lineTo(dividerX, slot.y + slot.height - 16);
    context.stroke();
  }
  const dividerY = bodyTop + cellHeight;
  context.beginPath();
  context.moveTo(slot.x + 18, dividerY);
  context.lineTo(slot.x + slot.width - 18, dividerY);
  context.stroke();

  station.metrics.slice(0, 6).forEach((metric, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    drawMetric(
      context,
      metric,
      slot.x + paddingX + column * cellWidth + 10,
      bodyTop + row * cellHeight + 5,
      cellWidth - 24,
      cellHeight - 8,
      compact,
    );
  });
  context.restore();
}

function renderCanvas(canvas, model) {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser does not support canvas graphics.");
  const throughDates = model.stations.map((station) => station.dataThrough).filter(Boolean).sort();
  const through = throughDates[0] ?? "No completed data";
  const siteText =
    model.stations.length === 4
      ? "All four climate sites"
      : model.stations.map((station) => station.city).join(" · ");
  const status = model.stations.some((station) => station.provisional) ? "Provisional" : "Final";
  const subtitle = `${siteText} · ${status} data through ${through}`;
  drawFrame(context, model.title, subtitle, model.generatedAt);

  const slots = graphicGrid(model.stations.length);
  model.stations.forEach((station, index) => drawStationCard(context, station, slots[index], model.stations.length));

  context.fillStyle = "#5d6c7c";
  context.textAlign = "center";
  context.font = "500 18px Arial, sans-serif";
  context.fillText(
    "Sources: NOAA/NCEI Daily Summaries and 1991–2020 normals · RCC ACIS climate records · NWS/IEM heat-product archive",
    WIDTH / 2,
    936,
  );
}

function downloadCanvas(canvas, title) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "lix-climate-graphic"}.png`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, "image/png");
}

export function openGraphicBuilder({ stations, currentState }) {
  document.querySelector(".graphic-builder-backdrop")?.remove();
  const startingDate = defaultGraphicDate(currentState.year);
  const backdrop = document.createElement("div");
  backdrop.className = "graphic-builder-backdrop";
  backdrop.innerHTML = `
    <section class="graphic-builder-dialog" role="dialog" aria-modal="true" aria-labelledby="graphic-builder-title">
      <header class="graphic-builder-dialog-header">
        <div>
          <p class="eyebrow">Export a 1920 × 1080 PNG</p>
          <h2 id="graphic-builder-title">Climate Graphic Builder</h2>
          <p>Choose the content and any combination of climate sites. The preview uses the standard LIX header and footer.</p>
        </div>
        <button type="button" class="graphic-builder-close" aria-label="Close graphic builder">×</button>
      </header>
      <div class="graphic-builder-layout">
        <div class="graphic-builder-controls">
          <label>
            Graphic type
            <select data-graphic-type>${optionMarkup(GRAPHIC_TYPES, "overview")}</select>
          </label>
          <div class="graphic-builder-two-column">
            <label>
              Year
              <select data-graphic-year>
                ${AVAILABLE_YEARS.map((year) => `<option value="${year}"${year === currentState.year ? " selected" : ""}>${year}</option>`).join("")}
              </select>
            </label>
            <label data-period-control>
              Period
              <select data-graphic-period>${optionMarkup(PERIODS, currentState.period)}</select>
            </label>
            <label data-date-control hidden>
              Date
              <input data-graphic-date type="date" value="${startingDate}" min="${currentState.year}-06-01" max="${currentState.year}-09-30">
            </label>
          </div>
          <label>
            Custom title <span>(optional)</span>
            <input data-graphic-title type="text" maxlength="72" placeholder="An automatic title will be used">
          </label>
          <fieldset class="graphic-site-picker">
            <legend>Climate sites</legend>
            <div class="graphic-site-actions">
              <button type="button" data-select-all-sites>Select all</button>
              <button type="button" data-select-current-site>Current site only</button>
            </div>
            ${stations
              .map(
                (station) => `
                  <label>
                    <input type="checkbox" name="graphic-station" value="${escapeHtml(station.code)}"${station.code === currentState.station ? " checked" : ""}>
                    <span><strong>${escapeHtml(station.code)}</strong>${escapeHtml(station.name)}</span>
                  </label>`,
              )
              .join("")}
          </fieldset>
          <p class="graphic-builder-status" role="status" aria-live="polite" data-graphic-status>Preparing preview…</p>
          <div class="graphic-builder-buttons">
            <button type="button" class="graphic-preview-button" data-generate-graphic>Refresh preview</button>
            <button type="button" class="graphic-download-button" data-download-graphic disabled>Download PNG</button>
          </div>
        </div>
        <div class="graphic-preview-panel">
          <canvas data-graphic-canvas width="${WIDTH}" height="${HEIGHT}" aria-label="Climate graphic preview"></canvas>
        </div>
      </div>
    </section>`;

  document.body.append(backdrop);
  document.body.classList.add("graphic-builder-open");

  const dialog = backdrop.querySelector(".graphic-builder-dialog");
  const typeSelect = backdrop.querySelector("[data-graphic-type]");
  const yearSelect = backdrop.querySelector("[data-graphic-year]");
  const periodSelect = backdrop.querySelector("[data-graphic-period]");
  const dateInput = backdrop.querySelector("[data-graphic-date]");
  const periodControl = backdrop.querySelector("[data-period-control]");
  const dateControl = backdrop.querySelector("[data-date-control]");
  const titleInput = backdrop.querySelector("[data-graphic-title]");
  const status = backdrop.querySelector("[data-graphic-status]");
  const canvas = backdrop.querySelector("[data-graphic-canvas]");
  const downloadButton = backdrop.querySelector("[data-download-graphic]");
  let generatedTitle = "lix-climate-graphic";
  let keyHandler;

  function close() {
    document.body.classList.remove("graphic-builder-open");
    if (keyHandler) document.removeEventListener("keydown", keyHandler);
    backdrop.remove();
  }

  function selectedStationCodes() {
    return [...backdrop.querySelectorAll('input[name="graphic-station"]:checked')].map((input) => input.value);
  }

  function updateModeControls() {
    const daily = typeSelect.value === "daily";
    periodControl.hidden = daily;
    dateControl.hidden = !daily;
  }

  function updateDateBounds() {
    const year = Number(yearSelect.value);
    dateInput.min = `${year}-06-01`;
    dateInput.max = `${year}-09-30`;
    dateInput.value = defaultGraphicDate(year);
  }

  async function generate() {
    const codes = selectedStationCodes();
    if (!codes.length) {
      status.textContent = "Select at least one climate site.";
      downloadButton.disabled = true;
      return;
    }
    status.textContent = "Loading official climate data and drawing the graphic…";
    downloadButton.disabled = true;
    const options = {
      type: typeSelect.value,
      year: Number(yearSelect.value),
      period: periodSelect.value,
      date: dateInput.value,
    };
    try {
      const selected = stations.filter((station) => codes.includes(station.code));
      const loaded = await Promise.all(
        selected.map(async (station) => {
          const { season, climatology } = await loadStationData(station.code, options.year);
          return stationGraphicModel(station, season, climatology, options);
        }),
      );
      generatedTitle =
        titleInput.value.trim() ||
        defaultGraphicTitle(options.type, options.year, options.period, options.date);
      renderCanvas(canvas, {
        title: generatedTitle,
        stations: loaded,
        generatedAt: new Date(),
      });
      const periodText =
        options.type === "daily"
          ? options.date
          : `${graphicPeriodLabel(options.period)} ${options.year}`;
      status.textContent = `Preview ready for ${loaded.length} site${loaded.length === 1 ? "" : "s"} · ${periodText}.`;
      downloadButton.disabled = false;
    } catch (error) {
      console.error(error);
      status.textContent = `Graphic could not be generated: ${error.message}`;
    }
  }

  backdrop.querySelector(".graphic-builder-close").addEventListener("click", close);
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) close();
  });
  dialog.addEventListener("click", (event) => event.stopPropagation());
  backdrop.querySelector("[data-select-all-sites]").addEventListener("click", () => {
    backdrop.querySelectorAll('input[name="graphic-station"]').forEach((input) => {
      input.checked = true;
    });
  });
  backdrop.querySelector("[data-select-current-site]").addEventListener("click", () => {
    backdrop.querySelectorAll('input[name="graphic-station"]').forEach((input) => {
      input.checked = input.value === currentState.station;
    });
  });
  typeSelect.addEventListener("change", updateModeControls);
  yearSelect.addEventListener("change", updateDateBounds);
  backdrop.querySelector("[data-generate-graphic]").addEventListener("click", generate);
  downloadButton.addEventListener("click", () => downloadCanvas(canvas, generatedTitle));

  keyHandler = (event) => {
    if (event.key === "Escape" && document.body.contains(backdrop)) close();
  };
  document.addEventListener("keydown", keyHandler);
  backdrop.querySelector(".graphic-builder-close").focus();
  updateModeControls();
  generate();
}
