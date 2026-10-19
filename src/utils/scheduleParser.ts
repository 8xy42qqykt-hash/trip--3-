export interface ParsedEvent {
  title: string;
  time: string | null; // "10:00", "19:30", or null
}

export function parseScheduleInput(rawInput: string): ParsedEvent {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { title: '', time: null };
  }

  let time: string | null = null;
  let title = trimmed;

  // 1. Beginning: "10:00 Ski lesson" or "09:15 Beach"
  const startMatch = title.match(/^([01]?[0-9]|2[0-3]):([0-5][0-9])\s+(.*)$/i);
  if (startMatch) {
    const hh = startMatch[1].padStart(2, '0');
    const mm = startMatch[2];
    time = `${hh}:${mm}`;
    title = startMatch[3].trim();
    return { title: capitalizeFirst(title), time };
  }

  // 2. End: "Dinner 19:30" or "Meet 14:00"
  const endMatch = title.match(/^(.*?)\s+([01]?[0-9]|2[0-3]):([0-5][0-9])$/i);
  if (endMatch) {
    const hh = endMatch[2].padStart(2, '0');
    const mm = endMatch[3];
    time = `${hh}:${mm}`;
    title = endMatch[1].trim();
    return { title: capitalizeFirst(title), time };
  }

  // 3. Middle: "... at 14:00 ..."
  const middleMatch = title.match(/\b([01]?[0-9]|2[0-3]):([0-5][0-9])\b/i);
  if (middleMatch) {
    const hh = middleMatch[1].padStart(2, '0');
    const mm = middleMatch[2];
    time = `${hh}:${mm}`;
    title = title.replace(/\b(?:at\s+)?([01]?[0-9]|2[0-3]):([0-5][0-9])\b/i, '').replace(/\s+/g, ' ').trim();
    return { title: capitalizeFirst(title), time };
  }

  return {
    title: capitalizeFirst(title),
    time: null
  };
}

function capitalizeFirst(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}
