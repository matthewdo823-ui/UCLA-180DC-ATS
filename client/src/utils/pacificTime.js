// Demonstrated Interest form deadlines are announced in Pacific time regardless of where the
// admin's browser is, so entry and display pin America/Los_Angeles explicitly (no date library).
export const PACIFIC_TIME_ZONE = "America/Los_Angeles";

const PARTS_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: PACIFIC_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function pacificParts(ms) {
  return Object.fromEntries(PARTS_FORMAT.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
}

// Pacific wall-clock minus UTC at this instant: -7h in PDT, -8h in PST.
function pacificOffsetMs(utcMs) {
  const p = pacificParts(utcMs);
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - utcMs;
}

/** "2026-09-24" + "23:59:59" (Pacific wall clock) → "2026-09-25T06:59:59.000Z" */
export function pacificToIso(dateStr, timeStr) {
  const [y, mo, d] = String(dateStr || "").split("-").map(Number);
  const [h = 0, mi = 0, s = 0] = String(timeStr || "").split(":").map(Number);
  if (![y, mo, d, h, mi, s].every(Number.isFinite) || !y || !mo || !d) return null;
  const wall = Date.UTC(y, mo - 1, d, h, mi, s);
  // Re-check the offset at the candidate instant so DST-transition days resolve correctly.
  let utc = wall - pacificOffsetMs(wall);
  utc = wall - pacificOffsetMs(utc);
  return new Date(utc).toISOString();
}

/** ISO instant → { date: "YYYY-MM-DD", time: "HH:MM:SS" } in Pacific, for date/time inputs. */
export function isoToPacificInputs(iso) {
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return { date: "", time: "" };
  const p = pacificParts(ms);
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}:${p.second}` };
}

const DISPLAY_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: PACIFIC_TIME_ZONE,
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** "Thu, Sep 24, 11:59 PM PT" — seconds are shown only when they are not :00. */
export function formatPacific(iso) {
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "—";
  const seconds = pacificParts(ms).second;
  const base = DISPLAY_FORMAT.format(new Date(ms));
  return `${seconds !== "00" ? base.replace(/(\d{1,2}:\d{2})/, `$1:${seconds}`) : base} PT`;
}
