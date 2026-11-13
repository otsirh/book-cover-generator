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

test('a list’s ids are kept as typed: the library reads names in any case', () => {
  assert.deepEqual(parseBookList('title,genre,palette,style\nNight,Horror,Mint,Art Deco'), [
    { title: 'Night', genre: 'Horror', palette: 'Mint', style: 'Art Deco' },
  ]);
});

test('a listed book’s options: its own values win, and its genre picks a style the shared one doesn’t suit', async () => {
  const { optionsForBook } = await import('../src/index.js');
  const shared = { style: 'bauhaus', variants: { layout: 'open' }, width: 600, height: 900 };
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
  // With a random shared style, the genre is left to createCover, which picks; a shared style that
  // doesn't exist is reported for every book.
  for (const style of ['random', undefined]) {
    assert.equal(optionsForBook({ title: 'A', genre: 'horror' }, { style, variants: { a: 'b' } }).style, style);
  }
  assert.throws(() => optionsForBook({ title: 'A', style: 'noir' }, { style: 'bauhauss' }), /Unknown style "bauhauss"/);
});

test('with no shared style, a book naming its own keeps the shared pins', async () => {
  const { optionsForBook, registerPalette, unregisterPalette } = await import('../src/index.js');
  for (const shared of [{}, { style: 'random' }]) {
    const o = optionsForBook({ title: 'Dune', style: 'silhouette' }, { ...shared, variants: { scene: 'forest' } });
    assert.equal(createCover(o).variants.scene, 'forest');
  }
  // The same style, named in another case, is the same style.
  assert.deepEqual(
    optionsForBook({ title: 'A', style: 'hollow' }, { style: 'Hollow', variants: { moon: 'blood' } }).variants,
    {
      moon: 'blood',
    },
  );
  // A palette of your own, named in a list as you named it, in any case.
  registerPalette({ id: 'Brand', bg: '#ffffff', ink: '#111111', accents: ['#ff0000'] });
  try {
    for (const row of ['Dune,Brand', 'Dune,brand']) {
      assert.equal(createCover(parseBookList(`title,palette\n${row}`)[0]).palette, 'Brand');
    }
  } finally {
    unregisterPalette('Brand');
  }
});

test('with no shared style, a book naming its own takes only the shared pins its style offers', async () => {
  const { optionsForBook } = await import('../src/index.js');
  const shared = { variants: { layout: 'top' } };
  // Stripes' layouts are plate and open: it takes none; Aurora's include top.
  assert.deepEqual(optionsForBook({ title: 'A', style: 'stripes' }, shared).variants, {});
  assert.equal(createCover(optionsForBook({ title: 'A', style: 'stripes' }, shared)).style, 'stripes');
  assert.equal(createCover(optionsForBook({ title: 'A', style: 'aurora' }, shared)).variants.layout, 'top');
  // A value no style offers throws for every book, with a style of its own or not.
  for (const book of [{ title: 'A', style: 'noir' }, { title: 'A' }]) {
    assert.throws(() => createCover(optionsForBook(book, { variants: { scene: 'forrest' } })), /No style has scene/);
  }
});

test('a shared pin no style offers is reported for every book, whichever style it gets', async () => {
  const { optionsForBook } = await import('../src/index.js');
  for (const book of [{ title: 'A', style: 'retro' }, { title: 'A', genre: 'horror' }, { title: 'A' }]) {
    assert.throws(
      () => optionsForBook(book, { style: 'silhouette', variants: { scene: 'desert' } }),
      /No style has scene "desert"/,
    );
  }
});

test('shared pins are checked on every call, as they are then', async () => {
  const { optionsForBook, styleIdFor } = await import('../src/index.js');
  const shared = { style: 'silhouette', variants: { scene: 'forest' } };
  optionsForBook({ title: 'A' }, shared);
  shared.variants.scene = 'desert';
  assert.throws(() => optionsForBook({ title: 'B', style: 'retro' }, shared), /No style has scene "desert"/);
  assert.equal(styleIdFor('art deco'), 'artdeco');
  assert.equal(styleIdFor('nothing'), undefined);
});

test('a plain line is split at the first kind of separator it uses, and a size keeps what it says', async () => {
  assert.deepEqual(parseBookList('Harry Potter – The Philosopher’s Stone | J. K. Rowling'), [
    { title: 'Harry Potter – The Philosopher’s Stone', author: 'J. K. Rowling' },
  ]);
  assert.deepEqual(parseBookList('Sapiens — Yuval Noah Harari'), [{ title: 'Sapiens', author: 'Yuval Noah Harari' }]);
  const [book] = parseBookList('title;width\nDune;1600 px');
  assert.equal(book.width, /** @type {any} */ ('1600 px'));
  assert.throws(() => createCover(book), /width must be a number from 50 to 10000, got "1600 px"/);
  // An undefined key (an empty cell) leaves the shared value alone.
  const { optionsForBook } = await import('../src/index.js');
  const o = optionsForBook(
    { title: 'Dune', style: undefined, width: undefined, palette: undefined },
    { style: 'retro', palette: 'mint', width: 1600, height: 2560 },
  );
  assert.deepEqual(o, { style: 'retro', palette: 'mint', width: 1600, height: 2560, title: 'Dune' });
});

test('colours as a link writes them: six hex digits, or as given for the reader to refuse', async () => {
  const { sixDigits, customPalette } = await import('../src/link.js');
  assert.equal(sixDigits('#ABC'), '#aabbcc');
  assert.equal(sixDigits('abcd'), '#aabbcc');
  assert.equal(sixDigits('#11223344'), '#112233');
  for (const odd of ['#1a2b3c4', 'red', '#12345']) assert.equal(sixDigits(odd), odd);
  assert.equal(customPalette(['#000', '#FFF', '#f00']), 'custom-000000-ffffff-ff0000');
});

test('only the list’s own column names are read, not an object’s (constructor, __proto__)', () => {
  assert.deepEqual(parseBookList('title,constructor,__proto__,toString\nDune,x,y,z\n'), [{ title: 'Dune' }]);
  assert.deepEqual(parseBookList('{"title":"Dune","constructor":"x","__proto__":{"a":1}}\n'), [{ title: 'Dune' }]);
});
