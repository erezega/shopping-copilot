import { z } from 'zod';

import { ProductSummarySchema } from '../product/product.schema';

// The tool's INPUT schema lives on the server (shopping-tools.ts): its category enum is built
// at runtime from the live category list, so it cannot be a static shared schema.

export const SearchProductsOutputSchema = z.object({
  products: z.array(ProductSummarySchema),
  /** Matches before `limit` was applied — lets the model say "showing 6 of 23". */
  totalMatches: z.number(),
  /** Human-readable explanation when we relaxed the query (e.g. dropped keywords). */
  note: z.string().optional(),
  error: z.string().optional(),
});
