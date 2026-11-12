"use strict";
const fs = require("fs");
const path = require("path");
const https = require("https");

const OUT_PATH = "c:\\Users\\Admin\\Desktop\\CatFoodTest\\lexicon_workspace\\raw\\bn\\wikimedia\\enwiktionary_lemmas.jsonl";

function toBanglaCanonical(str) {
  return String(str || "")
    .replace(/\uFEFF/g, "")
    .normalize("NFC")
    .replace(/[\u200B\u200E\u200F]/g, "")
    .replace(/\u09AF\u09BC/g, "\u09DF")
    .replace(/\u09A1\u09BC/g, "\u09DC")
    .replace(/\u09A2\u09BC/g, "\u09DD")
    .replace(/\u09C7\u09BE/g, "\u09CB")
    .replace(/\u09C7\u09D7/g, "\u09CC")
    .trim();
}

function getJson(u) {
  return new Promise((res, rej) => https.get(u, { headers: { "User-Agent": "Open-Bangla-Harvester/1.0 (https://github.com/mohammadgolamrabbii)" } }, r => {
    let b = ""; r.on("data", c => b += c); r.on("end", () => {
      if (r.statusCode !== 200) return rej(new Error(`HTTP_${r.statusCode}: ${b.slice(0, 80)}`));
      try { res(JSON.parse(b)); } catch (e) { rej(e); }
    });
  }).on("error", rej));
}

function postQuery(params) {
  return new Promise((res, rej) => {
    const body = new URLSearchParams(params).toString();
    const req = https.request({
      hostname: "en.wiktionary.org",
      path: "/w/api.php",
      method: "POST",
      headers: {
        "User-Agent": "Open-Bangla-Harvester/1.0",
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(body)
      }
    }, r => {
      let b = ""; r.on("data", c => b += c); r.on("end", () => {
        if (r.statusCode === 429 || r.statusCode >= 500) return rej(new Error(`HTTP_${r.statusCode}`));
        try { res(JSON.parse(b)); } catch (e) { rej(e); }
      });
    });
    req.on("error", rej);
    req.setTimeout(15000, () => req.destroy(new Error("Timeout")));
    req.write(body); req.end();
  });
}

function stripWikitext(line) {
  return line
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\{\{(?:lb|tlb|label|qualifier|q|gloss)\|bn\|([^}]+)\}\}/g, "($1)")
    .replace(/\{\{(?:l|m|cog|der|bor)\|[^|}]+\|([^|}]+)(?:\|[^}]*)?\}\}/g, "$1")
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, "$1")
    .replace(/\{\{[^}]+\}\}/g, "")
    .replace(/'''?/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const EN_POS = new Set(["Noun", "Verb", "Adjective", "Adverb", "Pronoun", "Preposition", "Postposition", "Conjunction", "Interjection", "Numeral", "Particle", "Classifier", "Prefix", "Suffix", "Phrase", "Proverb", "Idiom"]);

function parseEnPage(title, wt) {
  const cleanTitle = toBanglaCanonical(title);
  if (!/^[\u0985-\u09B9\u09DC-\u09DF\u09CE][\u0980-\u09FF\s\-\u200C]*$/.test(cleanTitle)) return null;
  const secM = wt.match(/==\s*Bengali\s*==([\s\S]*?)(?=\n==[^=]|$)/);
  const sec = secM ? secM[1] : "";
  if (!sec) return null;

  const posSet = new Set();
  const defs = [];
  const syns = [];
  let romanised = "";
  let inSyn = false;
  let inPos = false;

  const trM = sec.match(/\{\{bn-(?:noun|adj|verb|adv|proper noun|pron)[^}]*\|tr=([^|}]+)/);
  if (trM) romanised = trM[1].trim();

  for (const raw of sec.split(/\r?\n/)) {
    const l = raw.trim();
    const hm = l.match(/^===+\s*([^=]+?)\s*===+$/);
    if (hm) {
      const h = hm[1].trim();
      inSyn = h.startsWith("Synonym");
      inPos = EN_POS.has(h);
      if (inPos) posSet.add(h.toLowerCase().replace("adjective", "adj").replace("adverb", "adv").replace("pronoun", "pron").replace("conjunction", "conj").replace("interjection", "intj"));
      continue;
    }
    if (inPos && l.startsWith("# ") && !l.startsWith("#*") && !l.startsWith("#:")) {
      const d = stripWikitext(l.slice(2));
      if (d && d.length >= 2) defs.push(d);
    } else if (inSyn && (l.startsWith("*") || l.startsWith("#"))) {
      const m = l.match(/\{\{l\|bn\|([^|}]+)/);
      if (m) {
        const s = toBanglaCanonical(m[1]);
        if (s && s !== cleanTitle) syns.push(s);
      }
    }
  }
  if (posSet.size === 0 && defs.length === 0) return null;
  return {
    word: cleanTitle,
    pos: Array.from(posSet),
    en: [...new Set(defs)].slice(0, 5),
    synonyms: [...new Set(syns)].slice(0, 6),
    ...(romanised ? { romanised } : {})
  };
}

(async () => {
  const titles = [];
  let cmc = null;
  for (let i = 0; i < 30; i++) {
    let u = `https://en.wiktionary.org/w/api.php?action=query&list=categorymembers&cmtitle=Category:Bengali_lemmas&cmtype=page&cmlimit=500&format=json`;
    if (cmc) u += `&cmcontinue=${encodeURIComponent(cmc)}`;
    let j = null;
    for (let r = 0; r < 4; r++) {
      try { j = await getJson(u); break; }
      catch (e) { await new Promise(res => setTimeout(res, 2000 * (r + 1))); }
    }
    if (!j) break;
    for (const m of (j.query && j.query.categorymembers) || []) titles.push(m.title);
    if (j.continue && j.continue.cmcontinue) cmc = j.continue.cmcontinue;
    else break;
    await new Promise(res => setTimeout(res, 300));
  }
  console.log(`Found ${titles.length} Bengali lemma titles on en.wiktionary.org`);

  const batches = [];
  for (let i = 0; i < titles.length; i += 45) batches.push(titles.slice(i, i + 45));
  let idx = 0, errors = 0;
  const parsedList = [];

  async function worker() {
    while (idx < batches.length) {
      const b = batches[idx++];
      for (let r = 0; r < 4; r++) {
        try {
          const j = await postQuery({ action: "query", titles: b.join("|"), prop: "revisions", rvprop: "content", rvslots: "main", format: "json" });
          for (const p of Object.values((j.query && j.query.pages) || {})) {
            const wt = p.revisions && p.revisions[0] && p.revisions[0].slots && p.revisions[0].slots.main && p.revisions[0].slots.main["*"];
            if (p.title && wt) {
              const obj = parseEnPage(p.title, wt);
              if (obj) parsedList.push(obj);
            }
          }
          break;
        } catch (e) {
          if (r === 3) errors++;
          else await new Promise(res => setTimeout(res, 2000 * (r + 1)));
        }
      }
      await new Promise(res => setTimeout(res, 250));
    }
  }

  await Promise.all(Array.from({ length: 2 }, () => worker()));
  fs.writeFileSync(OUT_PATH, parsedList.map(x => JSON.stringify(x)).join("\n") + "\n", "utf8");
  console.log(`Saved ${parsedList.length} parsed en.wiktionary Bengali entries (errors=${errors})`);
})();
