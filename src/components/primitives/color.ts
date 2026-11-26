/** Parse a CSS color as returned by getComputedStyle for a custom property (#rgb, #rrggbb, rgb(...)). */
export function parseColor(c: string): [number, number, number] {
  const s = c.trim();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(s);
  if (short)
    return [
      parseInt(short[1]! + short[1]!, 16),
      parseInt(short[2]! + short[2]!, 16),
      parseInt(short[3]! + short[3]!, 16),
    ];
  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(s);
  if (long) return [parseInt(long[1]!, 16), parseInt(long[2]!, 16), parseInt(long[3]!, 16)];
  const rgb = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(s);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return [128, 128, 128];
}
