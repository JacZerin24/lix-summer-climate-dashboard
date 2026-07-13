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

const METRIC_THEMES = {
  "average-high": { tint: "#fff3ea", accent: "#d55b2a", icon: "thermometer" },
  "average-low": { tint: "#edf6ff", accent: "#2879b8", icon: "moon" },
  "period-rainfall": { tint: "#ebf8ff", accent: "#1684c4", icon: "droplet" },
  "hottest-high": { tint: "#fff0eb", accent: "#c94332", icon: "flame" },
  "days-90": { tint: "#fff8e5", accent: "#d99b15", icon: "sun" },
  "days-100": { tint: "#fff0f1", accent: "#b92d3a", icon: "alert" },
  "maximum-heat-index": { tint: "#fff2df", accent: "#e06a24", icon: "gauge" },
  "heat-advisory-days": { tint: "#fff7df", accent: "#c98608", icon: "calendar" },
  "watch-warning-days": { tint: "#fff0eb", accent: "#c43f2e", icon: "shield" },
  "ytd-rainfall": { tint: "#edf8ff", accent: "#157fbd", icon: "droplet" },
  "ytd-rainfall-departure": { tint: "#eef7f4", accent: "#267a68", icon: "trend" },
  "wettest-day": { tint: "#edf6ff", accent: "#286fa8", icon: "cloud-rain" },
  "rain-records-broken": { tint: "#fff3e8", accent: "#c75c1e", icon: "award" },
  "rain-records-tied": { tint: "#f3f0ff", accent: "#6d58aa", icon: "link" },
  "daily-high": { tint: "#fff3ea", accent: "#d55b2a", icon: "thermometer" },
  "daily-low": { tint: "#edf6ff", accent: "#2879b8", icon: "moon" },
  "daily-heat-index": { tint: "#fff2df", accent: "#e06a24", icon: "gauge" },
  "daily-rainfall": { tint: "#ebf8ff", accent: "#1684c4", icon: "droplet" },
  "daily-ytd-rainfall": { tint: "#edf8ff", accent: "#157fbd", icon: "cloud-rain" },
  "heat-products": { tint: "#fff0eb", accent: "#c43f2e", icon: "shield" },
};

const DEFAULT_THEME = { tint: "#f1f5f8", accent: "#49657f", icon: "calendar" };

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

function drawIcon(context, name, x, y, size, color, opacity = 1) {
  context.save();
  context.translate(x, y);
  context.scale(size / 24, size / 24);
  context.globalAlpha = opacity;
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = 2.1;
  context.lineCap = "round";
  context.lineJoin = "round";

  if (name === "thermometer") {
    context.beginPath();
    context.roundRect?.(9, 3, 6, 14, 3);
    if (!context.roundRect) {
      context.moveTo(12, 3);
      context.arc(12, 6, 3, Math.PI, 0);
      context.lineTo(15, 16);
      context.arc(12, 16, 3, 0, Math.PI);
      context.closePath();
    }
    context.stroke();
    context.beginPath();
    context.moveTo(12, 8);
    context.lineTo(12, 18);
    context.stroke();
    context.beginPath();
    context.arc(12, 19, 3.4, 0, Math.PI * 2);
    context.fill();
  } else if (name === "moon") {
    context.beginPath();
    context.arc(13, 12, 8, Math.PI * 0.34, Math.PI * 1.68);
    context.arc(16.5, 12, 6.4, Math.PI * 1.62, Math.PI * 0.38, true);
    context.closePath();
    context.fill();
  } else if (name === "droplet") {
    context.beginPath();
    context.moveTo(12, 2.8);
    context.bezierCurveTo(10, 6.5, 5.5, 10.7, 5.5, 15.2);
    context.bezierCurveTo(5.5, 19.2, 8.4, 22, 12, 22);
    context.bezierCurveTo(15.6, 22, 18.5, 19.2, 18.5, 15.2);
    context.bezierCurveTo(18.5, 10.7, 14, 6.5, 12, 2.8);
    context.closePath();
    context.fill();
  } else if (name === "flame") {
    context.beginPath();
    context.moveTo(13.2, 2.5);
    context.bezierCurveTo(14.2, 7.1, 19.1, 9.1, 18.2, 14.4);
    context.bezierCurveTo(17.5, 19.1, 14.5, 22, 10.6, 21.7);
    context.bezierCurveTo(6.6, 21.4, 4.5, 18.6, 5.2, 15.1);
    context.bezierCurveTo(5.9, 11.5, 9.2, 10.1, 9.4, 6.4);
    context.bezierCurveTo(11.2, 7.8, 12.1, 9.1, 12.3, 11.2);
    context.bezierCurveTo(14, 9.3, 14.7, 6.2, 13.2, 2.5);
    context.closePath();
    context.fill();
  } else if (name === "sun") {
    context.beginPath();
    context.arc(12, 12, 4.5, 0, Math.PI * 2);
    context.fill();
    for (let index = 0; index < 8; index += 1) {
      const angle = (Math.PI * 2 * index) / 8;
      context.beginPath();
      context.moveTo(12 + Math.cos(angle) * 7, 12 + Math.sin(angle) * 7);
      context.lineTo(12 + Math.cos(angle) * 10, 12 + Math.sin(angle) * 10);
      context.stroke();
    }
  } else if (name === "gauge") {
    context.beginPath();
    context.arc(12, 14, 8, Math.PI, 0);
    context.stroke();
    context.beginPath();
    context.moveTo(5, 18);
    context.lineTo(19, 18);
    context.stroke();
    context.beginPath();
    context.moveTo(12, 14);
    context.lineTo(16.5, 9.5);
    context.stroke();
    context.beginPath();
    context.arc(12, 14, 1.4, 0, Math.PI * 2);
    context.fill();
  } else if (name === "alert") {
    context.beginPath();
    context.moveTo(12, 2.5);
    context.lineTo(22, 20.5);
    context.lineTo(2, 20.5);
    context.closePath();
    context.stroke();
    context.beginPath();
    context.moveTo(12, 8);
    context.lineTo(12, 14);
    context.stroke();
    context.beginPath();
    context.arc(12, 17.3, 1.1, 0, Math.PI * 2);
    context.fill();
  } else if (name === "calendar") {
    roundedRect(context, 3, 5, 18, 16, 2.5);
    context.stroke();
    context.beginPath();
    context.moveTo(3, 9);
    context.lineTo(21, 9);
    context.moveTo(8, 3);
    context.lineTo(8, 7);
    context.moveTo(16, 3);
    context.lineTo(16, 7);
    context.stroke();
    context.beginPath();
    context.arc(8, 14, 1.2, 0, Math.PI * 2);
    context.arc(12, 14, 1.2, 0, Math.PI * 2);
    context.arc(16, 14, 1.2, 0, Math.PI * 2);
    context.fill();
  } else if (name === "shield") {
    context.beginPath();
    context.moveTo(12, 2.5);
    context.lineTo(20, 6);
    context.lineTo(19, 14);
    context.bezierCurveTo(18.5, 18, 15.5, 20.5, 12, 22);
    context.bezierCurveTo(8.5, 20.5, 5.5, 18, 5, 14);
    context.lineTo(4, 6);
    context.closePath();
    context.stroke();
    context.beginPath();
    context.moveTo(12, 7);
    context.lineTo(12, 14);
    context.stroke();
    context.beginPath();
    context.arc(12, 17.3, 1.1, 0, Math.PI * 2);
    context.fill();
  } else if (name === "trend") {
    context.beginPath();
    context.moveTo(3, 18);
    context.lineTo(9, 12);
    context.lineTo(13, 15);
    context.lineTo(21, 6);
    context.stroke();
    context.beginPath();
    context.moveTo(16, 6);
    context.lineTo(21, 6);
    context.lineTo(21, 11);
    context.stroke();
  } else if (name === "cloud-rain") {
    context.beginPath();
    context.moveTo(6, 15);
    context.bezierCurveTo(2.5, 15, 2.5, 10, 6.2, 9.4);
    context.bezierCurveTo(7.4, 5.3, 13.2, 4.8, 15.2, 8.4);
    context.bezierCurveTo(19.8, 7.9, 21.5, 14.8, 17, 15);
    context.closePath();
    context.stroke();
    [8, 12, 16].forEach((dropX) => {
      context.beginPath();
      context.moveTo(dropX, 18);
      context.lineTo(dropX - 1, 21);
      context.stroke();
    });
  } else if (name === "award") {
    context.beginPath();
    context.arc(12, 9, 5.5, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.moveTo(9, 14);
    context.lineTo(8, 22);
    context.lineTo(12, 19.2);
    context.lineTo(16, 22);
    context.lineTo(15, 14);
    context.stroke();
    context.beginPath();
    context.moveTo(12, 5.5);
    context.lineTo(13, 8);
    context.lineTo(15.7, 8.2);
    context.lineTo(13.6, 9.9);
    context.lineTo(14.3, 12.5);
    context.lineTo(12, 11);
    context.lineTo(9.7, 12.5);
    context.lineTo(10.4, 9.9);
    context.lineTo(8.3, 8.2);
    context.lineTo(11, 8);
    context.closePath();
    context.fill();
  } else if (name === "link") {
    context.beginPath();
    context.arc(8, 12, 5, Math.PI * 0.35, Math.PI * 1.65);
    context.arc(16, 12, 5, Math.PI * 1.35, Math.PI * 0.65);
    context.stroke();
    context.beginPath();
    context.moveTo(8.5, 12);
    context.lineTo(15.5, 12);
    context.stroke();
  }

  context.restore();
}

function drawFrame(context, title, subtitle, generatedAt, logo) {
  context.clearRect(0, 0, WIDTH, HEIGHT);
  const background = context.createLinearGradient(0, 130, WIDTH, 970);
  background.addColorStop(0, "#f8fafc");
  background.addColorStop(1, "#eaf1f6");
  context.fillStyle = background;
  context.fillRect(0, 0, WIDTH, HEIGHT);

  context.save();
  context.globalAlpha = 0.06;
  context.fillStyle = "#1675b9";
  context.beginPath();
  context.arc(1785, 210, 210, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.arc(70, 880, 160, 0, Math.PI * 2);
  context.fill();
  context.restore();

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
    return [{ x: 52, y: 150, width: 1816, height: 724 }];
  }
  if (safeCount === 2) {
    return [
      { x: 38, y: 150, width: 907, height: 724 },
      { x: 975, y: 150, width: 907, height: 724 },
    ];
  }
  const slots = [
    { x: 38, y: 146, width: 907, height: 350 },
    { x: 975, y: 146, width: 907, height: 350 },
    { x: 38, y: 520, width: 907, height: 350 },
    { x: 975, y: 520, width: 907, height: 350 },
  ];
  if (safeCount === 3) slots[2] = { x: 506, y: 520, width: 907, height: 350 };
  return slots.slice(0, safeCount);
}

function drawMetricTile(context, metric, x, y, width, height, density) {
  const theme = METRIC_THEMES[metric.id] ?? DEFAULT_THEME;
  const compact = density === "compact";
  const spacious = density === "spacious";
  const radius = compact ? 14 : 18;
  const padding = compact ? 16 : spacious ? 28 : 22;
  const badgeSize = compact ? 36 : spacious ? 54 : 46;
  const labelSize = compact ? 12 : spacious ? 17 : 15;
  const valueStartSize = compact ? 29 : spacious ? 54 : 42;
  const valueMinimum = compact ? 17 : 23;
  const detailSize = compact ? 11.5 : spacious ? 16 : 14;
  const detailBandHeight = metric.detail ? (compact ? 31 : spacious ? 52 : 44) : 0;

  context.save();
  context.shadowColor = "rgba(23, 53, 77, 0.08)";
  context.shadowBlur = compact ? 5 : 10;
  context.shadowOffsetY = compact ? 2 : 4;
  roundedRect(context, x, y, width, height, radius);
  const fill = context.createLinearGradient(x, y, x + width, y + height);
  fill.addColorStop(0, "#ffffff");
  fill.addColorStop(1, theme.tint);
  context.fillStyle = fill;
  context.fill();
  context.shadowColor = "transparent";
  context.lineWidth = 1.5;
  context.strokeStyle = `${theme.accent}35`;
  context.stroke();

  roundedRect(context, x + (compact ? 7 : 9), y + 12, compact ? 5 : 7, height - 24, 4);
  context.fillStyle = theme.accent;
  context.fill();

  context.save();
  context.globalAlpha = compact ? 0.055 : 0.065;
  drawIcon(
    context,
    theme.icon,
    x + width - (compact ? 92 : spacious ? 150 : 118),
    y + height * (compact ? 0.32 : 0.34),
    compact ? 108 : spacious ? 176 : 140,
    theme.accent,
    1,
  );
  context.restore();

  const badgeX = x + width - padding - badgeSize;
  const badgeY = y + (compact ? 12 : 17);
  roundedRect(context, badgeX, badgeY, badgeSize, badgeSize, badgeSize * 0.3);
  context.fillStyle = `${theme.accent}18`;
  context.fill();
  context.lineWidth = 1.4;
  context.strokeStyle = `${theme.accent}32`;
  context.stroke();
  drawIcon(
    context,
    theme.icon,
    badgeX + badgeSize * 0.22,
    badgeY + badgeSize * 0.22,
    badgeSize * 0.56,
    theme.accent,
  );

  const textX = x + padding + (compact ? 5 : 7);
  const labelWidth = Math.max(40, badgeX - textX - (compact ? 8 : 14));
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.fillStyle = theme.accent;
  context.font = font(800, labelSize);
  const labelLines = wrapLines(context, metric.label.toUpperCase(), labelWidth, compact ? 1 : 2);
  const labelLineHeight = labelSize + 3;
  labelLines.forEach((line, index) => {
    context.fillText(line, textX, y + padding + labelSize + index * labelLineHeight);
  });

  const valueTop = compact
    ? y + 62
    : y + Math.max(87, height * (spacious ? 0.39 : 0.38));
  const valueBottom = y + height - detailBandHeight - (compact ? 11 : 18);
  const maxValueWidth = width - padding * 2 - (compact ? 8 : 14);
  let adjusted = fitText(context, metric.value, maxValueWidth, valueStartSize, valueMinimum, 800);
  context.font = font(800, adjusted);
  const valueLines = wrapLines(context, metric.value, maxValueWidth, compact ? 1 : 2);
  if (valueLines.length > 1 && !compact) {
    adjusted = Math.max(valueMinimum, adjusted - 4);
    context.font = font(800, adjusted);
  }
  const valueLineHeight = adjusted + (compact ? 1 : 4);
  const valueBlockHeight = valueLines.length * valueLineHeight;
  const centeredValueY = Math.max(
    valueTop,
    valueTop + Math.max(0, (valueBottom - valueTop - valueBlockHeight) / 2) + adjusted,
  );
  context.fillStyle = "#112f4f";
  valueLines.forEach((line, index) => {
    context.fillText(line, textX, centeredValueY + index * valueLineHeight);
  });

  if (metric.detail) {
    const bandX = x + (compact ? 13 : 18);
    const bandY = y + height - detailBandHeight - (compact ? 8 : 12);
    const bandWidth = width - (compact ? 26 : 36);
    const bandHeight = detailBandHeight;
    roundedRect(context, bandX, bandY, bandWidth, bandHeight, compact ? 9 : 12);
    context.fillStyle = "rgba(255, 255, 255, 0.76)";
    context.fill();
    context.lineWidth = 1;
    context.strokeStyle = `${theme.accent}24`;
    context.stroke();

    context.fillStyle = "#52687b";
    context.font = font(600, detailSize);
    const detailWidth = bandWidth - (compact ? 18 : 24);
    const detailLines = wrapLines(context, metric.detail, detailWidth, compact ? 1 : 2);
    const detailLineHeight = detailSize + 3;
    const detailStart = bandY + (bandHeight - detailLines.length * detailLineHeight) / 2 + detailSize;
    detailLines.forEach((line, index) => {
      context.fillText(line, bandX + (compact ? 9 : 12), detailStart + index * detailLineHeight);
    });
  }

  context.restore();
}

function drawStationCard(context, station, slot, count) {
  const density = count >= 3 ? "compact" : count === 1 ? "spacious" : "regular";
  const compact = density === "compact";
  context.save();
  context.shadowColor = "rgba(17, 47, 79, 0.16)";
  context.shadowBlur = compact ? 13 : 20;
  context.shadowOffsetY = compact ? 5 : 8;
  roundedRect(context, slot.x, slot.y, slot.width, slot.height, 22);
  context.fillStyle = "#ffffff";
  context.fill();
  context.shadowColor = "transparent";
  context.lineWidth = 1.8;
  context.strokeStyle = "#cbd8e3";
  context.stroke();

  const headerHeight = compact ? 58 : 78;
  roundedRect(context, slot.x, slot.y, slot.width, headerHeight, 22);
  const headerGradient = context.createLinearGradient(slot.x, slot.y, slot.x + slot.width, slot.y);
  headerGradient.addColorStop(0, "#102f4f");
  headerGradient.addColorStop(1, "#174f78");
  context.fillStyle = headerGradient;
  context.fill();
  context.fillRect(slot.x, slot.y + headerHeight - 22, slot.width, 22);
  context.fillStyle = "#2ba3db";
  context.fillRect(slot.x, slot.y + headerHeight - 4, slot.width, 4);

  const pinSize = compact ? 24 : 30;
  context.beginPath();
  context.arc(slot.x + (compact ? 27 : 35), slot.y + headerHeight / 2 - 1, pinSize / 2, 0, Math.PI * 2);
  context.fillStyle = "rgba(255, 255, 255, 0.14)";
  context.fill();
  context.beginPath();
  context.arc(slot.x + (compact ? 27 : 35), slot.y + headerHeight / 2 - 3, compact ? 3.5 : 4.5, 0, Math.PI * 2);
  context.fillStyle = "#ffffff";
  context.fill();
  context.beginPath();
  context.moveTo(slot.x + (compact ? 27 : 35), slot.y + headerHeight / 2 + (compact ? 8 : 10));
  context.lineTo(slot.x + (compact ? 22 : 29), slot.y + headerHeight / 2 + 1);
  context.lineTo(slot.x + (compact ? 32 : 41), slot.y + headerHeight / 2 + 1);
  context.closePath();
  context.fill();

  context.textBaseline = "alphabetic";
  context.fillStyle = "#ffffff";
  context.textAlign = "left";
  context.font = font(800, compact ? 23 : 31);
  context.fillText(station.name, slot.x + (compact ? 48 : 61), slot.y + (compact ? 39 : 51));

  const chipWidth = compact ? 74 : 90;
  const chipHeight = compact ? 30 : 36;
  const chipX = slot.x + slot.width - chipWidth - (compact ? 18 : 24);
  const chipY = slot.y + (headerHeight - chipHeight) / 2;
  roundedRect(context, chipX, chipY, chipWidth, chipHeight, chipHeight / 2);
  context.fillStyle = "rgba(255, 255, 255, 0.13)";
  context.fill();
  context.lineWidth = 1;
  context.strokeStyle = "rgba(255, 255, 255, 0.25)";
  context.stroke();
  context.textAlign = "center";
  context.fillStyle = "#d3efff";
  context.font = font(800, compact ? 16 : 19);
  context.fillText(station.code, chipX + chipWidth / 2, chipY + chipHeight * 0.69);

  const bodyX = slot.x + (compact ? 15 : 22);
  const bodyY = slot.y + headerHeight + (compact ? 13 : 19);
  const bodyWidth = slot.width - (compact ? 30 : 44);
  const bodyHeight = slot.height - headerHeight - (compact ? 27 : 38);
  const gap = compact ? 10 : 16;
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

function drawSourceStrip(context) {
  const x = 190;
  const y = 900;
  const width = 1540;
  const height = 48;
  roundedRect(context, x, y, width, height, 24);
  context.fillStyle = "rgba(255, 255, 255, 0.84)";
  context.fill();
  context.lineWidth = 1.2;
  context.strokeStyle = "rgba(17, 47, 79, 0.12)";
  context.stroke();

  context.beginPath();
  context.arc(x + 29, y + height / 2, 12, 0, Math.PI * 2);
  context.fillStyle = "#e5f2fb";
  context.fill();
  context.fillStyle = "#1675b9";
  context.font = font(800, 16);
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("i", x + 29, y + height / 2 + 0.5);

  context.fillStyle = "#52687b";
  context.textAlign = "left";
  context.font = font(600, 15);
  context.fillText(
    "Official sources: NOAA/NCEI Daily Summaries and 1991–2020 normals · RCC ACIS records · NWS/IEM heat-product archive",
    x + 52,
    y + 30,
  );
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
  drawSourceStrip(context);
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
          <p>Choose the content and any combination of climate sites. The layout, icon scale, and typography adapt automatically.</p>
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
    status.textContent = "Loading official climate data, visual assets, and adaptive layout…";
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
