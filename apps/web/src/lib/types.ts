import type { UIMessage } from 'ai';
import type {
  GetProductDetailsOutput,
  SearchProductsInput,
  SearchProductsOutput,
} from '@shopping-copilot/shared';

/** Typed tool parts: `part.type === 'tool-searchProducts'` narrows input/output to these. */
export type ShoppingTools = {
  searchProducts: { input: SearchProductsInput; output: SearchProductsOutput };
  getProductDetails: { input: { id: number }; output: GetProductDetailsOutput };
};

export type ShoppingMessage = UIMessage<never, never, ShoppingTools>;
