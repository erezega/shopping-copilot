import { z } from 'zod';

import { ProductDetailsSchema } from '../product/product.schema';

export const GetProductDetailsOutputSchema = z.object({
  product: ProductDetailsSchema.nullable(),
  error: z.string().optional(),
});
