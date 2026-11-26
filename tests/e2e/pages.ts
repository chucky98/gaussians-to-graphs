import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Every HTML page in the production build, as paths relative to the base URL. */
export function builtPages(): string[] {
  const dist = join(process.cwd(), 'dist');
  if (!existsSync(dist)) throw new Error('Run `npm run build` before the e2e tests.');
  const out: string[] = [];
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) {
        if (n !== '_astro' && n !== 'pagefind') walk(p);
      } else if (n === 'index.html') out.push(relative(dist, d).replace(/\\/g, '/') + (d === dist ? '' : '/'));
    }
  };
  walk(dist);
  return out.sort();
}

export const postPages = () => builtPages().filter((p) => p.startsWith('posts/'));
