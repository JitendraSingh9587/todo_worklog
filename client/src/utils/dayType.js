export function inferDayType(day) {
  if (!day) return "working";
  if (day.dayType) return day.dayType;
  if (!day.isHoliday) return "working";
  if (day.holidayReason === "holiday") return "holiday";
  if (day.holidayReason === "leave") return "leave";
  return "weekend";
}

export function cellClassForDay(day) {
  const t = inferDayType(day);
  if (t === "weekend") return "type-weekend";
  if (t === "holiday") return "type-holiday";
  if (t === "leave") return "type-leave";
  return "";
}
