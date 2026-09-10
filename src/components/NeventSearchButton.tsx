'use client';

type Props = {
  eventId: string;
  timestamp: string;
  exactDate?: string;
  exactTimestamp?: number;
  onSearch: (eventId: string) => void;
};

/** Timestamp button that triggers an nevent search for the given event */
export default function NeventSearchButton({ eventId, timestamp, exactDate, exactTimestamp, onSearch }: Props) {
  const timestampProps = typeof exactTimestamp === 'number'
    ? { 'data-timestamp': String(exactTimestamp) }
    : {};

  return (
    <button
      type="button"
      className="text-xs hover:underline"
      title={exactDate || 'Search this nevent'}
      onClick={() => onSearch(eventId)}
      {...timestampProps}
    >
      {timestamp}
    </button>
  );
}
