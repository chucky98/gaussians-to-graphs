/** Rough reading time for prose that contains math and MDX. */

/** Words in a Markdown/MDX body, ignoring frontmatter, code, math, imports and JSX tags. */
export function countWords(source: string): number {
  const text = source
    .replace(/^---[\s\S]*?---/, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\$[^$\n]+\$/g, ' x ')
    .replace(/^\s*(import|export)\s.*$/gm, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[#*_>`[\]()|-]/g, ' ');
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/** Minutes to read at `wpm` words per minute (technical prose: slower than average). */
export function readingMinutes(source: string, wpm = 200): number {
  return Math.max(1, Math.round(countWords(source) / wpm));
}
