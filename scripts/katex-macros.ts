/**
 * Single source of truth for KaTeX macros (DESIGN §6.3).
 * Used at build time by rehype-katex and at runtime by widgets (katex.renderToString).
 */
export const katexMacros: Record<string, string> = {
  '\\T': '^{\\top}',
  '\\E': '\\mathbb{E}',
  '\\Cov': '\\operatorname{Cov}',
  '\\N': '\\mathcal{N}',
  '\\R': '\\mathbb{R}',
  '\\Exp': '\\operatorname{Exp}',
  '\\Log': '\\operatorname{Log}',
  '\\SO': 'SO',
  '\\SE': 'SE',
  '\\so': '\\mathfrak{so}',
  '\\se': '\\mathfrak{se}',
  '\\bel': '\\mathrm{bel}',
  '\\diag': '\\operatorname{diag}',
  '\\tr': '\\operatorname{tr}',
};
