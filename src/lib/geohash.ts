/**
 * Lightweight geohash encode/decode — no external dependencies.
 * Based on the public-domain geohash algorithm (Gustavo Niemeyer, 2008).
 */

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';
const DECODE_MAP: Record<string, number> = {};
for (let i = 0; i < BASE32.length; i++) DECODE_MAP[BASE32[i]] = i;

export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface GeoBounds {
  lat: { min: number; max: number };
  lon: { min: number; max: number };
}

/**
 * Decode a geohash string into a lat/lon center point.
 */
export function decode(hash: string): GeoPoint {
  const bounds = decodeBounds(hash);
  return {
    lat: (bounds.lat.min + bounds.lat.max) / 2,
    lon: (bounds.lon.min + bounds.lon.max) / 2,
  };
}

/**
 * Decode a geohash string into bounding box.
 */
export function decodeBounds(hash: string): GeoBounds {
  let latMin = -90, latMax = 90;
  let lonMin = -180, lonMax = 180;
  let isLon = true;

  for (const ch of hash.toLowerCase()) {
    const val = DECODE_MAP[ch];
    if (val === undefined) break;
    for (let bit = 4; bit >= 0; bit--) {
      if (isLon) {
        const mid = (lonMin + lonMax) / 2;
        if (val & (1 << bit)) lonMin = mid;
        else lonMax = mid;
      } else {
        const mid = (latMin + latMax) / 2;
        if (val & (1 << bit)) latMin = mid;
        else latMax = mid;
      }
      isLon = !isLon;
    }
  }

  return { lat: { min: latMin, max: latMax }, lon: { min: lonMin, max: lonMax } };
}

/**
 * Encode a lat/lon pair into a geohash string of given precision (default 9).
 */
export function encode(lat: number, lon: number, precision: number = 9): string {
  let latMin = -90, latMax = 90;
  let lonMin = -180, lonMax = 180;
  let isLon = true;
  let hash = '';
  let bits = 0;
  let charIndex = 0;

  while (hash.length < precision) {
    if (isLon) {
      const mid = (lonMin + lonMax) / 2;
      if (lon >= mid) { charIndex = (charIndex << 1) | 1; lonMin = mid; }
      else { charIndex = charIndex << 1; lonMax = mid; }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) { charIndex = (charIndex << 1) | 1; latMin = mid; }
      else { charIndex = charIndex << 1; latMax = mid; }
    }
    isLon = !isLon;
    bits++;
    if (bits === 5) {
      hash += BASE32[charIndex];
      bits = 0;
      charIndex = 0;
    }
  }

  return hash;
}

/**
 * Generate prefix list at decreasing precision levels for multi-precision relay queries.
 * Example: "9v6knb4" → ["9v6knb4", "9v6knb", "9v6kn", "9v6k", "9v6", "9v"]
 * Minimum prefix length is 2 (covers ~1250km box).
 */
export function prefixes(hash: string, minLength: number = 2): string[] {
  const result: string[] = [];
  for (let len = hash.length; len >= minLength; len--) {
    result.push(hash.slice(0, len));
  }
  return result;
}

/**
 * Approximate precision table — geohash length to approximate box size.
 */
export const PRECISION_TABLE: Record<number, string> = {
  1: '~5000km',
  2: '~1250km',
  3: '~156km',
  4: '~39km',
  5: '~5km',
  6: '~1.2km',
  7: '~150m',
  8: '~19m',
  9: '~2m',
};

/**
 * Return a human-readable approximate area description for a geohash.
 */
export function approximateArea(hash: string): string {
  return PRECISION_TABLE[hash.length] || `precision ${hash.length}`;
}
