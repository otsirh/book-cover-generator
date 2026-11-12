import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBookList, createCover } from '../src/index.js';

test('CSV with a header: known columns, quotes, commas, line breaks and a BOM', () => {
  const csv =
    '﻿Title,Author,Subtitle,Style,Width,Texture,Shelf\r\n"Fish, Chips","O\'Brien ""Bob""",,minimal,1600,yes,ignored\r\n"Two\nLines",Ana,A Novel,,,no,\r\n,No title,,,,,\r\n';
  assert.deepEqual(parseBookList(csv), [
    { title: 'Fish, Chips', author: 'O\'Brien "Bob"', style: 'minimal', width: 1600, texture: true },
    { title: 'Two\nLines', author: 'Ana', subtitle: 'A Novel', texture: false },
  ]);
});

test('TSV with a header, and JSON lines', () => {
  assert.deepEqual(parseBookList('title\tauthor\tcase\nDune\tFrank Herbert\tupper\n'), [
    { title: 'Dune', author: 'Frank Herbert', titleCase: 'upper' },
  ]);
  assert.deepEqual(parseBookList('{"title":"A","seed":7,"palette":"mint"}\n{"title":"B","series":"Two"}\n'), [
    { title: 'A', seed: 7, palette: 'mint' },
    { title: 'B', series: 'Two' },
  ]);
  assert.throws(() => parseBookList('{"title":"A"}\n{nope}'), /Line 2 is not valid JSON/);
});

test('one book per line, with a bar, a dash or a tab between title, author and subtitle', () => {
  assert.deepEqual(
    parseBookList('Dune | Frank Herbert\nThe Hobbit — J. R. R. Tolkien — There and Back Again\n\nSolo\nTab\tAuthor\n'),
    [
      { title: 'Dune', author: 'Frank Herbert' },
      { title: 'The Hobbit', author: 'J. R. R. Tolkien', subtitle: 'There and Back Again' },
      { title: 'Solo' },
      { title: 'Tab', author: 'Author' },
    ],
  );
  // A comma alone doesn't split: titles have them.
  assert.deepEqual(parseBookList('Eats, Shoots & Leaves'), [{ title: 'Eats, Shoots & Leaves' }]);
  assert.deepEqual(parseBookList(''), []);
});

test('the books it reads make covers', () => {
  for (const book of parseBookList('title,author,style\nOne,A,swiss\nTwo,B,noir')) {
    assert.match(createCover({ ...book, seed: 's' }).svg, /^<svg/);
  }
});

test('numbers as titles, semicolon CSV, a lone title column, and the right line in errors', () => {
  assert.deepEqual(parseBookList('{"title":1984,"author":"Orwell","seed":7}\n{"title":"Dune"}'), [
    { title: '1984', author: 'Orwell', seed: 7 },
    { title: 'Dune' },
  ]);
  assert.deepEqual(parseBookList('title;author\nDune;Frank Herbert\n"A; B";C'), [
    { title: 'Dune', author: 'Frank Herbert' },
    { title: 'A; B', author: 'C' },
  ]);
  assert.deepEqual(parseBookList('title\nDune\nThe Hobbit'), [{ title: 'Dune' }, { title: 'The Hobbit' }]);
  assert.throws(() => parseBookList('{"title":"a"}\n\n\n{bad}'), /Line 4 is not valid JSON/);
});

test('a book list can give each book a genre', () => {
  assert.deepEqual(parseBookList('title,author,genre\nNight,Ann,horror'), [
    { title: 'Night', author: 'Ann', genre: 'horror' },
  ]);
});

test('ids in a list are read in lower case, as the app’s menus name them', () => {
  assert.deepEqual(parseBookList('title,genre,palette,style\nNight,Horror,Mint,Hollow'), [
    { title: 'Night', genre: 'horror', palette: 'mint', style: 'hollow' },
  ]);
});

test('a listed book’s options: its own values win, and its genre picks a style the shared one doesn’t suit', async () => {
  const { optionsForBook } = await import('../src/index.js');
  const shared = { style: 'bauhaus', variants: { layout: 'x' }, width: 600, height: 900 };
  assert.deepEqual(optionsForBook({ title: 'A', genre: 'horror' }, shared), {
    ...shared,
    style: 'random',
    variants: {},
    title: 'A',
    genre: 'horror',
  });
  // A genre the shared style suits keeps it, pins and all; a size replaces both sides.
  assert.deepEqual(optionsForBook({ title: 'A', genre: 'children', width: 800 }, shared), {
    ...shared,
    width: 800,
    height: undefined,
    title: 'A',
    genre: 'children',
  });
  // With a random or unknown shared style, the genre is left to createCover (which picks, or says so).
  for (const style of ['random', 'bauhauss', undefined]) {
    assert.equal(optionsForBook({ title: 'A', genre: 'horror' }, { style, variants: { a: 'b' } }).style, style);
  }
});
