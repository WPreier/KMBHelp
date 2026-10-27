import { defaultWorkerSchedule } from '@kmbhelp/shared';

export type ScheduleWindow = {
  fromMinute: number;
  toMinute: number;
  everyMinutes: number;
};

const partPattern = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})=(\d{1,4})$/u;

export function parseWorkerSchedule(text: string): ScheduleWindow[] | null {
  const parts = text
    .split(/[,\n]/u)
    .map((part) => part.trim())
    .filter((part) => part !== '');
  if (parts.length === 0) return null;
  const windows: ScheduleWindow[] = [];
  for (const part of parts) {
    const match = partPattern.exec(part);
    if (!match) return null;
    const from = clockMinute(match[1] ?? '', match[2] ?? '', false);
    const to = clockMinute(match[3] ?? '', match[4] ?? '', true);
    const every = Number(match[5]);
    if (from === null || to === null || to <= from || every > 24 * 60) return null;
    windows.push({ fromMinute: from, toMinute: to, everyMinutes: every });
  }
  return windows;
}

export function scheduleEveryMinutes(
  minuteOfDay: number,
  windows: readonly ScheduleWindow[],
): number {
  const window = windows.find(
    (item) => minuteOfDay >= item.fromMinute && minuteOfDay < item.toMinute,
  );
  return window?.everyMinutes ?? 0;
}

export function localClock(now: Date, offset: string): { minuteOfDay: number; slot: string } {
  const match = /^([+-])(\d{2}):(\d{2})$/u.exec(offset.trim());
  const sign = match?.[1] === '-' ? -1 : 1;
  const hours = Number(match?.[2] ?? 1);
  const mins = Number(match?.[3] ?? 0);
  const shifted = new Date(now.getTime() + sign * (hours * 60 + mins) * 60_000);
  const minuteOfDay = shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
  const year = String(shifted.getUTCFullYear());
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  const hour = String(shifted.getUTCHours()).padStart(2, '0');
  const minute = String(shifted.getUTCMinutes()).padStart(2, '0');
  return { minuteOfDay, slot: `${year}-${month}-${day}T${hour}:${minute}` };
}

export function shouldPollGraph(
  now: Date,
  offset: string,
  scheduleText: string,
  lastSlot: string | null,
): { poll: boolean; slot: string } {
  const windows = parseWorkerSchedule(scheduleText) ?? parseWorkerSchedule(defaultWorkerSchedule);
  const clock = localClock(now, offset || '+01:00');
  if (!windows) return { poll: false, slot: clock.slot };
  const every = scheduleEveryMinutes(clock.minuteOfDay, windows);
  if (every <= 0) return { poll: false, slot: clock.slot };
  const bucket = Math.floor(clock.minuteOfDay / every) * every;
  const slot = `${clock.slot.slice(0, 11)}${String(Math.floor(bucket / 60)).padStart(2, '0')}:${String(bucket % 60).padStart(2, '0')}`;
  return { poll: slot !== lastSlot, slot };
}

function clockMinute(hourText: string, minuteText: string, allowMidnight: boolean): number | null {
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (hour === 24 && minute === 0 && allowMidnight) return 24 * 60;
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}
