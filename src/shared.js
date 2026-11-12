// What the app, the CLI and the HTTP API share, so they read links and name files alike. (Not
// part of the library's API: the package exports only src/index.js and src/browser.js.)

import { FONTS, clipGraphemes } from './text.js';

/**
 * A name as people may type it: without accents, case, apostrophes, punctuation or "and"
 * ("Children’s" and "childrens"; "Thriller & crime", "thriller and crime" and "Thriller crime").
 * @param {string} name
 */
export const fold = (name) =>
  name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/['’‘`]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word && word !== 'and')
    .join(' ');

/** The fonts of FONTS (as it is now) by id and name, as idFor reads them. */
export const fontEntries = () => Object.entries(FONTS).map(([id, f]) => ({ id, name: f.name }));

/**
 * The id that `given` names among `entries`: an id as it is, else an id or a name in any case and
 * spacing, as a list or a link may type it ("Art Deco", "MINT", "Non-fiction"). Undefined if none.
 * @param {unknown} given @param {Iterable<{ id: string, name?: unknown }>} entries
 * @returns {string | undefined}
 */
export function idFor(given, entries) {
  if (typeof given !== 'string') return undefined;
  const list = Array.isArray(entries) ? entries : [...entries];
  if (list.some((e) => e.id === given)) return given;
  const key = fold(given);
  if (!key) return undefined;
  return (
    list.find((e) => fold(e.id) === key)?.id ?? list.find((e) => typeof e.name === 'string' && fold(e.name) === key)?.id
  );
}

/** A size of your own in a link: width x height in px. */
export const CUSTOM_SIZE = /^([1-9]\d{1,4})x([1-9]\d{1,4})$/;
/** Your own colours in a link: background, text and one to three accents. */
export const CUSTOM_PALETTE = /^custom(?:-[0-9a-f]{6}){3,5}$/;
/** Pinned variants in a link: name.value pairs joined by '-'. */
export const VARIANT = /^[a-z][a-z0-9]*\.[a-z][a-z0-9]*(?:-[a-z][a-z0-9]*\.[a-z][a-z0-9]*)*$/;

/** The colours of a link's own palette (background, text, accents), or null for a palette id. @param {string} palette */
export function customColors(palette) {
  return CUSTOM_PALETTE.test(palette)
    ? palette
        .slice('custom-'.length)
        .split('-')
        .map((h) => `#${h}`)
    : null;
}

/** A colour as typed, with its # (it starts a comment in a shell and a fragment in a URL). @param {string} c */
export const hex = (c) => (c.trim().startsWith('#') ? c.trim() : `#${c.trim()}`);

/**
 * A file name for a title: lower case, accents dropped from Latin letters, anything else that
 * isn't a letter or a digit as "-", and at most 60 characters.
 * @param {string} title
 */
export function slug(title) {
  const words = title
    // Drop accents from Latin letters only (é → e); other marks (й, ά, Japanese voicing marks,
    // Indic vowel signs) are part of the letter and come back together under NFC.
    .normalize('NFKD')
    .replace(/(\p{Script=Latin})[̀-ͯ]+/gu, '$1')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, '-')
    .replace(/^-+/, '');
  // Cut between whole characters first, so the trim also catches a separator at the cut.
  return clipGraphemes(words, 60).replace(/-+$/, '') || 'cover';
}
