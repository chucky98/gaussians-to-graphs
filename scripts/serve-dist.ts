/**
 * Minimal static server for dist/ under the base path, used by the Playwright tests.
 * (Foreground and dependency-free, so the test runner fully controls its lifecycle.)
 *   npx tsx scripts/serve-dist.ts [port=4322]
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { basePath } from '../src/lib/site/config';

const port = Number(process.argv[2] ?? 4322);
const dist = resolve('dist');
const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
};

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const prefix = `${basePath}/`;
  let file: string | null = null;
  if (url.pathname.startsWith(prefix) || url.pathname === basePath) {
    const rel = normalize(decodeURIComponent(url.pathname.slice(prefix.length))).replace(/^(\.\.[/\\])+/, '');
    const p = join(dist, rel);
    if (existsSync(p) && statSync(p).isFile()) file = p;
    else if (existsSync(join(p, 'index.html'))) file = join(p, 'index.html');
  }
  if (!file) {
    res.writeHead(404, { 'content-type': types['.html']! });
    createReadStream(join(dist, '404.html')).pipe(res);
    return;
  }
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`serving dist at http://localhost:${port}${basePath}/`));
