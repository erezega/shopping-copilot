// Sort orders the searchProducts tool accepts. The model picks one; CatalogService applies it
// locally, because DummyJSON's search endpoint cannot sort.
export const SORT_OPTIONS = ['relevance', 'price_asc', 'price_desc', 'rating'] as const;
