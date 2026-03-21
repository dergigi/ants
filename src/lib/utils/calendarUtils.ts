import { NDKEvent } from '@nostr-dev-kit/ndk';

export interface CalendarEventMetadata {
  title: string;
  summary: string;
  image: string;
  location: string;
  geohash: string;
  startDate: string;       // YYYY-MM-DD for date-based, ISO string for time-based
  endDate: string;
  startTimestamp: number | null;  // unix timestamp for time-based events
  endTimestamp: number | null;
  startTzid: string;       // IANA timezone (e.g., "America/New_York")
  endTzid: string;
  hashtags: string[];
  participants: Array<{ pubkey: string; role: string }>;
  isDateBased: boolean;    // true for kind 31922, false for kind 31923
}

export interface CalendarMetadata {
  title: string;
  eventRefs: string[];     // a tag references to 31922/31923 events
}

/**
 * Extract calendar event metadata from kind 31922 (date-based) or 31923 (time-based) events.
 */
export function extractCalendarEventMetadata(event: NDKEvent): CalendarEventMetadata {
  const isDateBased = event.kind === 31922;

  let title = '';
  let summary = '';
  let image = '';
  let location = '';
  let geohash = '';
  let startDate = '';
  let endDate = '';
  let startTimestamp: number | null = null;
  let endTimestamp: number | null = null;
  let startTzid = '';
  let endTzid = '';
  const hashtags: string[] = [];
  const participants: Array<{ pubkey: string; role: string }> = [];

  for (const tag of event.tags) {
    if (!Array.isArray(tag) || tag.length < 2) continue;
    switch (tag[0]) {
      case 'title':
      case 'name': // deprecated but still used
        if (!title) title = tag[1];
        break;
      case 'summary':
        summary = tag[1];
        break;
      case 'image':
        if (!image) image = tag[1];
        break;
      case 'location':
        location = tag[1];
        break;
      case 'g':
        geohash = tag[1];
        break;
      case 'start':
        if (isDateBased) {
          startDate = tag[1]; // YYYY-MM-DD
        } else {
          startTimestamp = parseInt(tag[1], 10) || null;
        }
        break;
      case 'end':
        if (isDateBased) {
          endDate = tag[1];
        } else {
          endTimestamp = parseInt(tag[1], 10) || null;
        }
        break;
      case 'start_tzid':
        startTzid = tag[1];
        break;
      case 'end_tzid':
        endTzid = tag[1];
        break;
      case 't':
        hashtags.push(tag[1].toLowerCase());
        break;
      case 'p':
        participants.push({ pubkey: tag[1], role: tag[3] || '' });
        break;
    }
  }

  return {
    title, summary, image, location, geohash,
    startDate, endDate, startTimestamp, endTimestamp,
    startTzid, endTzid, hashtags, participants, isDateBased,
  };
}

/**
 * Extract calendar collection metadata from kind 31924 events.
 */
export function extractCalendarMetadata(event: NDKEvent): CalendarMetadata {
  let title = '';
  const eventRefs: string[] = [];

  for (const tag of event.tags) {
    if (!Array.isArray(tag) || tag.length < 2) continue;
    if (tag[0] === 'title') title = tag[1];
    if (tag[0] === 'a') eventRefs.push(tag[1]);
  }

  return { title, eventRefs };
}

/**
 * Format a calendar event's date/time for display.
 */
export function formatCalendarDate(meta: CalendarEventMetadata): string {
  if (meta.isDateBased) {
    return formatDateRange(meta.startDate, meta.endDate);
  }

  if (!meta.startTimestamp) return '';

  const opts: Intl.DateTimeFormatOptions = {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  };

  if (meta.startTzid) {
    opts.timeZone = meta.startTzid;
  }

  const start = new Date(meta.startTimestamp * 1000);
  let formatted = start.toLocaleString(undefined, opts);

  if (meta.endTimestamp) {
    const end = new Date(meta.endTimestamp * 1000);
    const endOpts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
    if (meta.endTzid || meta.startTzid) {
      endOpts.timeZone = meta.endTzid || meta.startTzid;
    }
    formatted += ` – ${end.toLocaleString(undefined, endOpts)}`;
  }

  if (meta.startTzid) {
    // Show abbreviated timezone
    const tzAbbr = meta.startTzid.split('/').pop()?.replace(/_/g, ' ') || meta.startTzid;
    formatted += ` (${tzAbbr})`;
  }

  return formatted;
}

function formatDateRange(start: string, end: string): string {
  if (!start) return '';

  const formatSingle = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatted = formatSingle(start);
  if (end && end !== start) {
    return `${formatted} – ${formatSingle(end)}`;
  }
  return formatted;
}

/**
 * Determine if a calendar event is upcoming, ongoing, or past.
 */
export function calendarEventStatus(meta: CalendarEventMetadata): 'upcoming' | 'ongoing' | 'past' {
  const now = Date.now() / 1000;

  if (meta.isDateBased) {
    const startTs = meta.startDate ? new Date(meta.startDate).getTime() / 1000 : 0;
    const endTs = meta.endDate ? new Date(meta.endDate).getTime() / 1000 + 86400 : startTs + 86400;
    if (now < startTs) return 'upcoming';
    if (now <= endTs) return 'ongoing';
    return 'past';
  }

  if (!meta.startTimestamp) return 'upcoming';
  const endTs = meta.endTimestamp || meta.startTimestamp + 3600;
  if (now < meta.startTimestamp) return 'upcoming';
  if (now <= endTs) return 'ongoing';
  return 'past';
}
