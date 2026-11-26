/** Content-collection helpers (Astro-only; not used by pure lib code or tests). */
import { getCollection, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'posts'>;

/** Posts visible in this build: drafts are excluded from production builds (DESIGN §9). */
export async function visiblePosts(): Promise<Post[]> {
  const all = await getCollection('posts');
  return all
    .filter((p) => import.meta.env.DEV || p.data.status === 'published')
    .sort((a, b) => a.data.number - b.data.number);
}

/** Slugs of posts that are published (drafts never count as published in the syllabus). */
export async function publishedSlugs(): Promise<Set<string>> {
  const all = await getCollection('posts');
  return new Set(all.filter((p) => p.data.status === 'published').map((p) => p.id));
}
