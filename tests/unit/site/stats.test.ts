import { describe, expect, it } from 'vitest';
import { counterUrl, goatcounterBase, parseCount } from '../../../src/lib/site/stats';

describe('site statistics helpers', () => {
  it('builds counter URLs for the total and for base-path pages', () => {
    expect(goatcounterBase('my-site')).toBe('https://my-site.goatcounter.com');
    expect(counterUrl('my-site', 'TOTAL')).toBe('https://my-site.goatcounter.com/counter/TOTAL.json');
    expect(counterUrl('my-site', '/gaussians-to-graphs/posts/least-squares/')).toBe(
      'https://my-site.goatcounter.com/counter/%2Fgaussians-to-graphs%2Fposts%2Fleast-squares%2F.json',
    );
    expect(() => goatcounterBase('bad code/..')).toThrow();
  });
  it('parses formatted counts', () => {
    expect(parseCount('1,234')).toBe(1234);
    expect(parseCount('1 234 567')).toBe(1234567);
    expect(parseCount('0')).toBe(0);
    expect(parseCount(42)).toBe(42);
    expect(parseCount('')).toBeNull();
    expect(parseCount(undefined)).toBeNull();
  });
});
