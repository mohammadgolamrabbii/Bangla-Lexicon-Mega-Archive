"use strict";
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { spawn } = require("child_process");

const WDIR = "c:\\Users\\Admin\\Desktop\\CatFoodTest\\lexicon_workspace\\raw\\bn\\wikimedia";
const BZ2_BIN = "c:\\Program Files\\Git\\usr\\bin\\bzip2.exe";

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

function unescapeXml(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function stripWikitext(line) {
  return line
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, "$1")
    .replace(/\{\{([^{}|]+)\|([^{}|]+)(?:\|[^{}]*)?\}\}/g, (_, t, v) => (t.trim() === "l" || t.trim() === "m" ? "" : v))
    .replace(/\{\{[^}]+\}\}/g, "")
    .replace(/'''?/g, "")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const POS_MAP = [
  [/বিশেষ্য|নামপদ/, "noun"],
  [/বিশেষণ/, "adj"],
  [/ক্রিয়া(?:বিশেষণ)?|ক্রিয়া(?:বিশেষণ)?/, m => (m.includes("বিশেষণ") ? "adv" : "verb")],
  [/সর্বনাম/, "pron"],
  [/অব্যয়|অব্যয়/, "conj/indec"],
  [/উপসর্গ/, "prefix"],
  [/প্রত্যয়|প্রত্যয়/, "suffix"],
  [/বাগধারা/, "idiom"],
  [/প্রবাদ/, "proverb"],
  [/অর্থ/, "meaning"]
];

function parseWiktPage(title, text) {
  const cleanTitle = toBanglaCanonical(title);
  if (!/^[\u0985-\u09B9\u09DC-\u09DF\u09CE][\u0980-\u09FF\s\-\u200C]*$/.test(cleanTitle)) return null;
  if (cleanTitle.length > 60 || text.includes("#REDIRECT") || text.includes("#পুনর্নির্দেশ")) return null;

  const lines = text.split(/\r?\n/);
  const posSet = new Set();
  const defs = [];
  const syns = [];
  const ants = [];
  let ipa = "";
  const hasExplicitLangHeaders = /^==[^=]/m.test(text);
  let inBn = !hasExplicitLangHeaders;
  let sectionMode = "none";

  for (const raw of lines) {
    const l = raw.trim();
    if (/^==[^=]/.test(l)) {
      if (/\{\{ভাষা\|bn\}\}|বাংলা/.test(l)) { inBn = true; continue; }
      else if (inBn) break;
      else continue;
    }
    if (!inBn) continue;

    // Extract IPA if present
    if (!ipa) {
      const ipaM = l.match(/\{\{IPA\|bn\|([^}|]+)/);
      if (ipaM) ipa = ipaM[1].trim();
    }

    // Template POS cues like {{bn-বিশেষ্য}} or {{অব্যয়|bn}}
    if (/\{\{bn-(বিশেষ্য|বিশেষণ|ক্রিয়া|ক্রিয়া|অব্যয়|অব্যয়|সর্বনাম|প্রবাদ|বাগধারা)/.test(l) || /\{\{(বিশেষ্য|বিশেষণ|ক্রিয়া|অব্যয়|সর্বনাম)\|bn/.test(l)) {
      for (const [re, tag] of POS_MAP) {
        if (re.test(l)) {
          const val = typeof tag === "function" ? tag(l) : tag;
          if (val !== "meaning") posSet.add(val);
        }
      }
      sectionMode = "def";
      continue;
    }

    if (/^===+/.test(l)) {
      sectionMode = "none";
      for (const [re, tag] of POS_MAP) {
        if (re.test(l)) {
          const val = typeof tag === "function" ? tag(l) : tag;
          if (val !== "meaning") posSet.add(val);
          sectionMode = "def";
          break;
        }
      }
      if (/সমার্থক/.test(l)) sectionMode = "syn";
      else if (/বিপরীত/.test(l)) sectionMode = "ant";
      continue;
    }

    if (sectionMode === "def" && (l.startsWith("# ") || (l.startsWith("#") && !l.startsWith("#*") && !l.startsWith("#:")))) {
      const d = toBanglaCanonical(stripWikitext(l.replace(/^#+/, "")));
      if (d && d.length >= 2 && !/^[a-zA-Z0-9\-_]{1,5}$/.test(d) && !/^বিষয়শ্রেণী/.test(d)) defs.push(d);
    } else if ((sectionMode === "syn" || sectionMode === "ant") && (l.startsWith("*") || l.startsWith("#"))) {
      const items = l.replace(/^[*#]+/, "").split(/[,;।]/);
      for (const it of items) {
        const cw = toBanglaCanonical(stripWikitext(it));
        if (cw && cw.length >= 2 && /^[\u0980-\u09FF\s\-]+$/.test(cw) && cw !== cleanTitle) {
          if (sectionMode === "syn") syns.push(cw);
          else ants.push(cw);
        }
      }
    }
  }

  // Fallback for pages that mention [[বিষয়শ্রেণী:বাংলা বিশেষ্য]] or similar without strict heading
  if (posSet.size === 0 && /\[\[বিষয়শ্রেণী:বাংলা বিশেষ্য/.test(text)) posSet.add("noun");
  if (posSet.size === 0 && /\[\[বিষয়শ্রেণী:বাংলা বিশেষণ/.test(text)) posSet.add("adj");
  if (posSet.size === 0 && /\[\[বিষয়শ্রেণী:বাংলা ক্রিয়া/.test(text)) posSet.add("verb");

  if (posSet.size === 0 && defs.length === 0 && syns.length === 0) return null;
  return {
    word: cleanTitle,
    pos: Array.from(posSet),
    defs: [...new Set(defs)].slice(0, 3),
    synonyms: [...new Set(syns)].slice(0, 8),
    antonyms: [...new Set(ants)].slice(0, 6),
    ...(ipa ? { ipa } : {})
  };
}

async function parseBnWiktionaryDump() {
  const bz2Path = path.join(WDIR, "bnwiktionary-latest-pages-articles.xml.bz2");
  const outPath = path.join(WDIR, "bnwiktionary_parsed.jsonl");
  const out = fs.createWriteStream(outPath, "utf8");

  return new Promise((resolve, reject) => {
    const proc = spawn(BZ2_BIN, ["-dc", bz2Path]);
    let buf = "";
    let pages = 0, kept = 0, withDefs = 0, withPos = 0, withSyns = 0;

    proc.stdout.on("data", chunk => {
      buf += chunk.toString("utf8");
      while (true) {
        const start = buf.indexOf("<page>");
        if (start === -1) {
          if (buf.length > 65536) buf = buf.slice(-64);
          break;
        }
        const end = buf.indexOf("</page>", start);
        if (end === -1) {
          if (start > 0) buf = buf.slice(start);
          break;
        }
        const pageXml = buf.slice(start, end + 7);
        buf = buf.slice(end + 7);
        pages++;

        const nsMatch = pageXml.match(/<ns>(\d+)<\/ns>/);
        if (!nsMatch || nsMatch[1] !== "0") continue;
        const tMatch = pageXml.match(/<title>([\s\S]*?)<\/title>/);
        const txtMatch = pageXml.match(/<text[^>]*>([\s\S]*?)<\/text>/);
        if (!tMatch || !txtMatch) continue;

        const title = unescapeXml(tMatch[1]);
        const wt = unescapeXml(txtMatch[1]);
        const parsed = parseWiktPage(title, wt);
        if (parsed) {
          kept++;
          if (parsed.defs.length) withDefs++;
          if (parsed.pos.length) withPos++;
          if (parsed.synonyms.length) withSyns++;
          out.write(JSON.stringify(parsed) + "\n");
        }
      }
    });

    proc.stderr.on("data", d => console.error("bz2 stderr:", d.toString()));
    proc.on("error", reject);
    proc.on("close", code => {
      out.end(() => {
        console.log(`bnwiktionary parsed: total_pages=${pages}, kept_bangla=${kept}, with_pos=${withPos}, with_defs=${withDefs}, with_syns=${withSyns}`);
        resolve({ pages, kept, withPos, withDefs, withSyns });
      });
    });
  });
}

function parseBnWikiTitles() {
  const gzPath = path.join(WDIR, "bnwiki-latest-all-titles-in-ns0.gz");
  const raw = zlib.gunzipSync(fs.readFileSync(gzPath)).toString("utf8");
  const tokenSet = new Set();
  const titleLines = raw.split(/\r?\n/);
  for (const line of titleLines) {
    // Strip parenthetical disambiguations like _(উপন্যাস) or _(নদী)
    const parts = line.replace(/_/g, " ").replace(/\([^)]*\)/g, " ").split(/\s+/);
    for (const p of parts) {
      const c = toBanglaCanonical(p).replace(/^[,;।|:.…!?'"\-]+|[,;।|:.…!?'"\-]+$/g, "");
      if (c.length >= 2 && c.length <= 32 && /^[\u0985-\u09B9\u09DC-\u09DF\u09CE][\u0980-\u09FF]+$/.test(c)) {
        tokenSet.add(c);
      }
    }
  }
  const outPath = path.join(WDIR, "bnwiki_clean_tokens.txt");
  const sorted = Array.from(tokenSet).sort((a, b) => a.localeCompare(b, "bn"));
  fs.writeFileSync(outPath, sorted.join("\n"));
  console.log(`bnwiki titles=${titleLines.length} -> clean unique Bangla tokens=${sorted.length}`);
  return sorted.length;
}

(async () => {
  await parseBnWiktionaryDump();
  parseBnWikiTitles();
})();
