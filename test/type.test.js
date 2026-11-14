import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitLead, stackLines, fitStack, drawStack, titleBlock, authorFit } from '../src/type.js';
import { FONTS, fitText, drawText, markExtent, defaultMinSize } from '../src/text.js';
import { createRng } from '../src/core.js';

/** A minimal style context. @param {Partial<import('../src/index.js').StyleContext>} [o] */
const ctx = (o = {}) =>
  /** @type {import('../src/index.js').StyleContext} */ ({
    title: 'The Lighthouse Keeper',
    author: 'Mara Ellison',
    subtitle: '',
    W: 600,
    H: 900,
    S: 600,
    u: 1,
    m: 42,
    rng: createRng('t'),
    p: /** @type {any} */ ({}),
    id: (/** @type {string} */ n) => n,
    ...o,
  });

test('splitLead and stackLines keep words joined by a no-break space', () => {
  assert.deepEqual(splitLead('The\u00A0Road'), { lead: '', main: 'The\u00A0Road' });
  assert.deepEqual(stackLines('Big\u00A0Sur Nights'), ['Big\u00A0Sur', 'Nights']);
});

test('splitLead takes a leading English article off', () => {
  assert.deepEqual(splitLead('The Lighthouse Keeper'), { lead: 'The', main: 'Lighthouse Keeper' });
  assert.deepEqual(splitLead('a little life'), { lead: 'a', main: 'little life' });
  assert.deepEqual(splitLead('Theater of War'), { lead: '', main: 'Theater of War' });
  assert.deepEqual(splitLead('The'), { lead: '', main: 'The' });
});

test('stackLines joins small words to the next word', () => {
  assert.deepEqual(stackLines('Lord of the Rings'), ['Lord', 'of the Rings']);
  assert.deepEqual(stackLines('Pride and Prejudice'), ['Pride', 'and Prejudice']);
  assert.deepEqual(stackLines('Gone with the'), ['Gone', 'with the']);
  assert.deepEqual(stackLines('of'), ['of']);
});

test('fitStack validates, rejects unsuitable text and fills the width', () => {
  assert.throws(() => fitStack('A B', /** @type {any} */ ({ maxWidth: 100 })), /maxSize/);
  for (const minSize of [NaN, 0, -1]) {
    assert.throws(() => fitStack('Big Bold Words', { maxWidth: 300, maxHeight: 5, maxSize: 100, minSize }), /minSize/);
  }
  assert.equal(fitStack('Single', { maxWidth: 500, maxSize: 200 }), null);
  assert.equal(fitStack('one two three four five six', { maxWidth: 500, maxSize: 200 }), null);
  const fit = fitStack('Signal Lost', { font: FONTS.sans, maxWidth: 500, maxHeight: 400, maxSize: 300, upper: true });
  assert.ok(fit);
  assert.equal(fit.lines.length, 2);
  assert.ok(fit.height + fit.descent <= 400 + 0.01);
});

test('stacked lowercase lines leave room for descenders', () => {
  const fit = fitStack('Sleeping Giants', { font: FONTS.sans, maxWidth: 516, maxHeight: 600, maxSize: 300 });
  assert.ok(fit);
  const svg = drawStack(fit, { x: 0, y: 0, lineFills: [undefined, '#f00'] });
  const ys = [...svg.matchAll(/ y="([\d.]+)"/g)].map((m) => Number(m[1]));
  const [a, b] = fit.lines;
  // The gap between baselines covers the first line's descenders and the second line's caps.
  assert.ok(ys[1] - ys[0] >= b.size * fit.cap + a.size * 0.22 - 0.2, `${ys[1] - ys[0]}`);
  assert.match(svg, /fill="#f00">Giants</);
});

test('drawStack escapes the font family and per-line colours', () => {
  const fit = fitStack('Hello World', { font: { family: '"Fira Sans", serif' }, maxWidth: 400, maxSize: 100 });
  assert.ok(fit);
  const svg = drawStack(fit, { x: 0, y: 0, lineFills: ['url("#g")'] });
  assert.match(svg, /font-family="&quot;Fira Sans&quot;, serif"/);
  assert.match(svg, /fill="url\(&quot;#g&quot;\)"/);
});

test('titleBlock never exceeds its height budget', () => {
  const rng = createRng('blocks');
  const words = [
    'The',
    'Lighthouse',
    'Keeper',
    'of',
    'Small',
    'Gods',
    'Signal',
    'Lost',
    'gypsy',
    'quay',
    'Winter',
    'A',
  ];
  for (let i = 0; i < 300; i++) {
    const title = Array.from({ length: rng.int(1, 9) }, () => rng.pick(words)).join(' ');
    const subtitle = rng.bool() ? Array.from({ length: rng.int(1, 6) }, () => rng.pick(words)).join(' ') : '';
    const maxSize = rng.float(40, 220);
    const maxHeight = rng.float(maxSize * 0.6, 500);
    const block = titleBlock(ctx({ title, subtitle }), {
      font: rng.pick([FONTS.serif, FONTS.sans, FONTS.condensed]),
      upper: rng.bool(),
      stack: rng.bool(),
      maxWidth: rng.float(200, 520),
      maxHeight,
      maxSize,
    });
    assert.ok(block.height <= maxHeight + 0.5, `"${title}" / "${subtitle}": ${block.height} > ${maxHeight}`);
  }
});

test('titleBlock sets the lead small above the title, and the subtitle below', () => {
  const block = titleBlock(ctx({ subtitle: 'A Novel' }), { maxWidth: 500, maxHeight: 500, maxSize: 120 });
  const svg = block.draw({ x: 0, y: 0, fill: '#000', subtitleFill: '#00f' });
  const the = svg.indexOf('>THE<');
  const main = svg.indexOf('Lighthouse');
  const sub = svg.indexOf('A Novel');
  assert.ok(the > -1 && main > the && sub > main, svg);
  assert.match(svg, /fill="#00f"[^>]*opacity="0.85"/);
  assert.equal(block.lines, 2);
  assert.equal(block.stacked, false);
  const flat = titleBlock(ctx(), { maxWidth: 500, maxHeight: 500, maxSize: 120, lead: false, subtitle: false });
  assert.doesNotMatch(flat.draw({ x: 0, y: 0, fill: '#000' }), />THE</);
});

test('authorFit is readable by default and empty without an author', () => {
  const a = authorFit(ctx());
  assert.equal(a.lines[0], 'MARA ELLISON');
  assert.ok(a.size > 20);
  assert.equal(authorFit(ctx({ author: '' })).lines.length, 0);
});

test('titleBlock stays within even a very small budget', () => {
  const block = titleBlock(ctx({ subtitle: 'And a subtitle' }), { maxWidth: 500, maxHeight: 12, maxSize: 100 });
  assert.ok(block.height <= 12.5, `height ${block.height}`);
});

test('titleBlock drops the subtitle before crushing the title', () => {
  const c = ctx({ subtitle: 'A Novel', W: 600, H: 600, S: 600 });
  for (const maxHeight of [40, 50, 60, 70, 80, 90, 100]) {
    const block = titleBlock(c, { maxWidth: 516, maxHeight, maxSize: 120, font: FONTS.sans, weight: 700 });
    // fitText's default minimum for a 120 px title is 26.4 px; the subtitle is 21.6 px.
    assert.ok(block.size >= 26.4 - 1e-9, `${maxHeight}: title at ${block.size}px`);
    assert.ok(block.height <= maxHeight + 0.5, `${maxHeight}: block ${block.height}`);
  }
  // With room to spare, the subtitle stays.
  const roomy = titleBlock(c, { maxWidth: 516, maxHeight: 300, maxSize: 120, font: FONTS.sans, weight: 700 });
  assert.match(roomy.draw({ x: 0, y: 0, fill: '#000' }), /A Novel/);
});

test('stacks leave room for descenders in Cyrillic, Greek and accented Latin too', () => {
  for (const text of ['Музыка дружбы', 'Φως και ψυχή', 'Façade Ząbki', 'Vịnh Hạ Long']) {
    const fit = fitStack(text, { maxWidth: 500, maxSize: 200 });
    assert.ok(fit, text);
    assert.ok(fit.descent >= fit.lines[fit.lines.length - 1].size * 0.2, `${text}: descent ${fit.descent}`);
  }
  const caps = fitStack('MUSIC HALL', { maxWidth: 500, maxSize: 200 });
  assert.ok(caps && caps.descent < caps.lines[1].size * 0.1);
});

test('stacks are never smaller than fitText would go', () => {
  for (const maxWidth of [30, 40, 60]) {
    const fit = fitStack('Big Extraordinarily', { maxWidth, maxSize: 12 });
    if (fit) for (const line of fit.lines) assert.ok(line.size >= 6, `${maxWidth}: ${line.text} at ${line.size}`);
  }
});

test('titleBlock gives the title the room the lead line does not need', () => {
  const c = ctx({ title: 'The End' });
  const block = titleBlock(c, { maxWidth: 516, maxHeight: 150, maxSize: 300, minSize: 20 });
  assert.match(block.draw({ x: 0, y: 0, fill: '#000' }), />THE</);
  assert.ok(block.size > 95, `title at ${block.size}px`);
  assert.ok(block.height <= 150.5, `block ${block.height}`);
});

test('layout helpers reject a missing box instead of drawing NaN', () => {
  assert.throws(() => fitStack('Signal Lost', /** @type {any} */ ({ maxSize: 100 })), /fitStack: `maxWidth`/);
  assert.throws(
    () => titleBlock(ctx(), /** @type {any} */ ({ maxWidth: 300, maxSize: 60 })),
    /titleBlock: `maxHeight`/,
  );
  assert.throws(
    () => titleBlock(ctx(), /** @type {any} */ ({ maxHeight: 300, maxSize: 60 })),
    /titleBlock: `maxWidth`/,
  );
});

test('a title block reports its smallest line, which is the size for an unstacked title', () => {
  const stacked = titleBlock(ctx({ title: 'Signal Lost Forever' }), {
    maxWidth: 400,
    maxHeight: 600,
    maxSize: 200,
    stack: true,
    font: FONTS.sans,
  });
  assert.ok(stacked.stacked);
  assert.ok(stacked.smallest < stacked.size, `${stacked.smallest} vs ${stacked.size}`);
  const plain = titleBlock(ctx(), { maxWidth: 400, maxHeight: 600, maxSize: 60 });
  assert.equal(plain.smallest, plain.size);
});

test('textColor falls back exactly like inkOn for a single background', async () => {
  const { textColor } = await import('../src/styles/util.js');
  const { inkOn } = await import('../src/core.js');
  const p = /** @type {any} */ ({ ink: '#1a1a1a', bg: '#f4e9d8', accents: ['#f4e0d0', '#e8d8c8', '#c00000'] });
  for (const bg of ['#ffffff', '#000000', '#7f7f7f', '#f4e9d8']) assert.equal(textColor(p, bg), inkOn(bg, p), bg);
  assert.equal(textColor(p, '#ffffff', ['#c00000']), '#c00000');
});

test('leads in other languages, and only leads of three letters or more on their own line', () => {
  assert.deepEqual(splitLead('Les Misérables'), { lead: 'Les', main: 'Misérables' });
  assert.deepEqual(splitLead('La Peste'), { lead: 'La', main: 'Peste' });
  assert.deepEqual(splitLead('Der Zauberberg'), { lead: 'Der', main: 'Zauberberg' });
  assert.deepEqual(splitLead('Die Hard'), { lead: '', main: 'Die Hard' });
  const lead = (/** @type {string} */ title) =>
    titleBlock(ctx({ title }), { maxWidth: 500, maxHeight: 600, maxSize: 80 }).draw({ x: 0, y: 0, fill: '#000' });
  assert.match(lead('The Lighthouse Keeper'), />THE</);
  // "A" stays with the title instead of floating above it.
  assert.doesNotMatch(lead('A Map of Quiet Places'), />A</);
  assert.match(lead('A Map of Quiet Places'), /A Map/);
});

test('stacks keep short words of any language with the next word', () => {
  assert.deepEqual(stackLines('Майсторът и Маргарита'), ['Майсторът', 'и Маргарита']);
  assert.deepEqual(stackLines('Cien años de soledad'), ['Cien', 'años', 'de soledad']);
});

test('a short one-word title grows past the usual cap, within the box', () => {
  const big = titleBlock(ctx({ title: 'Dune' }), { maxWidth: 500, maxHeight: 400, maxSize: 60 });
  assert.ok(big.size > 60, `size ${big.size}`);
  assert.ok(big.width <= 500 + 0.5 && big.height <= 400.5);
  const long = titleBlock(ctx({ title: 'Dune Messiah' }), { maxWidth: 500, maxHeight: 400, maxSize: 60 });
  assert.ok(long.size <= 60);
});

test('author names in scripts without capitals are set larger, untracked; wrapped caps get more leading', () => {
  const kanji = authorFit(ctx({ author: '村上春樹' }));
  const latin = authorFit(ctx({ author: 'Mara Ellison' }));
  assert.ok(kanji.size > latin.size, `${kanji.size} vs ${latin.size}`);
  assert.equal(kanji.letterSpacing, 0);
  assert.equal(latin.lineHeight, 1.35);
  assert.equal(authorFit(ctx({ author: 'Mara Ellison' }), { upper: false, letterSpacing: 0 }).lineHeight, 1.15);
});

test('fitTitleWith gives up art only when the title gains from it', async () => {
  const { fitTitleWith } = await import('../src/styles/util.js');
  // Every candidate sets the title the same: held back by its width, it can't grow.
  const { value } = fitTitleWith(ctx({ title: 'Lighthouse' }), [100, 200, 300], () => ({
    maxWidth: 60,
    maxHeight: 300,
    maxSize: 40,
    lead: false,
  }));
  assert.equal(value, 100);
  // A taller box that does set it larger is taken.
  const grown = fitTitleWith(ctx({ title: 'The Lighthouse Keeper of the Northern Isles' }), [40, 300], (h) => ({
    maxWidth: 300,
    maxHeight: h,
    maxSize: 60,
  }));
  assert.equal(grown.value, 300);
});

test('one long word is hyphenated rather than shrunk to a hairline', () => {
  const plain = fitText('Internationalization', { font: FONTS.sans, maxWidth: 200, maxSize: 120 });
  const split = fitText('Internationalization', { font: FONTS.sans, maxWidth: 200, maxSize: 120, hyphenate: 40 });
  assert.equal(split.lines.length, 2);
  assert.ok(split.lines[0].endsWith('-'), split.lines.join(' | '));
  assert.equal(split.lines.join('').replace('-', ''), 'Internationalization');
  assert.ok(split.size > plain.size * 1.15, `${split.size} vs ${plain.size}`);
  // Not for words that are already large enough, or scripts without spaces.
  assert.equal(fitText('Internationalization', { maxWidth: 2000, maxSize: 60, hyphenate: 40 }).lines.length, 1);
  assert.equal(
    fitText('国際化国際化国際化国際化', { maxWidth: 100, maxSize: 60, hyphenate: 40 }).lines[0].endsWith('-'),
    false,
  );
  // A word broken because nothing else fits gets a hyphen at each break.
  const broken = fitText('INTERNATIONALIZATION', {
    font: FONTS.sans,
    maxWidth: 80,
    maxSize: 30,
    minSize: 30,
    maxLines: 6,
  });
  assert.ok(broken.lines.length > 1);
  for (const line of broken.lines.slice(0, -1)) assert.ok(line.endsWith('-'), broken.lines.join(' | '));
});

test('a one-letter word stays with the next word when lines wrap', () => {
  for (const width of [120, 160, 200, 260]) {
    const fit = fitText('Майсторът и Маргарита', {
      font: FONTS.serif,
      maxWidth: width,
      maxSize: 30,
      minSize: 30,
      maxLines: 6,
    });
    for (const line of fit.lines) assert.notEqual(line.trim(), 'и', fit.lines.join(' | '));
    assert.ok(
      fit.lines.some((line) => line.includes('и Маргарита')),
      fit.lines.join(' | '),
    );
  }
});

test('a run of one-letter words still wraps', () => {
  const fit = fitText('A B C D E F G H I J K L M N O P', { maxWidth: 200, maxSize: 60 });
  assert.ok(fit.lines.length > 1, fit.lines.join(' | '));
  assert.equal(fit.size, 60);
});

test('spaced punctuation stays with its word when lines wrap', () => {
  for (const title of ['« Le Petit Prince »', 'Where Is Everybody ?!', 'Le Mystère ( de la chambre jaune )']) {
    for (const maxWidth of [150, 200, 250, 300]) {
      const fit = fitText(title, { font: FONTS.serif, maxWidth, maxSize: 30, minSize: 30, maxLines: 8 });
      for (const line of fit.lines) {
        assert.doesNotMatch(line, /^[»?!)]/u, `${title}: ${fit.lines.join(' | ')}`);
        assert.doesNotMatch(line, /[«(]$/u, `${title}: ${fit.lines.join(' | ')}`);
      }
    }
  }
});

test('fitText shrinks until the text fits, however far maxSize is above minSize', () => {
  const opts = { maxWidth: 40, maxHeight: 20, minSize: 0.5, maxLines: 3 };
  const near = fitText('Hello world again', { ...opts, maxSize: 1000 });
  const far = fitText('Hello world again', { ...opts, maxSize: 10000 });
  assert.equal(far.truncated, false);
  assert.ok(far.size > near.size * 0.9, `${far.size} vs ${near.size}`);
});

test('no-break spaces hold next to scripts written without spaces, too', () => {
  // The words don't fit on one line at 20 px: they shrink rather than break at the no-break space.
  const fit = fitText('東京\u00A0大阪', { maxWidth: 70, maxSize: 20, minSize: 10 });
  assert.equal(fit.lines.length, 1, fit.lines.join(' | '));
  const emoji = fitText('Je t’aime\u00A0❤️ pour toujours', { maxWidth: 95, maxSize: 20, minSize: 20, maxLines: 8 });
  for (const line of emoji.lines) assert.doesNotMatch(line, /^❤️|\u00A0$/u, emoji.lines.join(' | '));
});

test('scripts whose letters join are set without letter-spacing', () => {
  const opts = { maxWidth: 400, maxSize: 60, letterSpacing: 0.1 };
  assert.equal(fitText('مدن الملح', opts).letterSpacing, 0);
  assert.equal(fitText('Salt Cities', opts).letterSpacing, 0.1);
  const stack = fitStack('مدن الملح الكبرى', { ...opts, maxHeight: 400, letterSpacing: -0.02 });
  assert.ok(stack);
  assert.equal(stack.letterSpacing, 0);
});

test('small text on a small cover can still shrink', () => {
  assert.equal(defaultMinSize(5), 2.5);
  assert.equal(defaultMinSize(20), 6);
  assert.equal(defaultMinSize(100), 22);
});

test('accents on capitals and marks above the letters get room above the first line', () => {
  assert.deepEqual(markExtent('Lighthouse'), { above: 0, below: 0 });
  assert.ok(markExtent('ÉTÉ').above > 0.3);
  assert.equal(markExtent('été').above, 0);
  assert.ok(markExtent('ภาษาไทย').above >= 0.5 && markExtent('ภาษาไทย').below >= 0.5);
  const opts = { font: FONTS.sans, maxWidth: 1000, maxSize: 100 };
  const plain = fitText('ETE', opts);
  const accented = fitText('ÉTÉ', opts);
  assert.equal(plain.size, accented.size);
  const extra = (accented.above ?? 0) * accented.size;
  assert.ok(extra > 30);
  assert.ok(Math.abs(accented.height - plain.height - extra) < 1e-9);
  // The first baseline moves down by the same amount, so the accents start at y.
  const baseline = (/** @type {string} */ svg) => Number(/ y="([\d.]+)"/.exec(svg)?.[1]);
  assert.ok(
    Math.abs(baseline(drawText(accented, { x: 0, y: 0 })) - baseline(drawText(plain, { x: 0, y: 0 })) - extra) < 0.1,
  );
  // A fit never grows past its box because of it.
  const tight = fitText('ÉTÉ', { ...opts, maxHeight: 80 });
  assert.ok(tight.height <= 80 + 1e-9, String(tight.height));
});

test('lines leave room for the next line’s accents and marks', () => {
  for (const title of ['ŽÍT NEBO NEŽÍT', 'बहुत लंबी हिन्दी कहानी', 'ภาษาไทยที่มีวรรณยุกต์ ภาษาไทย']) {
    const fit = fitText(title, {
      font: FONTS.sans,
      maxWidth: 260,
      maxSize: 60,
      minSize: 60,
      lineHeight: 0.92,
      maxLines: 6,
    });
    assert.ok(fit.lines.length > 1, fit.lines.join(' | '));
    const later = Math.max(...fit.lines.slice(1).map((line) => markExtent(line).above));
    assert.ok(fit.lineHeight >= fit.cap + later, `${title}: ${fit.lineHeight}`);
  }
  // Text without them keeps the line height it asked for.
  const plain = fitText('ZIT NEBO NEZIT', {
    font: FONTS.sans,
    maxWidth: 260,
    maxSize: 60,
    minSize: 60,
    lineHeight: 0.92,
  });
  assert.equal(plain.lineHeight, 0.92);
  // Stacked lines too: the first line's accents fit inside the stack's height.
  const stack = fitStack('Été Indien', { font: FONTS.sans, maxWidth: 500, maxHeight: 600, maxSize: 300, upper: true });
  assert.ok(stack);
  const [first] = stack.lines;
  assert.ok((first.above ?? 0) > 0.3);
  const y = Number(/ y="([\d.]+)"/.exec(drawStack(stack, { x: 0, y: 0 }))?.[1]);
  assert.ok(Math.abs(y - first.size * ((first.above ?? 0) + stack.cap)) < 0.1);
});

test('a stack keeps the lines a title was typed on', () => {
  assert.deepEqual(stackLines('Salt and\nStatic'), ['Salt and', 'Static']);
  assert.deepEqual(stackLines('Salt and Static'), ['Salt', 'and Static']);
  assert.deepEqual(stackLines('A Map of\nQuiet  Places'), ['A Map of', 'Quiet Places']);
});
test('a unit too wide for its line is never cut so that a closing mark starts a line, or a space ends one', async () => {
  const { wrapText } = await import('../src/text.js');
  assert.deepEqual(wrapText('! »', 8.6, 5, { font: FONTS.serif }), ['!', '»']);
  // A word that fits whole stays whole: its mark starting the next line is the lesser fault than
  // the word split with no hyphen. A web address still breaks after its dots and slashes.
  assert.deepEqual(wrapText('Bonjour !', 12, 44, { font: FONTS.serif }), ['Bonjour', '!']);
  assert.deepEqual(wrapText('« Bonjour »', 12, 54, { font: FONTS.serif }), ['« Bonjour', '»']);
  for (const line of wrapText('www.example.com/a/long/path', 27, 174, { font: FONTS.serif }))
    assert.doesNotMatch(line, /^[.]/, line);
  const fit = fitText('« Donaudampfschifffahrtsgesellschaftskapitänswitwenrentenversicherung »', {
    font: FONTS.serif,
    maxWidth: 146,
    maxSize: 40,
    maxLines: 3,
    maxHeight: 240,
  });
  for (const line of fit.lines) assert.doesNotMatch(line, /^[ »]|[ «]$/, line);
  const blurb = wrapText('Wer kennt Rindfleischetikettierungsüberwachungsaufgabenübertragungsgesetz ?', 10.7, 260, {
    font: FONTS.serif,
  });
  for (const line of blurb) assert.doesNotMatch(line, /^[ ?]|[ ]$/, line);
});

test('fitText in a box narrower than a letter at its smallest size sets one per line, cutting nothing that fits', () => {
  const fit = fitText('WWWW', { font: FONTS.serif, maxWidth: 8, maxHeight: 40, maxSize: 100 });
  assert.deepEqual(fit.lines, ['W', 'W', 'W', 'W']);
  assert.equal(fit.truncated, false);
  assert.ok(fit.width <= 8 && fit.height <= 40, `${fit.width} × ${fit.height}`);
});
