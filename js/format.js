const UNITS = ["بايت", "كيلوبايت", "ميغابايت", "غيغابايت"];

export function formatBytes(bytes) {
  if (bytes === undefined || bytes === null) return "";
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < UNITS.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${UNITS[i]}`;
}

export function formatDate(isoString) {
  if (!isoString) return "";
  return new Date(isoString).toLocaleDateString("ar", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
