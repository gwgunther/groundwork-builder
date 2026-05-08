import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string().max(160),
    publishDate: z.date(),
    updatedDate: z.date().optional(),
    targetKeyword: z.string(),
    // TODO: Update categories to match your practice's service areas
    category: z.enum(['general-dentistry', 'cosmetic', 'implants', 'restorative', 'oral-health']),
    author: z.string().default('[PRACTICE_NAME]'),
    draft: z.boolean().default(false),
    featuredImage: z.string().optional(),
    featuredImageAlt: z.string().optional(),
    faqs: z.array(z.object({
      question: z.string(),
      answer: z.string(),
    })).optional(),
  }),
});

export const collections = { blog };
