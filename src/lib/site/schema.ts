import { z } from 'astro/zod';

/** Frontmatter schema for posts (DESIGN §5.3). Shared by Astro and scripts/validate-content.ts. */
export const postFrontmatter = z.object({
  number: z.number().int().min(1).max(32),
  title: z.string().min(1),
  description: z.string().min(1).max(160),
  part: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  status: z.enum(['draft', 'published']),
  date: z.coerce.date(),
  updated: z.coerce.date().optional(),
  prerequisites: z.array(z.string()),
  objectives: z.array(z.string().min(1)).min(3).max(5),
  references: z.array(z.object({ key: z.string(), text: z.string(), url: z.url().optional() })),
  widgets: z.array(z.string()),
  /**
   * Key symbols shown in the "Symbols in this post" card. `tex` is displayed; `match` lists TeX
   * fragments that identify the symbol in the post's math (defaults to [tex]).
   */
  symbols: z
    .array(
      z.object({ tex: z.string().min(1), meaning: z.string().min(1), match: z.array(z.string().min(1)).optional() }),
    )
    .default([]),
  needs3d: z.boolean().optional(),
});

export type PostFrontmatter = z.infer<typeof postFrontmatter>;
