export const PERIODS = [
  { value: "06", label: "June" },
  { value: "07", label: "July" },
  { value: "08", label: "August" },
  { value: "09", label: "September" },
  { value: "season", label: "Season" },
];

export const HAZARD_LABELS = {
  "HT.Y": "Heat Advisory",
  "EH.A": "Excessive Heat Watch",
  "EH.W": "Excessive Heat Warning",
};

export const AVAILABLE_YEARS = [2026, 2025];
export const DEFAULT_YEAR = 2026;
export const DEFAULT_STATION = "KBTR";

export function getDefaultPeriod(year = DEFAULT_YEAR) {
  const now = new Date();
  if (now.getFullYear() !== year) return "06";
  const month = now.getMonth() + 1;
  if (month < 6) return "06";
  if (month > 9) return "season";
  return String(month).padStart(2, "0");
}
