import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { postFrontmatter } from './lib/site/schema';

const posts = defineCollection({
  loader: glob({
    pattern: '*/index.mdx',
    base: './src/content/posts',
    // `02-gaussians-and-covariance/index.mdx` -> `gaussians-and-covariance`
    generateId: ({ entry }) => entry.split('/')[0]!.replace(/^\d+-/, ''),
  }),
  schema: postFrontmatter,
});

export const collections = { posts };
