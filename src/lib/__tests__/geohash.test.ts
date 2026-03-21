import { encode, decode, decodeBounds, prefixes, approximateArea } from '../geohash';

describe('geohash', () => {
  describe('encode', () => {
    it('encodes Austin, TX', () => {
      const hash = encode(30.2672, -97.7431, 5);
      expect(hash).toBe('9v6kp');
    });

    it('encodes New York', () => {
      const hash = encode(40.7128, -74.0060, 5);
      expect(hash).toBe('dr5re');
    });

    it('encodes with different precisions', () => {
      const hash9 = encode(30.2672, -97.7431, 9);
      expect(hash9.length).toBe(9);
      expect(hash9.startsWith('9v6kp')).toBe(true);
    });
  });

  describe('decode', () => {
    it('round-trips encode → decode within precision tolerance', () => {
      // Precision 5 ≈ ±5km, so ~0.05° tolerance
      const hash = encode(30.2672, -97.7431, 5);
      const { lat, lon } = decode(hash);
      expect(lat).toBeCloseTo(30.2672, 0);
      expect(lon).toBeCloseTo(-97.7431, 0);
    });

    it('round-trips at higher precision', () => {
      const original = { lat: 48.8566, lon: 2.3522 }; // Paris
      const hash = encode(original.lat, original.lon, 7);
      const decoded = decode(hash);
      expect(decoded.lat).toBeCloseTo(original.lat, 2);
      expect(decoded.lon).toBeCloseTo(original.lon, 2);
    });
  });

  describe('decodeBounds', () => {
    it('returns bounding box that decodes to a valid range', () => {
      const hash = encode(30.2672, -97.7431, 5);
      const bounds = decodeBounds(hash);
      const center = decode(hash);
      // Center must be within bounds
      expect(center.lat).toBeGreaterThanOrEqual(bounds.lat.min);
      expect(center.lat).toBeLessThanOrEqual(bounds.lat.max);
      expect(center.lon).toBeGreaterThanOrEqual(bounds.lon.min);
      expect(center.lon).toBeLessThanOrEqual(bounds.lon.max);
    });
  });

  describe('prefixes', () => {
    it('generates decreasing-length prefixes', () => {
      const result = prefixes('9v6knb4');
      expect(result).toEqual(['9v6knb4', '9v6knb', '9v6kn', '9v6k', '9v6', '9v']);
    });

    it('respects minLength', () => {
      const result = prefixes('9v6kn', 4);
      expect(result).toEqual(['9v6kn', '9v6k']);
    });

    it('returns empty for hash shorter than minLength', () => {
      const result = prefixes('9', 2);
      expect(result).toEqual([]);
    });
  });

  describe('approximateArea', () => {
    it('returns area for known precision', () => {
      expect(approximateArea('9v6kn')).toBe('~5km');
    });

    it('handles unknown precision', () => {
      expect(approximateArea('9v6knb4xyz123')).toBe('precision 13');
    });
  });
});
