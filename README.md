# 🇧🇩 Bangla Lexicon Mega-Archive (বাংলা মহা-শব্দভাণ্ডার)

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-emerald.svg)](LICENSE)
[![Verified Words](https://img.shields.io/badge/Verified_Bangla_Words-495%2C209-blue.svg)](#dataset-metrics)
[![Rich Entries](https://img.shields.io/badge/Rich_Dictionary_Entries-66%2C679-indigo.svg)](#dataset-metrics)
[![Unicode Canonical](https://img.shields.io/badge/Unicode-Canonical_Precomposed-amber.svg)](#unicode-normalization)
[![Live Explorer](https://img.shields.io/badge/Web_Explorer-Live_on_GitHub_Pages-success.svg)](https://mohammadgolamrabbii.github.io/Bangla-Lexicon-Mega-Archive/)

An open-source, Unicode-normalized, multi-format **Bangla (বাংলা) Lexicon, Dictionary & Verified Wordlist Archive** built for NLP researchers, AI/LLM datasets, spellcheckers, educational platforms, and software developers.

👉 **Live Interactive Web Dictionary:** [https://mohammadgolamrabbii.github.io/Bangla-Lexicon-Mega-Archive/](https://mohammadgolamrabbii.github.io/Bangla-Lexicon-Mega-Archive/)  
🔤 **Companion Bangla Fonts Archive (5,020+ Free Fonts):** [Open Typography Hub](https://mohammadgolamrabbii.github.io/typography/)

---

## 📊 Dataset Metrics

| Metric | Verified Count | Details |
| :--- | :--- | :--- |
| **Total Verified Bangla Words** | **495,209** | Deduplicated, canonical Bangla spellcheck & NLP wordlist |
| **Rich Lexicon Entries** | **66,679** | Structured entries with English meanings & metadata |
| **Part of Speech (POS) Tagged** | **14,124** | Noun, verb, adjective, adverb tags |
| **Romanised Pronunciations** | **15,078** | Transliteration / Banglish pronunciations |
| **Synonym Clusters** | **10,053** | Verified Bangla synonym cross-links |
| **Web Alphabet Chunks** | **47** | Letter-indexed JSON chunks (`dist/chunks/`) for 0ms search |

---

## 📁 Export Formats (`dist/`)

| File | Format | Use Case |
| :--- | :--- | :--- |
| `dist/bangla_lexicon_rich.jsonl` | JSON Lines | Streaming ingestion, LLM fine-tuning, Python/Node pipelines |
| `dist/bangla_lexicon_rich.json` | JSON Array | Full structured database |
| `dist/bangla_lexicon_core.csv` | UTF-8 BOM CSV | Excel, Google Sheets, Pandas, SQL import |
| `dist/bangla_wordlist_verified.txt` | Plain Text | NLP tokenizers, password/OCR filtering, word lists |
| `dist/bn_BD.dic` | Hunspell `.dic` | Spellcheckers (LibreOffice, VS Code, Firefox, CSpell) |
| `dist/chunks/bn_*.json` | Chunked JSON | Zero-backend web & mobile dictionary apps |

---

## 🧬 Unified Entry Schema

```json
{
  "id": "bn-000145",
  "word": "অভিধান",
  "pos": ["noun"],
  "romanised": ["obhidhan"],
  "en": ["dictionary"],
  "def": ["A reference work listing words or names..."],
  "synonyms": ["শব্দকোষ", "অমরকোষ"],
  "examples": ["..."],
  "sources": ["Wiktionary", "BengaliDictionary-JSON"]
}
```

---

## 🛠️ Unicode Normalization & Quality Assurance

Bangla text across the web often suffers from split codepoints (e.g., `য + ়` instead of `য়`, `ড + ়` instead of `ড়`, `ে + া` instead of `ো`) and invisible zero-width joiners. Our automated pipeline (`scripts/build_lexicon.js`) enforces canonical precomposed Unicode (`\u09DF`, `\u09DC`, `\u09DD`, `\u09CB`, `\u09CC`), deduplicates entries, and validates integrity via GitHub Actions (`scripts/validate_lexicon.js`).

### Quick Usage (Node.js / Python)

```python
import json

with open("dist/bangla_lexicon_rich.jsonl", "r", encoding="utf-8") as f:
    lexicon = [json.loads(line) for line in f]

print(f"Loaded {len(lexicon)} Bangla entries!")
```

---

## ⚖️ Attribution & License

This archive builds upon and unifies open-source community efforts with full respect for upstream licenses:
* **Wiktionary / `bn-en-dictionary`** (CC BY-SA 3.0)
* **`MinhasKamal/BengaliDictionary`** (GNU GPL-3.0)
* **`skhalidmahmud/ShobdoSearch`** (MIT — Banglish transliteration pairs)

Released under the **[GNU General Public License v3.0 (GPL-3.0)](LICENSE)**.

---

*Curated & maintained by **[Mohammad Golamrabbii](https://github.com/mohammadgolamrabbii)** • Companion Project: **[Hindi Lexicon Mega-Archive](https://github.com/mohammadgolamrabbii/Hindi-Lexicon-Mega-Archive)***
