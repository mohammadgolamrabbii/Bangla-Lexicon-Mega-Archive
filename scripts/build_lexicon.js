/**
 * Open Lexicon Foundation — Bangla Lexicon & Wordlist ETL Pipeline
 * Normalizes Unicode (NFC), merges Wiktionary, BengaliDictionary & ShobdoSearch,
 * deduplicates entries, and generates JSON, CSV, Wordlist & Web Chunks.
 */
const fs = require('fs');
const path = require('path');

const RAW_DIR = process.env.RAW_BN_DIR || path.resolve(__dirname, '../../../raw/bn');
const DIST_DIR = path.resolve(__dirname, '../dist');
const CHUNKS_DIR = path.join(DIST_DIR, 'chunks');

fs.mkdirSync(CHUNKS_DIR, { recursive: true });

// Strict Bangla Unicode cleaning & canonical precomposed normalization
function toBanglaCanonical(str) {
  return String(str)
    .replace(/\uFEFF/g, '')
    .normalize('NFC')
    .replace(/[\u200B\u200E\u200F]/g, '') // Strip zero-width space & directional marks
    .replace(/\u09AF\u09BC/g, '\u09DF')     // য + ় -> য়
    .replace(/\u09A1\u09BC/g, '\u09DC')     // ড + ় -> ড়
    .replace(/\u09A2\u09BC/g, '\u09DD')     // ঢ + ় -> ঢ়
    .replace(/\u09C7\u09BE/g, '\u09CB')     // ে + া -> ো
    .replace(/\u09C7\u09D7/g, '\u09CC');    // ে + ৗ -> ৌ
}

function cleanBanglaWord(str) {
  if (!str) return '';
  let s = toBanglaCanonical(str)
    .replace(/\s+/g, ' ')
    .trim();

  // Strip surrounding punctuation & symbols (including Bengali danda, pipe, ellipsis, colon)
  s = s.replace(/^[,;।|:.…!?'"()\-\[\]—–•*/~]+|[,;।|:.…!?'"()\-\[\]—–•*/~]+$/g, '').trim();

  // Must start with a valid Bengali letter/vowel (not punctuation or numeral)
  if (!/^[\u0985-\u09B9\u09DC-\u09DF\u09CE]/.test(s)) return '';
  if (/[A-Za-z0-9]/.test(s)) return '';
  if (s.length > 60) return '';
  return s;
}

function isPureSingleBanglaToken(word) {
  return /^[\u0980-\u09FF\u200C\u200D]+$/.test(word);
}

const lexiconMap = new Map(); // normalized_word -> entry object
const pureWordSet = new Set();

function getOrCreateEntry(word) {
  if (!lexiconMap.has(word)) {
    lexiconMap.set(word, {
      word,
      pos: new Set(),
      romanised: new Set(),
      en: new Set(),
      defs: new Set(),
      synonyms: new Set(),
      examples: new Set(),
      sources: new Set()
    });
  }
  return lexiconMap.get(word);
}

console.log('1. Loading Wiktionary JSONL (bn-en-dictionary)...');
const wiktPath = path.join(RAW_DIR, 'bn-en-dictionary/package/data/dictionary.jsonl');
if (fs.existsSync(wiktPath)) {
  const lines = fs.readFileSync(wiktPath, 'utf8').split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      const w = cleanBanglaWord(obj.bn);
      if (!w) continue;
      const entry = getOrCreateEntry(w);
      if (obj.pos) entry.pos.add(obj.pos.toLowerCase());
      if (obj.romanised) entry.romanised.add(obj.romanised.trim());
      if (obj.en) entry.en.add(obj.en.trim());
      if (obj.def) entry.defs.add(obj.def.trim());
      entry.sources.add('Wiktionary');
      pureWordSet.add(w);
    } catch {}
  }
}

console.log('2. Loading BengaliDictionary_93.csv & BengaliDictionary_17.txt...');
const csv93Path = path.join(RAW_DIR, 'BengaliDictionary/BengaliDictionary_93.csv');
if (fs.existsSync(csv93Path)) {
  const lines = fs.readFileSync(csv93Path, 'utf8').split('\n');
  for (const line of lines) {
    const parts = line.split(',');
    if (parts.length < 2) continue;
    const en = parts[0].replace(/\uFEFF/g, '').trim();
    const w = cleanBanglaWord(parts[1]);
    if (!w || !en) continue;
    const entry = getOrCreateEntry(w);
    entry.en.add(en);
    entry.sources.add('BengaliDictionary-CSV');
    pureWordSet.add(w);
  }
}

const txt17Path = path.join(RAW_DIR, 'BengaliDictionary/BengaliDictionary_17.txt');
if (fs.existsSync(txt17Path)) {
  const lines = fs.readFileSync(txt17Path, 'utf8').split('\n');
  for (const line of lines) {
    const parts = line.split('|');
    if (parts.length < 3) continue;
    const en = parts[1].trim();
    const w = cleanBanglaWord(parts[2]);
    if (!w || !en) continue;
    const entry = getOrCreateEntry(w);
    entry.en.add(en);
    entry.sources.add('BengaliDictionary-TXT');
    pureWordSet.add(w);
  }
}

console.log('3. Loading ShobdoSearch ben2bn.csv (Transliteration pairs)...');
const ben2bnPath = path.join(RAW_DIR, 'ShobdoSearch/data/ben2bn.csv');
if (fs.existsSync(ben2bnPath)) {
  const lines = fs.readFileSync(ben2bnPath, 'utf8').split('\n').slice(1);
  for (const line of lines) {
    const [rom, bnRaw] = line.split(',');
    const w = cleanBanglaWord(bnRaw);
    if (!w || !rom) continue;
    const entry = getOrCreateEntry(w);
    entry.romanised.add(rom.trim());
    entry.sources.add('ShobdoSearch');
    pureWordSet.add(w);
  }
}

console.log('4. Loading BengaliDictionary.json (Synonyms & Examples)...');
const bdJsonPath = path.join(RAW_DIR, 'BengaliDictionary/BengaliDictionary.json');
if (fs.existsSync(bdJsonPath)) {
  const raw = fs.readFileSync(bdJsonPath, 'utf8').replace(/^\uFEFF/, '');
  const arr = JSON.parse(raw);
  for (const item of arr) {
    const w = cleanBanglaWord(item.bn);
    if (!w) continue;
    const entry = getOrCreateEntry(w);
    if (item.en) entry.en.add(item.en.trim());
    if (Array.isArray(item.bn_syns)) {
      for (const s of item.bn_syns) {
        const cs = cleanBanglaWord(s);
        if (cs && cs !== w) entry.synonyms.add(cs);
      }
    }
    if (Array.isArray(item.sents) && item.sents.length > 0 && entry.examples.size < 2) {
      const cleanSent = String(item.sents[0]).replace(/<\/?b>/g, '').trim();
      if (cleanSent) entry.examples.add(cleanSent);
    }
    entry.sources.add('BengaliDictionary-JSON');
    pureWordSet.add(w);
  }
}

console.log('5. Merging Wikimedia Bangla Wiktionary (72k+ POS & Defs) & English Wiktionary Lemmas...');
const bnWiktPath = path.join(RAW_DIR, 'wikimedia/bnwiktionary_parsed.jsonl');
if (fs.existsSync(bnWiktPath)) {
  const lines = fs.readFileSync(bnWiktPath, 'utf8').split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      const w = cleanBanglaWord(obj.word);
      if (!w) continue;
      const entry = getOrCreateEntry(w);
      if (Array.isArray(obj.pos)) for (const p of obj.pos) entry.pos.add(p);
      if (Array.isArray(obj.defs)) for (const d of obj.defs) if (d) entry.defs.add(toBanglaCanonical(d));
      if (Array.isArray(obj.synonyms)) for (const s of obj.synonyms) {
        const cs = cleanBanglaWord(s);
        if (cs && cs !== w) entry.synonyms.add(cs);
      }
      entry.sources.add('bn.wiktionary');
      if (isPureSingleBanglaToken(w)) pureWordSet.add(w);
    } catch {}
  }
}

const enWiktPath = path.join(RAW_DIR, 'wikimedia/enwiktionary_lemmas.jsonl');
if (fs.existsSync(enWiktPath)) {
  const lines = fs.readFileSync(enWiktPath, 'utf8').split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      const w = cleanBanglaWord(obj.word);
      if (!w) continue;
      const entry = getOrCreateEntry(w);
      if (Array.isArray(obj.pos)) for (const p of obj.pos) entry.pos.add(p);
      if (obj.romanised) entry.romanised.add(obj.romanised.trim());
      if (Array.isArray(obj.en)) for (const g of obj.en) if (g) entry.en.add(g.trim());
      if (Array.isArray(obj.synonyms)) for (const s of obj.synonyms) {
        const cs = cleanBanglaWord(s);
        if (cs && cs !== w) entry.synonyms.add(cs);
      }
      entry.sources.add('en.wiktionary');
      if (isPureSingleBanglaToken(w)) pureWordSet.add(w);
    } catch {}
  }
}

console.log('6. Merging & normalizing massive Bangla WordLists (439k + 112k + 48k + 40k + bnwiki)...');
const wordlists = [
  'BengaliDictionary/BengaliWordList_439.txt',
  'BengaliDictionary/BengaliWordList_112.txt',
  'BengaliDictionary/BengaliWordList_48.txt',
  'BengaliDictionary/BengaliWordList_40.txt',
  'wikimedia/bnwiki_clean_tokens.txt'
];
for (const wl of wordlists) {
  const p = path.join(RAW_DIR, wl);
  if (!fs.existsSync(p)) continue;
  const lines = fs.readFileSync(p, 'utf8').split('\n');
  for (const line of lines) {
    const w = cleanBanglaWord(line);
    if (w && isPureSingleBanglaToken(w)) {
      pureWordSet.add(w);
    }
  }
}

console.log(`→ Rich Dictionary Entries: ${lexiconMap.size}`);
console.log(`→ Total Verified Unique NFC Bangla Words: ${pureWordSet.size}`);

// Convert rich lexicon to clean array
const richEntries = [];
let idx = 1;
const sortedWords = Array.from(lexiconMap.keys()).sort((a, b) => a.localeCompare(b, 'bn'));
for (const word of sortedWords) {
  const e = lexiconMap.get(word);
  richEntries.push({
    id: `bn-${String(idx++).padStart(6, '0')}`,
    word: e.word,
    pos: Array.from(e.pos),
    romanised: Array.from(e.romanised).slice(0, 3),
    en: Array.from(e.en).slice(0, 6),
    def: Array.from(e.defs).slice(0, 2),
    synonyms: Array.from(e.synonyms).slice(0, 8),
    examples: Array.from(e.examples).slice(0, 2),
    sources: Array.from(e.sources)
  });
}

// Export 1: Master Rich JSONL (line-delimited for streaming & GitHub diffs)
fs.writeFileSync(
  path.join(DIST_DIR, 'bangla_lexicon_rich.jsonl'),
  richEntries.map(e => JSON.stringify(e)).join('\n') + '\n',
  'utf8'
);

// Export 2: Rich JSON Core (compact so file stays well under GitHub 50MB limit)
fs.writeFileSync(
  path.join(DIST_DIR, 'bangla_lexicon_rich.json'),
  JSON.stringify(richEntries),
  'utf8'
);

// Export 3: Rich CSV
const csvEscape = v => `"${String(v).replace(/"/g, '""')}"`;
const csvRows = ['id,word,pos,romanised,english,synonyms'];
for (const e of richEntries) {
  csvRows.push([
    e.id,
    e.word,
    e.pos.join('; '),
    e.romanised.join('; '),
    e.en.join('; '),
    e.synonyms.join('; ')
  ].map(csvEscape).join(','));
}
fs.writeFileSync(path.join(DIST_DIR, 'bangla_lexicon_core.csv'), '\uFEFF' + csvRows.join('\n') + '\n', 'utf8');

// Export 4: Master Verified Wordlist (.txt)
const allSortedWords = Array.from(pureWordSet).sort((a, b) => a.localeCompare(b, 'bn'));
fs.writeFileSync(path.join(DIST_DIR, 'bangla_wordlist_verified.txt'), allSortedWords.join('\n') + '\n', 'utf8');

// Export 5: Hunspell-compatible .dic word list (count header + words)
fs.writeFileSync(
  path.join(DIST_DIR, 'bn_BD.dic'),
  `${allSortedWords.length}\n${allSortedWords.join('\n')}\n`,
  'utf8'
);

// Export 6: Alphabetical Web Chunks (for 0ms browser search)
const chunkBuckets = new Map();
for (const e of richEntries) {
  const firstChar = Array.from(e.word)[0] || 'other';
  const code = firstChar.codePointAt(0).toString(16);
  if (!chunkBuckets.has(code)) chunkBuckets.set(code, { char: firstChar, items: [] });
  chunkBuckets.get(code).items.push(e);
}
const chunkManifest = [];
for (const [code, bucket] of chunkBuckets.entries()) {
  const fname = `bn_${code}.json`;
  fs.writeFileSync(path.join(CHUNKS_DIR, fname), JSON.stringify(bucket.items), 'utf8');
  chunkManifest.push({ char: bucket.char, code, file: fname, count: bucket.items.length });
}
chunkManifest.sort((a, b) => a.char.localeCompare(b.char, 'bn'));
fs.writeFileSync(path.join(CHUNKS_DIR, 'manifest.json'), JSON.stringify(chunkManifest, null, 2), 'utf8');

// Export 7: Build Stats
const stats = {
  language: 'Bangla (বাংলা)',
  iso_639_1: 'bn',
  rich_entries: richEntries.length,
  total_verified_words: allSortedWords.length,
  with_pos: richEntries.filter(e => e.pos.length > 0).length,
  with_definitions: richEntries.filter(e => e.def.length > 0).length,
  with_romanised: richEntries.filter(e => e.romanised.length > 0).length,
  with_synonyms: richEntries.filter(e => e.synonyms.length > 0).length,
  chunk_files: chunkManifest.length,
  unicode_normalization: 'NFC',
  license: 'GPL-3.0',
  generated_at: new Date().toISOString()
};
fs.writeFileSync(path.join(DIST_DIR, 'stats.json'), JSON.stringify(stats, null, 2), 'utf8');
console.log('✅ Bangla Lexicon Build Complete!', stats);
