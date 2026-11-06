import type { ToolExecutionOptions } from 'ai';

import { CatalogService, CatalogUnavailableError } from '../../catalog/catalog.service';
import { createShoppingTools, normalizeSearchInput } from './shopping-tools';

const execOptions = { toolCallId: 't1', messages: [] } as unknown as ToolExecutionOptions;

describe('normalizeSearchInput', () => {
  it('treats 0 and null price bounds as "no limit" (the model fills every field)', () => {
    expect(normalizeSearchInput({ minPrice: 0, maxPrice: 0, category: null })).toEqual(
      expect.objectContaining({ minPrice: undefined, maxPrice: undefined, category: undefined }),
    );
    expect(normalizeSearchInput({ maxPrice: 300 }).maxPrice).toBe(300);
  });
});

describe('searchProducts tool', () => {
  it('only accepts real category slugs (enum built from the live category list)', async () => {
    const tools = createShoppingTools(new CatalogService(), ['laptops', 'smartphones']);
    const schema = (tools.searchProducts.inputSchema as { safeParse: (v: unknown) => { success: boolean } });
    expect(schema.safeParse({ category: 'laptops' }).success).toBe(true);
    expect(schema.safeParse({ category: 'flights' }).success).toBe(false);
  });

  it('returns an error payload (not a thrown error) when the catalog is down, so the model can tell the user', async () => {
    const catalog = new CatalogService();
    jest.spyOn(catalog, 'searchProducts').mockRejectedValue(new CatalogUnavailableError('down'));
    const tools = createShoppingTools(catalog, []);
    const out = await tools.searchProducts.execute!({ keywords: ['phone'] }, execOptions);
    expect(out).toEqual(expect.objectContaining({ products: [], error: expect.stringContaining('unavailable') }));
  });
});
