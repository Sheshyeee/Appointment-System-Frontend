// Shared time-string formatting used across the app (booking slots,
// clinic working hours) so every time picker speaks the same format:
// "8:00 AM" — no leading zero on the hour, uppercase AM/PM.
//
// BookAppointment.tsx / AppointmentDetail.tsx currently hardcode their own
// ALL_SLOTS array in this same format but limited to 9:00 AM–4:30 PM with a
// lunch gap. This file exists so Working Hours (which needs the clinic's
// full 8 AM–6 PM range) uses an identical string format instead of
// inventing a different one. Longer term, ALL_SLOTS should probably be
// derived from these working hours instead of being a separate constant.

export function formatSlot(hour24: number, minute: number): string {
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

// Generates half-hour options across a wide clinic-hours range so any
// opening/closing time can be selected. Adjust start/end here if a clinic
// ever needs to open earlier or close later than this window.
export function generateHourOptions(startHour = 6, endHour = 21): string[] {
  const options: string[] = [];
  for (let h = startHour; h <= endHour; h++) {
    options.push(formatSlot(h, 0));
    if (h !== endHour) options.push(formatSlot(h, 30));
  }
  return options;
}
