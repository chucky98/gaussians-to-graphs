/**
 * Content validation (DESIGN §8.2). Run with `npm run validate` after `npm run build`.
 *
 * Source checks: frontmatter schema + agreement with syllabus.ts, prerequisites, widget
 * lists vs. imports, widget captions, notation anti-patterns, no hex colors in components,
 * no Math.random in src. Build checks: every internal link and asset in dist/ resolves
 * under the base path, and same-page #fragments exist.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname, posix } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { postFrontmatter } from '../src/lib/site/schema';
import { entryBySlug, syllabus, folderName } from '../src/lib/site/syllabus';
import { basePath, siteOrigin } from '../src/lib/site/config';
import { notationGroups } from '../src/lib/site/notation';

const root = resolve(dirname(new URL(import.meta.url).pathname), '..');
const errors: string[] = [];
const err = (where: string, msg: string) => errors.push(`${where}: ${msg}`);

function walk(dir: string, filter: (f: string) => boolean): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, filter));
    else if (filter(p)) out.push(p);
  }
  return out;
}

// ------------------------------------------------------------------ posts
const postsDir = join(root, 'src/content/posts');
const published = new Set<string>();
const postSources = new Map<string, string>();

for (const folder of existsSync(postsDir) ? readdirSync(postsDir) : []) {
  const where = `posts/${folder}`;
  const file = join(postsDir, folder, 'index.mdx');
  if (!existsSync(file)) {
    err(where, 'missing index.mdx');
    continue;
  }
  const src = readFileSync(file, 'utf8');
  const m = src.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) {
    err(where, 'missing frontmatter');
    continue;
  }
  let raw: unknown;
  try {
    raw = parseYaml(m[1]!);
  } catch (e) {
    err(where, `frontmatter is not valid YAML (quote strings containing ": "): ${(e as Error).message.split('\n')[0]}`);
    continue;
  }
  const parsed = postFrontmatter.safeParse(raw);
  if (!parsed.success) {
    err(
      where,
      `frontmatter invalid: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
    continue;
  }
  const fm = parsed.data;
  const slug = folder.replace(/^\d+-/, '');
  const entry = entryBySlug(slug);
  if (!entry) {
    err(where, `slug "${slug}" is not in syllabus.ts`);
    continue;
  }
  postSources.set(slug, src);
  if (fm.status === 'published') published.add(slug);
  if (folder !== folderName(entry)) err(where, `folder should be "${folderName(entry)}"`);
  if (fm.number !== entry.number) err(where, `number ${fm.number} ≠ syllabus ${entry.number}`);
  if (fm.title !== entry.title) err(where, `title "${fm.title}" ≠ syllabus "${entry.title}"`);
  if (fm.part !== entry.part) err(where, `part ${fm.part} ≠ syllabus ${entry.part}`);
  if (Boolean(fm.needs3d) !== Boolean(entry.needs3d)) err(where, 'needs3d disagrees with syllabus');
  if ([...fm.prerequisites].sort().join() !== [...entry.prerequisites].sort().join())
    err(where, `prerequisites [${fm.prerequisites}] ≠ syllabus [${entry.prerequisites}]`);
  for (const p of fm.prerequisites) {
    const pe = entryBySlug(p);
    if (!pe) err(where, `prerequisite "${p}" does not exist`);
    else if (pe.number >= entry.number) err(where, `prerequisite "${p}" is not earlier`);
  }
  const refKeys = fm.references.map((r) => r.key);
  if (new Set(refKeys).size !== refKeys.length) err(where, 'duplicate reference keys');

  // Widgets: listed == imported == used, and each has a caption with "What to look for".
  const body = src.slice(m[0].length);
  const imported = [
    ...body.matchAll(/^import\s+(\w+)\s+from\s+['"][./]*\/components\/widgets\/(\w+)\/\2\.svelte['"]/gm),
  ].map((x) => {
    if (x[1] !== x[2]) err(where, `widget import name ${x[1]} should match its file ${x[2]}`);
    return x[2]!;
  });
  for (const w of fm.widgets) {
    if (!imported.includes(w)) err(where, `widget ${w} is listed but not imported`);
    if (!new RegExp(`<${w}[\\s/>]`).test(body)) err(where, `widget ${w} is listed but not used`);
    if (!new RegExp(`<${w}[^>]*client:visible`).test(body)) err(where, `widget ${w} must hydrate with client:visible`);
    const wfile = join(root, 'src/components/widgets', w, `${w}.svelte`);
    if (!existsSync(wfile)) err(where, `widget file missing: ${relative(root, wfile)}`);
    else {
      const wsrc = readFileSync(wfile, 'utf8');
      if (!wsrc.includes(`name="${w}"`)) err(`widgets/${w}`, `WidgetFrame name (data-widget) must be "${w}"`);
      if (!wsrc.includes('What to look for')) err(`widgets/${w}`, 'caption lacks "What to look for"');
    }
  }
  for (const w of imported)
    if (!fm.widgets.includes(w)) err(where, `widget ${w} is used but not listed in frontmatter`);
  if (fm.widgets.length > 0) {
    const tries = (body.match(/<TryThis>/g) ?? []).length;
    if (tries === 0) err(where, 'a post with widgets needs at least one <TryThis>');
  }

  // Notation anti-patterns inside math (DESIGN §6).
  const math = [...body.matchAll(/\$\$([\s\S]*?)\$\$|\$([^$\n]+)\$/g)].map((x) => x[1] ?? x[2] ?? '');
  const rules: [RegExp, string][] = [
    [/\^\{?T\}?(?![a-zA-Z])/, 'transpose must be \\T or ^\\top, not ^T'],
    [/\^\{?\\intercal\}?/, 'transpose must be \\T or ^\\top'],
    [/\\(?:text|mathrm)\{(?:Cov|cov|Var|var)\}/, 'use \\Cov (or σ² for variance)'],
    [/\\(?:text|mathrm)\{(?:tr|diag)\}/, 'use \\tr / \\diag'],
    [
      /\\(?:text|mathrm|operatorname)\{(?:exp|log)\}\s*\\?\(?\s*\\?(?:boldsymbol\{\\(?:tau|xi))/,
      'Lie maps are \\Exp / \\Log',
    ],
    [/\\mathbf\{R\}\s*\\in\s*\\?(?:SO|\\SO)/, 'rotation matrices are C, not R'],
    [/\\mathbb\{E\}/, 'use the \\E macro'],
  ];
  for (const tex of math)
    for (const [re, msg] of rules) if (re.test(tex)) err(where, `${msg}: $${tex.trim().slice(0, 60)}$`);

  // Symbols card: display TeX must come from the notation table; match fragments must occur in the math.
  const squash = (t: string) => t.replace(/\s+/g, '');
  const notationTex = notationGroups.flatMap((g) => g.rows.map((r) => squash(r.tex)));
  const allMath = math.join('\n');
  for (const sym of fm.symbols) {
    if (!notationTex.some((t) => t.includes(squash(sym.tex))))
      err(where, `symbol $${sym.tex}$ is not in the notation table (src/lib/site/notation.ts)`);
    for (const m of sym.match ?? [sym.tex])
      if (!allMath.includes(m)) err(where, `symbol match "${m}" does not occur in the post's math`);
  }

  // Prose must not contain absolute internal links (base path!).
  for (const l of body.matchAll(/\]\((\/[^)]*)\)/g)) err(where, `absolute internal link ${l[1]}: use a relative link`);
}

// Relative links between posts must target published posts.
for (const [slug, src] of postSources) {
  if (!published.has(slug)) continue;
  for (const l of src.matchAll(/\]\(\.\.\/([a-z0-9-]+)\/[^)]*\)/g)) {
    if (!published.has(l[1]!)) err(`posts/${slug}`, `links to unpublished post "${l[1]}"`);
  }
}

// ------------------------------------------------------------------ source greps
for (const f of walk(join(root, 'src/components'), (p) => /\.(svelte|astro|ts|css)$/.test(p))) {
  const txt = readFileSync(f, 'utf8');
  for (const hm of txt.matchAll(/(?<![&\w])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g))
    err(relative(root, f), `hard-coded hex color ${hm[0]} (use tokens.css variables)`);
}
for (const f of walk(join(root, 'src'), (p) => /\.(svelte|astro|ts|mdx|js)$/.test(p))) {
  if (/Math\.random\s*\(/.test(readFileSync(f, 'utf8')))
    err(relative(root, f), 'Math.random() is forbidden; use lib/math/rng.ts');
}

// Sanity: syllabus slugs map to valid folder names.
for (const e of syllabus)
  if (!/^\d{2}-[a-z0-9-]+$/.test(folderName(e))) err('syllabus', `bad folder name ${folderName(e)}`);

// ------------------------------------------------------------------ built site links
const dist = join(root, 'dist');
if (!existsSync(join(dist, 'index.html'))) {
  err('dist', 'no build found; run `npm run build` before `npm run validate`');
} else {
  const base = `${basePath}/`;
  const htmlFiles = walk(dist, (p) => p.endsWith('.html'));
  const idCache = new Map<string, Set<string>>();
  const idsOf = (file: string) => {
    let ids = idCache.get(file);
    if (!ids) {
      ids = new Set([...readFileSync(file, 'utf8').matchAll(/\sid="([^"]+)"/g)].map((x) => x[1]!));
      idCache.set(file, ids);
    }
    return ids;
  };
  const resolveTarget = (urlPath: string): string | null => {
    if (!urlPath.startsWith(base)) return null;
    const rel = decodeURIComponent(urlPath.slice(base.length));
    const cand = [join(dist, rel), join(dist, rel, 'index.html')];
    return cand.find((c) => existsSync(c) && statSync(c).isFile()) ?? null;
  };
  // Generated by `pagefind` after astro build; referenced from JS, not markup.
  const external = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
  for (const file of htmlFiles) {
    const where = `dist/${relative(dist, file)}`;
    const html = readFileSync(file, 'utf8');
    const pageUrl = `${base}${relative(dist, file)
      .replace(/index\.html$/, '')
      .replace(/\\/g, '/')}`;
    const refs = [...html.matchAll(/\s(?:href|src)="([^"]+)"/g)].map((x) => x[1]!.replace(/&amp;/g, '&'));
    const og = [...html.matchAll(/<meta property="og:(?:image|url)" content="([^"]+)"/g)].map((x) => x[1]!);
    for (const o of og) {
      if (!o.startsWith(siteOrigin + base)) err(where, `og URL outside the site: ${o}`);
      else refs.push(o.slice(siteOrigin.length));
    }
    for (const ref of refs) {
      if (external.test(ref) || ref.startsWith('data:')) continue;
      const [pathPart, frag] = ref.split('#') as [string, string | undefined];
      let target: string | null;
      if (pathPart === '') target = file;
      else if (pathPart.startsWith('/')) {
        if (!pathPart.startsWith(base)) {
          err(where, `link without base path: ${ref}`);
          continue;
        }
        target = resolveTarget(pathPart.split('?')[0]!);
      } else target = resolveTarget(posix.join(pageUrl, pathPart.split('?')[0]!) + (pathPart.endsWith('/') ? '/' : ''));
      if (!target) {
        err(where, `broken link: ${ref}`);
        continue;
      }
      if (frag && target.endsWith('.html') && !idsOf(target).has(decodeURIComponent(frag)))
        err(where, `missing anchor: ${ref}`);
    }
  }
}

// ------------------------------------------------------------------ report
if (errors.length > 0) {
  console.error(`Content validation failed with ${errors.length} problem(s):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`Content validation passed (${postSources.size} post(s), ${published.size} published).`);
