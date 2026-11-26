import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';
import { siteConfig } from '../lib/site/config';
import { url, postPath } from '../lib/site/url';

export async function GET(context: APIContext) {
  const posts = (await getCollection('posts'))
    .filter((p) => p.data.status === 'published')
    .sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
  return rss({
    title: siteConfig.title,
    description: siteConfig.pitch,
    site: new URL(url(''), context.site),
    items: posts.map((p) => ({
      title: `${p.data.number}. ${p.data.title}`,
      description: p.data.description,
      pubDate: p.data.date,
      link: url(postPath(p.id)),
    })),
    customData: `<language>${siteConfig.lang}</language>`,
  });
}
