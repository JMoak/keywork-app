export interface CorpusSample {
  readonly name: string;
  readonly text: string;
}

export const graphemeCorpus: readonly CorpusSample[] = [
  { name: "decomposed accents", text: "café résumé" },
  { name: "stacked combining marks", text: "Z͑ͫ̓ͪ à́̂" },
  { name: "devanagari conjuncts", text: "नमस्ते क्षत्रिय" },
  { name: "hangul jamo", text: "각 한" },
  { name: "zwj family", text: "👨‍👩‍👧‍👦 home" },
  { name: "zwj profession with skin tone", text: "👩🏽‍💻 and 🧑🏿‍🚀" },
  { name: "rainbow flag", text: "🏳️‍🌈" },
  { name: "regional indicator flags", text: "🇯🇵🇺🇦🇧🇷" },
  { name: "keycaps and variation selectors", text: "1️⃣ #️⃣ ☃︎☃️" },
  { name: "hebrew with niqqud", text: "שָׁלוֹם עוֹלָם" },
  { name: "arabic", text: "مرحبا بالعالم" },
  { name: "bidi mix", text: "fix עברית in 3 files مرحبا ok" },
  { name: "cjk wide", text: "漢字かなカナ한국어 ＡＢＣ" },
  { name: "zero-width characters", text: "a​b‌c‍d⁠e­f" },
  { name: "astral surrogate pairs", text: "𝔘𝔫𝔦𝔠𝔬𝔡𝔢 𠜎𠜱𠝹" },
  { name: "interior tabs", text: "a\tb\t\tc" },
  { name: "multi-line", text: "first line\nsecond 👍🏾 line\n\nlast" },
];
