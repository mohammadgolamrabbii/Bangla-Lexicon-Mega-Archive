const fs = require('fs');
const path = require('path');

const DIST_DIR = path.resolve(__dirname, '../dist');
const stats = JSON.parse(fs.readFileSync(path.join(DIST_DIR, 'stats.json'), 'utf8'));
const jsonlPath = path.join(DIST_DIR, 'bangla_lexicon_rich.jsonl');
const wlPath = path.join(DIST_DIR, 'bangla_wordlist_verified.txt');
const manifestPath = path.join(DIST_DIR, 'chunks/manifest.json');

let errors = 0;
const seenWords = new Set();

const lines = fs.readFileSync(jsonlPath, 'utf8').trim().split('\n');
if (lines.length !== stats.rich_entries) {
  console.error(`❌ Stats mismatch: stats=${stats.rich_entries}, lines=${lines.length}`);
  errors++;
}

function toBanglaCanonical(str) {
  return String(str)
    .normalize('NFC')
    .replace(/\u09AF\u09BC/g, '\u09DF')
    .replace(/\u09A1\u09BC/g, '\u09DC')
    .replace(/\u09A2\u09BC/g, '\u09DD')
    .replace(/\u09C7\u09BE/g, '\u09CB')
    .replace(/\u09C7\u09D7/g, '\u09CC');
}

for (let i = 0; i < lines.length; i++) {
  const entry = JSON.parse(lines[i]);
  if (!entry.id || !/^bn-\d{6}$/.test(entry.id)) {
    console.error(`❌ Invalid ID at line ${i + 1}: ${entry.id}`);
    errors++;
  }
  if (!entry.word || entry.word !== toBanglaCanonical(entry.word)) {
    console.error(`❌ Non-canonical Bangla word at line ${i + 1}: ${entry.word}`);
    errors++;
  }
  if (seenWords.has(entry.word)) {
    console.error(`❌ Duplicate rich entry at line ${i + 1}: ${entry.word}`);
    errors++;
  }
  seenWords.add(entry.word);
}

const wlLines = fs.readFileSync(wlPath, 'utf8').trim().split('\n');
const wlSet = new Set(wlLines);
if (wlLines.length !== wlSet.size) {
  console.error(`❌ Duplicate entries in wordlist: ${wlLines.length} vs ${wlSet.size}`);
  errors++;
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
for (const m of manifest) {
  const cf = path.join(DIST_DIR, 'chunks', m.file);
  if (!fs.existsSync(cf)) {
    console.error(`❌ Missing chunk file: ${m.file}`);
    errors++;
  } else if (fs.statSync(cf).size >= 45 * 1024 * 1024) {
    console.error(`❌ Chunk exceeds 45MB: ${m.file}`);
    errors++;
  }
}

for (const fn of ['bangla_lexicon_rich.jsonl', 'bangla_lexicon_rich.json', 'bangla_lexicon_core.csv', 'bangla_wordlist_verified.txt', 'bn_BD.dic']) {
  const sz = fs.statSync(path.join(DIST_DIR, fn)).size;
  if (sz >= 45 * 1024 * 1024) {
    console.error(`❌ Dist file exceeds 45MB: ${fn} (${(sz / 1048576).toFixed(2)} MB)`);
    errors++;
  }
}

if (errors > 0) {
  console.error(`❌ Validation failed with ${errors} errors.`);
  process.exit(1);
}
console.log(`✅ Validation Passed! ${lines.length} rich entries, ${wlLines.length} NFC words, ${manifest.length} chunks verified.`);
