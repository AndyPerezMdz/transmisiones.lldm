import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCatalog } from '../public/js/catalog.js';
import { wordsToDigits } from '../public/js/detector.js';
import { parseSongText, songToText, parseSongBook, normalizeSong } from '../public/js/song-text.js';

const bible = JSON.parse(readFileSync(new URL('../public/data/rv1909.json', import.meta.url)));
const songs = [
  { id: 'a', kind: 'hymn', number: 246, title: 'Canto largo de prueba', sections: [{ type: 'verse', label: 'Estrofa 1', lines: Array.from({ length: 10 }, (_, i) => 'línea ' + i) }] },
  { id: 'b', kind: 'coro', number: 7, title: 'Alabemos con alegría', sections: [{ type: 'chorus', label: 'Coro', lines: ['uno', 'dos'] }] },
  { id: 'c', kind: 'hymn', number: 1, title: 'Primer himno de muestra', sections: [{ type: 'verse', label: 'Estrofa 1', lines: ['texto que se puede buscar'] }] }
];
const cat = createCatalog({ songs, bible });
const labels = (text, opts) => cat.detector.detect(text, opts).items.map(i => i.label);

test('la Biblia está completa', () => {
  assert.equal(bible.books.length, 66);
  assert.equal(bible.books.reduce((n, b) => n + b.chapters.reduce((m, c) => m + c.length, 0), 0), 31084);
});

test('números en palabras', () => {
  assert.equal(wordsToDigits('juan tres dieciseis'), 'juan 3 16');
  assert.equal(wordsToDigits('himno doscientos cuarenta y cinco'), 'himno 245');
  assert.equal(wordsToDigits('salmo ciento diecinueve'), 'salmo 119');
});

test('citas habladas', () => {
  assert.deepEqual(labels('Vamos a leer en Juan capítulo tres versículo dieciséis'), ['Juan 3:16']);
  assert.deepEqual(labels('abramos en Romanos 8:28'), ['Romanos 8:28']);
  assert.deepEqual(labels('leamos el salmo veintitrés'), ['Salmos 23']);
  assert.deepEqual(labels('en primera de Corintios capítulo trece del versículo cuatro al siete'), ['1 Corintios 13:4-7']);
  assert.deepEqual(labels('la segunda carta a los corintios cinco diecisiete'), ['2 Corintios 5:17']);
  assert.deepEqual(labels('primera de Juan cuatro ocho'), ['1 Juan 4:8']);
  assert.deepEqual(labels('el evangelio según San Mateo capítulo cinco versículos tres al doce'), ['Mateo 5:3-12']);
  assert.deepEqual(labels('lucas 15 del 11 al 32'), ['Lucas 15:11-32']);
  assert.deepEqual(labels('Isaías cincuenta y tres cinco'), ['Isaías 53:5']);
});

test('versículo relativo usa el contexto', () => {
  const first = cat.detector.detect('Juan capítulo 3 versículo 16');
  assert.deepEqual(cat.detector.detect('y ahora el versículo diecisiete', { context: first.context }).items.map(i => i.label), ['Juan 3:17']);
});

test('no inventa citas', () => {
  assert.deepEqual(labels('el hermano Juan nos acompaña hoy'), []);
  assert.deepEqual(labels('Juan 99:1'), []);
  assert.deepEqual(labels('mi casa es tu casa, he dicho'), []);
  assert.deepEqual(labels('ahora el coro va a cantar'), []);
});

test('himnos, coros y tema', () => {
  assert.match(labels('cantemos el himno número doscientos cuarenta y seis')[0], /^Himno 246 · /);
  assert.match(labels('vamos a cantar el coro 7')[0], /^Coro 7 · /);
  assert.ok(labels('cantemos el coro alabemos con alegría').some(l => l.startsWith('Coro 7 ')));
  assert.deepEqual(cat.detector.detect('Hermanos, el tema de hoy es: La fe que vence al mundo. Oremos').items.map(i => i.text), ['La fe que vence al mundo']);
});

test('buscador manual', () => {
  assert.equal(cat.search('jn 3 16')[0].label, 'Juan 3:16');
  assert.equal(cat.search('1co 13:4-7')[0].label, '1 Corintios 13:4-7');
  assert.match(cat.search('h246')[0].label, /^Himno 246/);
  assert.match(cat.search('c7')[0].label, /^Coro 7/);
  assert.equal(cat.search('t: El amor de Dios')[0].kind, 'theme');
  assert.equal(cat.search('se puede buscar')[0].number, 1);
});

test('diapositivas', () => {
  assert.equal(cat.resolve({ kind: 'bible', book: 'Juan', chapter: 3, from: 16, to: 18 }).slides.length, 3);
  assert.equal(cat.resolve({ kind: 'bible', book: 'Salmos', chapter: 23 }).slides.length, 6);
  assert.equal(cat.resolve({ kind: 'bible', book: 'Juan', chapter: 3, from: 16 }).slides[0].text.startsWith('Porque de tal manera'), true);
  const h = cat.resolve({ kind: 'hymn', number: 246 });
  assert.equal(h.slides.length, 3); // portada + 10 líneas en 2 partes de 5
  assert.ok(h.slides.every(s => s.lines.length <= 6));
});

test('formato de texto de cantos', () => {
  const secs = parseSongText('[Estrofa 1]\nuno\ndos\n\n[Coro]\ntres\n\ncuatro');
  assert.deepEqual(secs.map(s => [s.type, s.label]), [['verse', 'Estrofa 1'], ['chorus', 'Coro'], ['verse', 'Estrofa 2']]);
  assert.deepEqual(parseSongText(songToText(secs)), secs);
  const book = parseSongBook('# 1 Primero\nuno\n\n# 2. Segundo\n[Coro]\ndos');
  assert.deepEqual(book.map(s => [s.number, s.title, s.sections.length]), [[1, 'Primero', 1], [2, 'Segundo', 1]]);
  assert.equal(normalizeSong({ numero: 3, titulo: 'X', letra: 'a\nb\n\nc' }).sections.length, 2);
  assert.equal(normalizeSong({ number: 4, title: 'Y', sections: [{ type: 'chorus', lines: ['z'] }] }).sections[0].label, 'Coro');
  assert.equal(normalizeSong({ title: '' }), null);
});
