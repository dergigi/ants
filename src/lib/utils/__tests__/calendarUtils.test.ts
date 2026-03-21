import { extractCalendarEventMetadata, extractCalendarMetadata, calendarEventStatus } from '../calendarUtils';
import { NDKEvent } from '@nostr-dev-kit/ndk';

function makeCalendarEvent(kind: number, tags: string[][]): NDKEvent {
  return { kind, tags, content: 'Event description' } as unknown as NDKEvent;
}

describe('extractCalendarEventMetadata', () => {
  it('extracts date-based event (kind 31922)', () => {
    const event = makeCalendarEvent(31922, [
      ['title', 'Bitcoin Meetup'],
      ['summary', 'Monthly Austin meetup'],
      ['start', '2026-04-15'],
      ['end', '2026-04-15'],
      ['location', 'Austin, TX'],
      ['g', '9v6kp'],
      ['image', 'https://example.com/meetup.jpg'],
      ['t', 'bitcoin'],
      ['t', 'meetup'],
      ['p', 'pubkey1', 'wss://relay.example.com', 'Host'],
    ]);
    const meta = extractCalendarEventMetadata(event);
    expect(meta.isDateBased).toBe(true);
    expect(meta.title).toBe('Bitcoin Meetup');
    expect(meta.summary).toBe('Monthly Austin meetup');
    expect(meta.startDate).toBe('2026-04-15');
    expect(meta.endDate).toBe('2026-04-15');
    expect(meta.location).toBe('Austin, TX');
    expect(meta.geohash).toBe('9v6kp');
    expect(meta.image).toBe('https://example.com/meetup.jpg');
    expect(meta.hashtags).toEqual(['bitcoin', 'meetup']);
    expect(meta.participants).toEqual([{ pubkey: 'pubkey1', role: 'Host' }]);
    expect(meta.startTimestamp).toBeNull();
  });

  it('extracts time-based event (kind 31923)', () => {
    const event = makeCalendarEvent(31923, [
      ['title', 'Nostr Dev Call'],
      ['start', '1713200000'],
      ['end', '1713203600'],
      ['start_tzid', 'America/New_York'],
      ['location', 'Online'],
    ]);
    const meta = extractCalendarEventMetadata(event);
    expect(meta.isDateBased).toBe(false);
    expect(meta.title).toBe('Nostr Dev Call');
    expect(meta.startTimestamp).toBe(1713200000);
    expect(meta.endTimestamp).toBe(1713203600);
    expect(meta.startTzid).toBe('America/New_York');
    expect(meta.location).toBe('Online');
  });

  it('handles missing tags gracefully', () => {
    const event = makeCalendarEvent(31922, []);
    const meta = extractCalendarEventMetadata(event);
    expect(meta.title).toBe('');
    expect(meta.startDate).toBe('');
    expect(meta.location).toBe('');
    expect(meta.participants).toEqual([]);
  });

  it('falls back to name tag for title', () => {
    const event = makeCalendarEvent(31922, [
      ['name', 'Legacy Title'],
      ['start', '2026-01-01'],
    ]);
    const meta = extractCalendarEventMetadata(event);
    expect(meta.title).toBe('Legacy Title');
  });
});

describe('extractCalendarMetadata', () => {
  it('extracts calendar collection (kind 31924)', () => {
    const event = makeCalendarEvent(31924, [
      ['title', 'Bitcoin Events 2026'],
      ['a', '31922:pubkey1:meetup-jan'],
      ['a', '31923:pubkey1:call-feb'],
    ]);
    const cal = extractCalendarMetadata(event);
    expect(cal.title).toBe('Bitcoin Events 2026');
    expect(cal.eventRefs).toEqual(['31922:pubkey1:meetup-jan', '31923:pubkey1:call-feb']);
  });
});

describe('calendarEventStatus', () => {
  it('returns upcoming for future date-based events', () => {
    const meta = extractCalendarEventMetadata(
      makeCalendarEvent(31922, [['start', '2099-01-01']])
    );
    expect(calendarEventStatus(meta)).toBe('upcoming');
  });

  it('returns past for old date-based events', () => {
    const meta = extractCalendarEventMetadata(
      makeCalendarEvent(31922, [['start', '2020-01-01']])
    );
    expect(calendarEventStatus(meta)).toBe('past');
  });

  it('returns upcoming for future time-based events', () => {
    const futureTs = String(Math.floor(Date.now() / 1000) + 86400);
    const meta = extractCalendarEventMetadata(
      makeCalendarEvent(31923, [['start', futureTs]])
    );
    expect(calendarEventStatus(meta)).toBe('upcoming');
  });

  it('returns past for old time-based events', () => {
    const meta = extractCalendarEventMetadata(
      makeCalendarEvent(31923, [['start', '1600000000']])
    );
    expect(calendarEventStatus(meta)).toBe('past');
  });
});
