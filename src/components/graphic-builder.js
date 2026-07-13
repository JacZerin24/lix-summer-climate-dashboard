import "../graphic-builder.css";
import "../graphic-builder-fonts.css";
import nwsLogoUrl from "../assets/nws-logo.svg";
import { AVAILABLE_YEARS, PERIODS } from "../lib/constants.js";
import { loadStationData } from "../lib/data-loader.js";
import { escapeHtml } from "../lib/formatters.js";
import {
  GRAPHIC_TYPES,
  defaultGraphicDate,
  defaultGraphicTitle,
  graphicPeriodLabel,
  stationGraphicModel,
} from "../lib/graphic-data.js";

const WIDTH = 1920;
const HEIGHT = 1080;
const CENTRAL = "America/Chicago";
const FONT_FAMILY = '"Manrope", Arial, sans-serif';
let logoPromise;

function font(weight, size) {
  return `${weight} ${size}px ${FONT_FAMILY}`;
}

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
    context.font = font(weight, size);
    if (context.measureText(text).width <= maxWidth) return size;
    size -= 1;
  } while (size > minimumSize);
  context.font = font(weight, minimumSize);
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

function loadLogo() {
  if (!logoPromise) {
    logoPromise = new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("The official NWS logo could not be loaded."));
      image.src = nwsLogoUrl;
    });
  }
  return logoPromise;
}

async function loadGraphicAssets() {
  const fontLoads = [];
  if (document.fonts?.load) {
    [400, 500, 600, 700, 800].forEach((weight) => {
      fontLoads.push(document.fonts.load(`${weight} 24px "Manrope"`));
    });
  }
  await Promise.all(fontLoads);
  return { logo: await loadLogo() };
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

function drawFrame(context, title, subtitle, generatedAt, logo) {
  context.clearRect(0, 0, WIDTH, HEIGHT);
  context.fillStyle = "#f4f7fa";
  context.fillRect(0, 0, WIDTH, HEIGHT);

  context.fillStyle = "#252525";
  context.fillRect(0, 0, WIDTH, 118);
  context.shadowColor = "rgba(0, 0, 0, 0.28)";
  context.shadowBlur = 10;
  context.fillStyle = "#d71920";
  context.fillRect(0, 118, WIDTH, 12);
  context.shadowBlur = 0;

  context.fillStyle = "#ffffff";
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  const titleSize = fitText(context, title, 1760, 48, 30, 800);
  context.font = font(800, titleSize);
  context.fillText(title, 72, 65);
  context.fillStyle = "#d7d7d7";
  const subtitleSize = fitText(context, subtitle, 1760, 22, 16, 600);
  context.font = font(600, subtitleSize);
  context.fillText(subtitle, 74, 98);

  context.shadowColor = "rgba(0, 0, 0, 0.28)";
  context.shadowBlur = 10;
  context.fillStyle = "#d71920";
  context.fillRect(0, 970, WIDTH, 12);
  context.shadowBlur = 0;
  context.fillStyle = "#252525";
  context.fillRect(0, 982, WIDTH, 98);

  context.drawImage(logo, 42, 994, 74, 74);
  context.fillStyle = "#ffffff";
  context.textAlign = "left";
  context.font = font(500, 29);
  context.fillText("New Orleans/Baton Rouge", 140, 1023);
  context.font = font(800, 22);
  context.fillText("FOLLOW", 140, 1058);
  context.font = font(500, 24);
  context.fillStyle = "#b5d2e8";
  context.fillText("𝕏  f  @NWSNewOrleans", 240, 1058);

  const timestamp = centralTimestamp(generatedAt);
  context.textAlign = "right";
  context.fillStyle = "#ffffff";
  context.font = font(800, 27);
  context.fillText(timestamp.date, 1885, 1025);
  context.font = font(700, 25);
  context.fillText(timestamp.time, 1885, 1060);
}

function graphicSlots(count) {
  const safeCount = Math.max(1, Math.min(4, Number(count) || 1));
  if (safeCount === 1) {
    return [{ x: 80, y: 164, width: 1760, height: 712 }];
  }
  if (safeCount === 2) {
    return [
      { x: 55, y: 164, width: 890, height: 712 },
      { x: 975, y: 164, width: 890, height: 712 },
    ];
  }
  const slots = [
    { x: 55, y: 150, width: 890, height: 350 },
    { x: 975, y: 150, width: 890, height: 350 },
    { x: 55, y: 526, width: 890, height: 350 },
    { x: 975, y: 526, width: 890, height: 350 },
  ];
  if (safeCount === 3) slots[2] = { x: 515, y: 526, width: 890, height: 350 };
  return slots.slice(0, safeCount);
}

function drawMetricTile(context, metric, x, y, width, height, density) {
  const compact = density === "compact";
  const spacious = density === "spacious";
  roundedRect(context, x, y, width, height, compact ? 13 : 16);
  context.fillStyle = "#f7fafc";
  context.fill();
  context.lineWidth = 1.5;
  context.strokeStyle = "#dce5ec";
  context.stroke();

  const paddingX = compact ? 17 : spacious ? 28 : 22;
  const labelSize = compact ? 13 : spacious ? 18 : 16;
  const valueSize = compact ? 28 : spacious ? 43 : 36;
  const detailSize = compact ? 13 : spacious ? 17 : 15;
  const maxTextWidth = width - paddingX * 2;

  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.fillStyle = "#607086";
  context.font = font(800, labelSize);
  context.fillText(metric.label.toUpperCase(), x + paddingX, y + (compact ? 27 : 34));

  const adjusted = fitText(context, metric.value, maxTextWidth, valueSize, compact ? 18 : 23, 800);
  context.font = font(800, adjusted);
  const valueLines = wrapLines(context, metric.value, maxTextWidth, 2);
  const valueStart = y + (compact ? 62 : spacious ? 85 : 76);
  context.fillStyle = "#112f4f";
  valueLines.forEach((line, index) => {
    context.fillText(line, x + paddingX, valueStart + index * (adjusted + 3));
  });

  if (metric.detail) {
    context.fillStyle = "#607086";
    context.font = font(500, detailSize);
    const detailLines = wrapLines(context, metric.detail, maxTextWidth, compact ? 1 : 2);
    const detailLineHeight = compact ? 16 : detailSize + 4;
    const detailStart = y + height - (detailLines.length - 1) * detailLineHeight - (compact ? 15 : 20);
    detailLines.forEach((line, index) => {
      context.fillText(line, x + paddingX, detailStart + index * detailLineHeight);
    });
  }
}

function drawStationCard(context, station, slot, count) {
  const density = count >= 3 ? "compact" : count === 1 ? "spacious" : "regular";
  const compact = density === "compact";
  context.save();
  context.shadowColor = "rgba(17, 47, 79, 0.14)";
  context.shadowBlur = 18;
  context.shadowOffsetY = 6;
  roundedRect(context, slot.x, slot.y, slot.width, slot.height, 20);
  context.fillStyle = "#ffffff";
  context.fill();
  context.shadowColor = "transparent";
  context.lineWidth = 2;
  context.strokeStyle = "#ced9e3";
  context.stroke();

  const headerHeight = compact ? 56 : 70;
  roundedRect(context, slot.x, slot.y, slot.width, headerHeight, 20);
  context.fillStyle = "#112f4f";
  context.fill();
  context.fillRect(slot.x, slot.y + headerHeight - 20, slot.width, 20);

  context.textBaseline = "alphabetic";
  context.fillStyle = "#ffffff";
  context.textAlign = "left";
  context.font = font(800, compact ? 24 : 30);
  context.fillText(station.name, slot.x + (compact ? 24 : 30), slot.y + (compact ? 38 : 46));
  context.textAlign = "right";
  context.fillStyle = "#bfe4f8";
  context.font = font(800, compact ? 18 : 22);
  context.fillText(station.code, slot.x + slot.width - (compact ? 24 : 30), slot.y + (compact ? 37 : 45));

  const bodyX = slot.x + (compact ? 16 : 22);
  const bodyY = slot.y + headerHeight + (compact ? 14 : 20);
  const bodyWidth = slot.width - (compact ? 32 : 44);
  const bodyHeight = slot.height - headerHeight - (compact ? 28 : 40);
  const gap = compact ? 10 : 15;
  const columns = 3;
  const rows = 2;
  const cellWidth = (bodyWidth - gap * (columns - 1)) / columns;
  const cellHeight = (bodyHeight - gap * (rows - 1)) / rows;

  station.metrics.slice(0, 6).forEach((metric, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    drawMetricTile(
      context,
      metric,
      bodyX + column * (cellWidth + gap),
      bodyY + row * (cellHeight + gap),
      cellWidth,
      cellHeight,
      density,
    );
  });
  context.restore();
}

async function renderCanvas(canvas, model) {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser does not support canvas graphics.");
  const assets = await loadGraphicAssets();
  const throughDates = model.stations.map((station) => station.dataThrough).filter(Boolean).sort();
  const through = throughDates[0] ?? "No completed data";
  const siteText =
    model.stations.length === 4
      ? "All four climate sites"
      : model.stations.map((station) => station.city).join(" · ");
  const status = model.stations.some((station) => station.provisional) ? "Provisional" : "Final";
  const subtitle = `${siteText} · ${status} data through ${through}`;
  drawFrame(context, model.title, subtitle, model.generatedAt, assets.logo);

  const slots = graphicSlots(model.stations.length);
  model.stations.forEach((station, index) => drawStationCard(context, station, slots[index], model.stations.length));

  context.fillStyle = "#5d6c7c";
  context.textAlign = "center";
  context.font = font(500, 17);
  context.fillText(
    "Sources: NOAA/NCEI Daily Summaries and 1991–2020 normals · RCC ACIS climate records · NWS/IEM heat-product archive",
    WIDTH / 2,
    938,
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
    status.textContent = "Loading official climate data, Manrope, and the NWS logo…";
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
      await renderCanvas(canvas, {
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
