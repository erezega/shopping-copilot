import type { z } from 'zod';

import type { SORT_OPTIONS } from '../../constants/search';
import type { SearchProductsOutputSchema } from '../../schemas/search-products/search-products.schema';

export type SortOption = (typeof SORT_OPTIONS)[number];

/** Input the model sends to searchProducts (the zod schema lives with the tool on the server). */
export interface SearchProductsInput {
  keywords?: string[];
  category?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  sortBy?: SortOption;
  limit?: number;
}

export type SearchProductsOutput = z.infer<typeof SearchProductsOutputSchema>;
