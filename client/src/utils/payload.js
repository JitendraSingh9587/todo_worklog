import { toDateString } from "./date.js";
import { inferDayType } from "./dayType.js";

function toApiDailyEntry(day, defaultProjectId) {
  const dayType = inferDayType(day);
  const isLeave = dayType === "leave";
  const isPublicHoliday = dayType === "holiday";
  const workingHours =
    typeof day.timeSpend === "number" && Number.isFinite(day.timeSpend)
      ? day.timeSpend
      : 0;
  const taskText =
    typeof day.dailyUpdate === "string" ? day.dailyUpdate.trim() : "";

  let projectEntries = [];
  if (Array.isArray(day.projectEntries) && day.projectEntries.length) {
    projectEntries = day.projectEntries
      .filter((e) => e && typeof e.projectId === "string" && e.projectId)
      .map((e) => ({
        projectId: e.projectId,
        hours:
          typeof e.hours === "number" && Number.isFinite(e.hours)
            ? e.hours
            : workingHours,
        taskDescription:
          typeof e.taskDescription === "string" ? e.taskDescription : taskText,
        entryId:
          typeof e.entryId === "string" && e.entryId
            ? e.entryId
            : crypto.randomUUID(),
      }));
  } else if (workingHours > 0 && taskText && defaultProjectId) {
    projectEntries = [
      {
        projectId: defaultProjectId,
        hours: workingHours,
        taskDescription: taskText,
        entryId: crypto.randomUUID(),
      },
    ];
  }

  return {
    date: day.date,
    workingHours,
    isHoliday: isPublicHoliday,
    isLeave,
    leaveType: isLeave ? "full-day" : null,
    is_halfday: 0,
    isHalfday: 0,
    projectEntries,
  };
}

/**
 * Build apipayload.json shape for a month.
 * @param {Map<string, object>} dayByDate
 * @param {number} year
 * @param {number} monthIndex 0-based
 * @param {string} defaultProjectId
 */
export function buildMonthApiPayload(
  dayByDate,
  year,
  monthIndex,
  defaultProjectId,
) {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  const dailyEntries = [];

  for (let d = 1; d <= lastDay; d += 1) {
    const dateStr = toDateString(year, monthIndex, d);
    const day = dayByDate.get(dateStr);
    if (!day) continue;
    dailyEntries.push(toApiDailyEntry(day, defaultProjectId));
  }

  let totalHours = 0;
  let totalWorkingDays = 0;
  let totalHolidays = 0;
  let totalLeaves = 0;

  for (const entry of dailyEntries) {
    totalHours += entry.workingHours || 0;
    if ((entry.workingHours || 0) > 0) totalWorkingDays += 1;
    if (entry.isHoliday) totalHolidays += 1;
    if (entry.isLeave) totalLeaves += 1;
  }

  return {
    dailyEntries,
    totalHours,
    totalWorkingDays,
    totalHolidays,
    totalLeaves,
  };
}

export function buildProjectEntries(
  day,
  projectId,
  clientId,
  hours,
  taskDescription,
) {
  if (!projectId) return [];
  const existing =
    day && Array.isArray(day.projectEntries) ? day.projectEntries : [];
  const prior = existing.find((e) => e && e.projectId === projectId);
  const entry = {
    projectId,
    hours,
    taskDescription,
    entryId: prior && prior.entryId ? prior.entryId : crypto.randomUUID(),
  };
  if (clientId) entry.clientId = clientId;
  return [entry];
}
