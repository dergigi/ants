import { extractAudioUrls, extractVideoUrls, extractNonMediaUrls, getMediaUrlType, isAmbiguousAudioVideoUrl } from '../urlUtils';
import { stripMediaUrls } from '../textUtils';

test.each(['m4a', 'mp3', 'wav', 'flac', 'aac', 'opus'])('renders and strips %s audio links', (extension) => {
  const url = `https://media.example/song.${extension}?token=123#play`;
  expect(extractAudioUrls(`Listen ${url}`)).toEqual([url]);
  expect(extractNonMediaUrls(url)).toEqual([]);
  expect(stripMediaUrls(`Listen ${url}`)).toBe('Listen');
});

test.each(['ogg', 'webm'])('preserves ambiguous %s links for video with audio fallback', (extension) => {
  const url = `https://media.example/track.${extension}?token=123`;
  expect(extractAudioUrls(url)).toEqual([]);
  expect(extractVideoUrls(url)).toEqual([url]);
  expect(isAmbiguousAudioVideoUrl(url)).toBe(true);
});

test.each([
  'https://example.com/search?q=music.mp3',
  'https://example.com/search?q=cat.png&sort=latest',
  'https://example.com/record.mp3.txt',
  'https://example.com/folder.mp4/article',
  'https://example.com/#song.mp3',
])('keeps unrelated URL intact: %s', (url) => {
  expect(getMediaUrlType(url)).toBeNull();
  expect(stripMediaUrls(`See ${url}`)).toBe(`See ${url}`);
  expect(extractNonMediaUrls(url)).toEqual([url]);
});

test.each(['name', 'filename'])('supports explicit %s parameters without leaving URL fragments', (param) => {
  const url = `https://media.example/download?${param}=song.mp3&token=123`;
  expect(extractAudioUrls(url)).toEqual([url]);
  expect(stripMediaUrls(`Listen ${url} now`)).toBe('Listen now');
});

test('keeps standalone query-like text', () => {
  expect(stripMediaUrls('What? Search for a song.mp3')).toBe('What? Search for a song.mp3');
});
