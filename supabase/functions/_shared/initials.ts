/**
 * Two letters for an avatar without a photo, shared by the game server (seat initials) and the app
 * (Avatar), so a player looks alike everywhere: spaces are dropped, then the first two characters
 * are taken and upper-cased.
 *
 * "Characters" are user-perceived ones (grapheme clusters) where the runtime can tell them apart,
 * otherwise code points: an emoji or another astral symbol (a surrogate pair) is never cut in half,
 * and a Cyrillic letter typed as base + combining mark ("и" + U+0306) stays the one letter "й" (NFC).
 */
type Segmenter = { segment(input: string): Iterable<{ segment: string }> };
type SegmenterConstructor = new (locale?: string, options?: { granularity: 'grapheme' }) => Segmenter;

const SegmenterClass = (Intl as unknown as { Segmenter?: SegmenterConstructor }).Segmenter;
const graphemes = SegmenterClass ? new SegmenterClass(undefined, { granularity: 'grapheme' }) : null;

function characters(text: string): string[] {
  return graphemes ? Array.from(graphemes.segment(text), (part) => part.segment) : Array.from(text);
}

export function initialsOf(name: string): string {
  const compact = (name ?? '').normalize('NFC').replace(/\s+/gu, '');
  return characters(compact).slice(0, 2).join('').toUpperCase() || '??';
}
