import { z } from 'zod';

/**
 * Contract between server (tool output) and web (product widgets).
 * Kept deliberately small: it is both what the UI renders and what the model reads back
 * on later turns, so every field costs tokens on every follow-up message.
 */
export const ProductSummarySchema = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string(),
  price: z.number(),
  discountPercentage: z.number().optional(),
  rating: z.number().optional(),
  stock: z.number().optional(),
  brand: z.string().optional(),
  category: z.string(),
  thumbnail: z.string(),
});

export const ProductDetailsSchema = ProductSummarySchema.extend({
  warrantyInformation: z.string().optional(),
  shippingInformation: z.string().optional(),
  returnPolicy: z.string().optional(),
  availabilityStatus: z.string().optional(),
  images: z.array(z.string()).optional(),
  reviews: z
    .array(z.object({ rating: z.number(), comment: z.string() }))
    .optional(),
});
