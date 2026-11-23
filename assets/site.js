// WRAVEN site script. Every page works without it.
// 1. Writes the next meeting date into [data-next-meeting].
// 2. Sends forms marked [data-enhance] with fetch.
// 3. Leaves a note in the developer console.

// ---------- 1. Meetings ----------
// Mondays at 6:00 p.m. (Michigan time) during WMU terms. Keep these terms in
// step with /join/wraven-meetings.ics. Dates come from the WMU registrar.
const TERMS = [
  { first: "2026-09-14", last: "2026-12-07", skip: [] },
  { first: "2027-01-11", last: "2027-04-19", skip: ["2027-01-18", "2027-03-08"] },
];

function michiganToday() {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Detroit", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false,
    }).formatToParts(new Date()).map((x) => [x.type, x.value])
  );
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24 };
}

function addDays(iso, n) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Meetings start at 6:00 p.m. Until 8:00 p.m. the site treats the meeting as still on.
// The end time is an assumption; the calendar file uses the same two hours.
function nextMeeting() {
  const now = michiganToday();
  for (const term of TERMS) {
    for (let day = term.first; day <= term.last; day = addDays(day, 7)) {
      if (term.skip.includes(day)) continue;
      if (day > now.date || (day === now.date && now.hour < 20)) {
        return { day, today: day === now.date, during: day === now.date && now.hour >= 18 };
      }
    }
  }
  return null;
}

// The first Monday on or after today, in Michigan.
// After 8:00 p.m. on a Monday, the coming Monday is next week.
function comingMonday() {
  const now = michiganToday();
  const weekday = new Date(now.date + "T12:00:00Z").getUTCDay();
  const ahead = (8 - weekday) % 7;
  return addDays(now.date, ahead === 0 && now.hour >= 20 ? 7 : ahead);
}

// The UTC offset of Michigan time on a date, for the datetime attribute.
function michiganOffset(iso) {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: "America/Detroit", timeZoneName: "shortOffset" })
    .formatToParts(new Date(iso + "T23:00:00Z")).find((x) => x.type === "timeZoneName").value;
  const hours = Number(name.replace("GMT", "")) || -5;
  return (hours < 0 ? "-" : "+") + String(Math.abs(hours)).padStart(2, "0") + ":00";
}

function longDate(iso) {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" });
}

const meeting = nextMeeting();
document.querySelectorAll("[data-next-meeting]").forEach((el) => {
  if (!meeting) { el.textContent = "Mondays at 6:00 p.m. during the semester"; return; }
  const short = el.dataset.nextMeeting === "short";
  const day = short
    ? new Date(meeting.day + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" })
    : longDate(meeting.day);
  el.textContent = meeting.during ? "Today, started at 6:00\u00a0p.m.\u00a0ET"
    : meeting.today ? "Tonight at 6:00\u00a0p.m.\u00a0ET"
    : `${day}, 6:00\u00a0p.m.\u00a0ET`;
  if (el.tagName === "TIME") el.dateTime = `${meeting.day}T18:00${michiganOffset(meeting.day)}`;
});
// A note when the coming Monday has no meeting (a break or a holiday).
document.querySelectorAll("[data-meeting-note]").forEach((el) => {
  if (!meeting) return;
  const skipped = meeting.day > comingMonday();
  el.hidden = !skipped;
  if (skipped) el.textContent = `No meeting on ${longDate(comingMonday())}. The next one is ${longDate(meeting.day)}.`;
});

// ---------- 2. Forms ----------
document.querySelectorAll("form[data-enhance]").forEach((form) => {
  // The form needs JavaScript for the anti-bot check, so it starts hidden.
  form.hidden = false;
  const status = form.querySelector(".form-status");
  const button = form.querySelector("button[type=submit]");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    status.textContent = "";
    status.removeAttribute("data-kind");
    const token = form.querySelector("[name=cf-turnstile-response]");
    if (token && !token.value) {
      status.textContent = "The anti-bot check is still running. Wait a moment, then press Send again.";
      status.focus();
      return;
    }
    button.disabled = true;
    const label = button.textContent;
    button.textContent = "Sending";
    try {
      const response = await fetch(form.action, { method: "POST", body: new FormData(form), headers: { Accept: "application/json" } });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) {
        const human = response.status < 500 && typeof result.error === "string" ? result.error : "The message did not go through.";
        throw new Error(human);
      }
      form.reset();
      if (window.turnstile) window.turnstile.reset();
      status.textContent = "Sent. An officer will reply from contact@wraven.org.";
    } catch (error) {
      if (window.turnstile) window.turnstile.reset();
      status.dataset.kind = "error";
      status.textContent = `${error.message} You can also email contact@wraven.org.`;
    } finally {
      button.disabled = false;
      button.textContent = label;
      status.focus();
    }
  });
});

// ---------- 3. Console ----------
console.log(
  "%cWRAVEN%c\nYou opened the console. Most of us started the same way.\nMeetings: Mondays, 6:00 p.m., 2225 Kohrman Hall. https://wraven.org/join/\nFound a bug in this site? Read https://wraven.org/disclosure/ first.",
  "font: 700 16px sans-serif", "font: 12px sans-serif"
);
