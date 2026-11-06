import { CatalogService, CatalogUnavailableError, normalizeKeywords, type RawProduct } from './catalog.service';

const product = (id: number, title: string, price: number, extra: Partial<RawProduct> = {}): RawProduct => ({
  id,
  title,
  description: `${title} description`,
  category: 'misc',
  price,
  rating: 4,
  thumbnail: `https://img/${id}.png`,
  ...extra,
});

/** Fake DummyJSON: answers by path so tests document exactly which endpoints are hit. */
function mockFetch(routes: Record<string, unknown>) {
  const calls: string[] = [];
  const fn = jest.fn(async (url: string) => {
    const path = url.replace('https://dummyjson.com', '');
    calls.push(path);
    if (!(path in routes)) return new Response('not found', { status: 404 });
    return new Response(JSON.stringify(routes[path]), { status: 200 });
  });
  global.fetch = fn as unknown as typeof fetch;
  return calls;
}

const list = (products: RawProduct[]) => ({ products, total: products.length });

describe('normalizeKeywords', () => {
  it('splits phrases, lowercases, dedupes, drops 1-char tokens', () => {
    expect(normalizeKeywords(['Running Shoes', 'shoes', 'a'])).toEqual(['running', 'shoes']);
  });
  it('caps at 5 keywords', () => {
    expect(normalizeKeywords(['a1 b2 c3 d4 e5 f6'])).toHaveLength(5);
  });
});

describe('CatalogService.searchProducts', () => {
  let catalog: CatalogService;
  beforeEach(() => {
    catalog = new CatalogService();
  });

  it('searches each keyword separately (API is single-substring) and merges without duplicates', async () => {
    const calls = mockFetch({
      '/products/search?q=gaming&limit=0': list([]),
      '/products/search?q=laptop&limit=0': list([product(1, 'Asus Laptop', 1000), product(2, 'Dell Laptop', 900)]),
    });
    const res = await catalog.searchProducts({ keywords: ['gaming laptop'] });
    expect(calls).toEqual(['/products/search?q=gaming&limit=0', '/products/search?q=laptop&limit=0']);
    expect(res.products.map((p) => p.id).sort()).toEqual([1, 2]);
  });

  it('ranks products matching more keywords first', async () => {
    mockFetch({
      '/products/search?q=leather&limit=0': list([product(1, 'Leather Bag', 50), product(2, 'Leather Watch', 80)]),
      '/products/search?q=watch&limit=0': list([product(2, 'Leather Watch', 80), product(3, 'Gold Watch', 90)]),
    });
    const res = await catalog.searchProducts({ keywords: ['leather', 'watch'] });
    expect(res.products[0].id).toBe(2);
  });

  it('filters by price locally, since no endpoint supports it', async () => {
    mockFetch({ '/products/category/smartphones?limit=0': list([product(1, 'A', 100), product(2, 'B', 500), product(3, 'C', 250)]) });
    const res = await catalog.searchProducts({ category: 'smartphones', maxPrice: 300, sortBy: 'price_asc' });
    expect(res.products.map((p) => p.price)).toEqual([100, 250]);
    expect(res.totalMatches).toBe(2);
  });

  it('explains when nothing is in the price range', async () => {
    mockFetch({ '/products/category/laptops?limit=0': list([product(1, 'A', 1100), product(2, 'B', 1500)]) });
    const res = await catalog.searchProducts({ category: 'laptops', maxPrice: 500 });
    expect(res.products).toEqual([]);
    expect(res.note).toContain('cheapest is $1100');
  });

  it('falls back to the whole category when keywords match nothing in it', async () => {
    mockFetch({ '/products/category/laptops?limit=0': list([product(1, 'Asus Zenbook', 1000)]) });
    const res = await catalog.searchProducts({ category: 'laptops', keywords: ['gaming'] });
    expect(res.products).toHaveLength(1);
    expect(res.note).toMatch(/showing the category instead/);
  });

  it('browses the full catalog when no keywords or category are given (e.g. "something cheap")', async () => {
    const calls = mockFetch({ '/products?limit=0': list([product(1, 'A', 30), product(2, 'B', 5)]) });
    const res = await catalog.searchProducts({ sortBy: 'price_asc' });
    expect(calls).toEqual(['/products?limit=0']);
    expect(res.products[0].price).toBe(5);
  });

  it('applies the default limit of 6 and caps at 12', async () => {
    mockFetch({ '/products?limit=0': list(Array.from({ length: 30 }, (_, i) => product(i + 1, `P${i}`, i))) });
    expect((await catalog.searchProducts({})).products).toHaveLength(6);
    expect((await catalog.searchProducts({ limit: 50 })).products).toHaveLength(12);
  });

  it('truncates long descriptions to keep tool output (and tokens) small', async () => {
    mockFetch({ '/products?limit=0': list([product(1, 'A', 1, { description: 'x'.repeat(500) })]) });
    const res = await catalog.searchProducts({});
    expect(res.products[0].description.length).toBeLessThanOrEqual(140);
  });

  it('caches responses so repeated searches do not re-hit the API', async () => {
    const calls = mockFetch({ '/products?limit=0': list([product(1, 'A', 1)]) });
    await catalog.searchProducts({});
    await catalog.searchProducts({ sortBy: 'rating' });
    expect(calls).toHaveLength(1);
  });

  it('throws CatalogUnavailableError when the API is down', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;
    await expect(catalog.searchProducts({ keywords: ['phone'] })).rejects.toBeInstanceOf(CatalogUnavailableError);
  });
});

describe('CatalogService.getProduct', () => {
  it('returns null for an unknown id', async () => {
    mockFetch({});
    expect(await new CatalogService().getProduct(9999)).toBeNull();
  });
});
