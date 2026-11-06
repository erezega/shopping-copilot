import type { z } from 'zod';

import type { GetProductDetailsOutputSchema } from '../../schemas/product-details/product-details.schema';

export type GetProductDetailsOutput = z.infer<typeof GetProductDetailsOutputSchema>;
