// Small, dependency-free text utilities used by the scorer.

const STOPWORDS = new Set(
  (
    "a an and are as at be been being but by can could did do does doing for from had has have " +
    "having he her here hers him his how i if in into is it its itself just me more most my no nor " +
    "not of off on once only or other our ours out over own same she should so some such than that " +
    "the their theirs them then there these they this those through to too under until up very was " +
    "we were what when where which while who whom why will with would you your yours also any each " +
    "about after again against all am because before below between both during few further let lets " +
    "may might must shall us via within without yes ok okay please thanks thank"
  ).split(" "),
);

/** Very light suffix stripping so "refunds"/"refund" and "charged"/"charge" match. */
function stem(word: string): string {
  if (word.length <= 4 || /^\d/.test(word)) return word;
  for (const suffix of ["ing", "ed", "es", "s"]) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 3) {
      if (suffix === "s" && word.endsWith("ss")) return word;
      return word.slice(0, -suffix.length);
    }
  }
  return word;
}

/** Lowercased word tokens, numbers kept whole (e.g. "4.99", "30"). */
export function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+(?:[.'][a-z0-9]+)*/g) ?? [];
}

/** Tokens that carry meaning: stopwords removed, light stemming applied. */
export function contentTokens(text: string): string[] {
  return tokenize(text)
    .map((t) => t.replace(/'s$/, ""))
    .filter((t) => !STOPWORDS.has(t))
    .map(stem);
}

/** Splits text into sentences on ., ! or ? followed by whitespace, and on line breaks. */
export function splitSentences(text: string): string[] {
  return text
    .split(/\n+|(?<=[.!?])\s+(?=["'(\[]?[A-Z0-9])/)
    .map((s) => s.trim())
    .filter((s) => contentTokens(s).length > 0);
}

/** Numbers that matter for factual accuracy: "30", "4.99", "1,200", "15%". */
export function extractNumbers(text: string): string[] {
  const matches = text.match(/\d+(?:[.,]\d+)*%?/g) ?? [];
  return [...new Set(matches.map((n) => n.replace(/,/g, "").replace(/\.$/, "")))];
}

const ABSTENTION_PATTERNS = [
  /\bi (?:do not|don't) know\b/i,
  /\bi(?:'m| am) not sure\b/i,
  /\b(?:cannot|can't|could not|couldn't) find\b/i,
  /\bno information\b/i,
  /\bnot (?:mentioned|covered|stated) in\b/i,
  /\bunable to answer\b/i,
];

/** True when the answer is the model declining to answer rather than making a claim. */
export function isAbstention(answer: string): boolean {
  return ABSTENTION_PATTERNS.some((p) => p.test(answer));
}
