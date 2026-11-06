import type { z } from 'zod';

import type { ProductDetailsSchema, ProductSummarySchema } from '../../schemas/product/product.schema';

// Inferred from the schemas (not hand-written) so a type can never drift from its schema.
export type ProductSummary = z.infer<typeof ProductSummarySchema>;
export type ProductDetails = z.infer<typeof ProductDetailsSchema>;
