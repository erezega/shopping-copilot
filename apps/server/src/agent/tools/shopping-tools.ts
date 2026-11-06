import { tool } from 'ai';
import { z } from 'zod';
import { SORT_OPTIONS, type GetProductDetailsOutput, type SearchProductsOutput } from '@shopping-copilot/shared';

import { CatalogService, CatalogUnavailableError, type SearchParams } from '../../catalog/catalog.service';

const CATALOG_DOWN_MESSAGE = 'The product catalog is temporarily unavailable. Tell the user and suggest trying again shortly.';

/**
 * The model gets two tools. One broad search tool (instead of one-tool-per-endpoint) keeps the
 * model's decision simple: it only has to express intent as structured filters; which DummyJSON
 * endpoint(s) satisfy them is decided deterministically in CatalogService.
 *
 * `category` is a z.enum built from the live category list, so the model cannot invent a slug.
 */
export function createShoppingTools(catalog: CatalogService, categories: string[]) {
  const categorySchema =
    categories.length > 0 ? z.enum(categories as [string, ...string[]]) : z.string();

  return {
    searchProducts: tool({
      description:
        'Search the store catalog. Call once per distinct shopping need. ' +
        'Results are shown to the user as product cards automatically.',
      inputSchema: z.object({
        keywords: z
          .array(z.string())
          .max(5)
          .optional()
          .describe(
            'Single English words likely to appear in product titles/descriptions, e.g. ["phone"], ["watch","leather"]. ' +
              'The catalog matches substrings, so use singular, specific nouns; never phrases or adjectives like "cheap" or "cool".',
          ),
        category: categorySchema
          .nullable()
          .optional()
          .describe('Restrict to one category slug when the need clearly maps to one.'),
        minPrice: z.number().min(0).nullable().optional().describe('USD. null when the user gave no lower bound.'),
        maxPrice: z.number().min(0).nullable().optional().describe('USD. null when the user gave no upper bound.'),
        sortBy: z
          .enum(SORT_OPTIONS)
          .optional()
          .describe('price_asc for "cheap/budget", rating for "best/top rated", otherwise relevance.'),
        limit: z.number().int().min(1).max(12).optional().describe('Number of products to show, default 6.'),
      }),
      execute: async (input): Promise<SearchProductsOutput> => {
        try {
          return await catalog.searchProducts(normalizeSearchInput(input));
        } catch (err) {
          if (err instanceof CatalogUnavailableError) {
            return { products: [], totalMatches: 0, error: CATALOG_DOWN_MESSAGE };
          }
          throw err;
        }
      },
    }),

    getProductDetails: tool({
      description:
        'Get full details (warranty, shipping, return policy, reviews) of one product the user is asking about, by id from earlier results.',
      inputSchema: z.object({ id: z.number().int().positive() }),
      execute: async ({ id }): Promise<GetProductDetailsOutput> => {
        try {
          const product = await catalog.getProduct(id);
          return product ? { product } : { product: null, error: `No product with id ${id}.` };
        } catch (err) {
          if (err instanceof CatalogUnavailableError) return { product: null, error: CATALOG_DOWN_MESSAGE };
          throw err;
        }
      },
    }),
  };
}

/**
 * OpenAI function calling tends to fill every field, so "no limit" arrives as maxPrice: 0 (seen
 * in the eval: 0 results, then a wasted retry with maxPrice: 100000). Treat 0/null as "not set".
 */
export function normalizeSearchInput(input: {
  keywords?: string[];
  category?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  sortBy?: SearchParams['sortBy'];
  limit?: number;
}): SearchParams {
  return {
    keywords: input.keywords,
    category: input.category || undefined,
    minPrice: input.minPrice && input.minPrice > 0 ? input.minPrice : undefined,
    maxPrice: input.maxPrice && input.maxPrice > 0 ? input.maxPrice : undefined,
    sortBy: input.sortBy,
    limit: input.limit,
  };
}

export type ShoppingTools = ReturnType<typeof createShoppingTools>;
