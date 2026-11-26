import katex from 'katex';
import { katexMacros } from '../../../scripts/katex-macros';

/** Render TeX to an HTML string with the site's macros (DESIGN §6.3). Never throws. */
export function renderTex(tex: string, displayMode = false): string {
  return katex.renderToString(tex, {
    macros: { ...katexMacros },
    displayMode,
    throwOnError: false,
    output: 'htmlAndMathml',
  });
}
