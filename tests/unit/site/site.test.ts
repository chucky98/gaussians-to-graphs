import { describe, expect, it } from 'vitest';
import { joinUrl, postPath } from '../../../src/lib/site/url';
import { syllabus, parts, neighbors, folderName, entryBySlug, entryByNumber } from '../../../src/lib/site/syllabus';
import { countWords, readingMinutes } from '../../../src/lib/site/reading-time';

describe('url', () => {
  it('joins base and path without double slashes', () => {
    expect(joinUrl('/gaussians-to-graphs/', 'posts/x/')).toBe('/gaussians-to-graphs/posts/x/');
    expect(joinUrl('/gaussians-to-graphs', '/notation/')).toBe('/gaussians-to-graphs/notation/');
    expect(joinUrl('/gaussians-to-graphs/')).toBe('/gaussians-to-graphs/');
    expect(joinUrl('/', 'about/')).toBe('/about/');
  });
  it('leaves absolute URLs and anchors alone', () => {
    expect(joinUrl('/b/', 'https://example.com/x')).toBe('https://example.com/x');
    expect(joinUrl('/b/', '#top')).toBe('#top');
    expect(joinUrl('/b/', 'mailto:a@b.c')).toBe('mailto:a@b.c');
  });
  it('postPath', () => expect(postPath('kalman-filter')).toBe('posts/kalman-filter/'));
});

describe('syllabus', () => {
  it('has 32 posts numbered 1..32 with unique slugs', () => {
    expect(syllabus).toHaveLength(32);
    syllabus.forEach((e, i) => expect(e.number).toBe(i + 1));
    expect(new Set(syllabus.map((e) => e.slug)).size).toBe(32);
    for (const e of syllabus) expect(e.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
  it('prerequisites exist and come earlier', () => {
    for (const e of syllabus) {
      for (const p of e.prerequisites) {
        const pe = entryBySlug(p);
        expect(pe, `${e.slug} -> ${p}`).toBeDefined();
        expect(pe!.number).toBeLessThan(e.number);
      }
    }
  });
  it('every post belongs to a listed part; parts are in order', () => {
    const partNums = parts.map((p) => p.number);
    for (const e of syllabus) expect(partNums).toContain(e.part);
    for (let i = 1; i < syllabus.length; i++) expect(syllabus[i]!.part).toBeGreaterThanOrEqual(syllabus[i - 1]!.part);
  });
  it('needs3d is set exactly on posts 20 and 31', () => {
    expect(syllabus.filter((e) => e.needs3d).map((e) => e.number)).toEqual([20, 31]);
  });
  it('neighbors skip unpublished posts', () => {
    const pub = new Set(['where-am-i', 'gaussians-and-covariance', 'least-squares']);
    const n = neighbors('gaussians-and-covariance', pub);
    expect(n.prev?.slug).toBe('where-am-i');
    expect(n.next?.slug).toBe('least-squares');
    expect(neighbors('where-am-i', pub).prev).toBeUndefined();
    expect(neighbors('nope', pub)).toEqual({ prev: undefined, next: undefined });
  });
  it('folderName and lookups', () => {
    expect(folderName(entryByNumber(2)!)).toBe('02-gaussians-and-covariance');
    expect(entryByNumber(99)).toBeUndefined();
  });
});

describe('reading time', () => {
  it('counts prose words, not math, code or tags', () => {
    const src = `---\ntitle: x\n---\nimport A from './a';\n\nOne two three $x^2$ four.\n\n$$\na = b\n$$\n\n<Widget client:visible />\n\n\`\`\`ts\nconst z = 1;\n\`\`\`\n`;
    expect(countWords(src)).toBe(5); // One two three [x] four
    expect(readingMinutes('word '.repeat(1000))).toBe(5);
    expect(readingMinutes('')).toBe(1);
  });
});

import { inlineMd } from '../../../src/lib/site/inline-md';
describe('inlineMd', () => {
  it('escapes HTML and renders *italic*', () => {
    expect(inlineMd('Thrun. *Probabilistic Robotics.* MIT <Press> & co')).toBe(
      'Thrun. <em>Probabilistic Robotics.</em> MIT &lt;Press&gt; &amp; co',
    );
  });
});
