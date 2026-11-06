import { Injectable, Logger } from '@nestjs/common';
import type { ProductDetails, ProductSummary, SearchProductsOutput, SortOption } from '@shopping-copilot/shared';

/** Raw product shape from DummyJSON (only the fields we read). */
export interface RawProduct {
  id: number;
  title: string;
  description: string;
  category: string;
  price: number;
  discountPercentage?: number;
  rating?: number;
  stock?: number;
  brand?: string;
  tags?: string[];
  thumbnail: string;
  images?: string[];
  warrantyInformation?: string;
  shippingInformation?: string;
  returnPolicy?: string;
  availabilityStatus?: string;
  reviews?: { rating: number; comment: string }[];
}

interface ProductListResponse {
  products: RawProduct[];
  total: number;
}

export interface SearchParams {
  keywords?: string[];
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: SortOption;
  limit?: number;
}

export class CatalogUnavailableError extends Error {}

const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 12;
const DESCRIPTION_MAX = 140;
const CACHE_TTL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8000;

/**
 * Thin client over the DummyJSON Products API plus the retrieval logic the API lacks.
 *
 * Why the logic lives here and not in the API: `/products/search` is a single-substring match
 * ("running shoes" → 0 hits, "shoes" → 4) and no endpoint filters by price. So we search one
 * keyword at a time, merge + rank the hits ourselves, and filter/sort by price locally.
 * The whole catalog is ~200 items, so fetching `limit=0` per keyword/category is cheap.
 */
@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);
  private readonly cache = new Map<string, { at: number; value: unknown }>();
  private categories: string[] | null = null;
  private readonly baseUrl = process.env.DUMMYJSON_BASE_URL ?? 'https://dummyjson.com';

  /** Category slugs, used both in the system prompt and as an enum in the tool schema. */
  async getCategories(): Promise<string[]> {
    if (!this.categories) {
      this.categories = await this.get<string[]>('/products/category-list');
    }
    return this.categories;
  }

  async searchProducts(params: SearchParams): Promise<SearchProductsOutput> {
    const keywords = normalizeKeywords(params.keywords);
    const limit = Math.min(Math.max(params.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    let note: string | undefined;

    let candidates: RawProduct[];
    if (params.category) {
      candidates = (await this.get<ProductListResponse>(`/products/category/${encodeURIComponent(params.category)}?limit=0`)).products;
      if (keywords.length) {
        const filtered = candidates.filter((p) => matchCount(p, keywords) > 0);
        if (filtered.length) {
          candidates = filtered;
        } else {
          note = `No "${params.category}" products matched ${keywords.join(', ')}; showing the category instead.`;
        }
      }
    } else if (keywords.length) {
      const results = await Promise.all(
        keywords.map((k) => this.get<ProductListResponse>(`/products/search?q=${encodeURIComponent(k)}&limit=0`)),
      );
      candidates = dedupeById(results.flatMap((r) => r.products));
    } else {
      candidates = (await this.get<ProductListResponse>('/products?limit=0')).products;
    }

    let matches = candidates.filter(
      (p) =>
        (params.minPrice === undefined || p.price >= params.minPrice) &&
        (params.maxPrice === undefined || p.price <= params.maxPrice),
    );
    if (!matches.length && candidates.length && (params.minPrice !== undefined || params.maxPrice !== undefined)) {
      const cheapest = Math.min(...candidates.map((p) => p.price));
      note = `${candidates.length} products matched, but none in the requested price range (cheapest is $${cheapest}).`;
    }

    matches = sortProducts(matches, params.sortBy ?? 'relevance', keywords);

    return {
      products: matches.slice(0, limit).map(toSummary),
      totalMatches: matches.length,
      ...(note ? { note } : {}),
    };
  }

  async getProduct(id: number): Promise<ProductDetails | null> {
    try {
      const p = await this.get<RawProduct>(`/products/${id}`);
      return {
        ...toSummary(p),
        description: p.description,
        warrantyInformation: p.warrantyInformation,
        shippingInformation: p.shippingInformation,
        returnPolicy: p.returnPolicy,
        availabilityStatus: p.availabilityStatus,
        images: p.images?.slice(0, 4),
        reviews: p.reviews?.slice(0, 3).map(({ rating, comment }) => ({ rating, comment })),
      };
    } catch (err) {
      if (err instanceof NotFoundError) return null;
      throw err;
    }
  }

  private async get<T>(path: string): Promise<T> {
    const hit = this.cache.get(path);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value as T;

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (err) {
      this.logger.warn(`DummyJSON request failed: ${path} — ${(err as Error).message}`);
      throw new CatalogUnavailableError('Product catalog is unreachable');
    }
    if (res.status === 404) throw new NotFoundError(path);
    if (!res.ok) {
      this.logger.warn(`DummyJSON ${res.status} for ${path}`);
      throw new CatalogUnavailableError(`Product catalog returned ${res.status}`);
    }
    const value = (await res.json()) as T;
    this.cache.set(path, { at: Date.now(), value });
    return value;
  }
}

class NotFoundError extends Error {}

/** Lowercase, split multi-word entries ("running shoes" → running, shoes), dedupe, cap at 5. */
export function normalizeKeywords(keywords: string[] | undefined): string[] {
  const words = (keywords ?? [])
    .flatMap((k) => k.toLowerCase().split(/[^\p{L}\p{N}-]+/u))
    .map((w) => w.trim())
    .filter((w) => w.length >= 2);
  return [...new Set(words)].slice(0, 5);
}

function haystack(p: RawProduct): string {
  return [p.title, p.description, p.brand, p.category, ...(p.tags ?? [])].join(' ').toLowerCase();
}

export function matchCount(p: RawProduct, keywords: string[]): number {
  const text = haystack(p);
  return keywords.reduce((n, k) => n + (text.includes(k) ? 1 : 0), 0);
}

function dedupeById(products: RawProduct[]): RawProduct[] {
  return [...new Map(products.map((p) => [p.id, p])).values()];
}

/** Relevance = how many keywords hit, title hits weighted higher, then rating as a tie-breaker. */
function relevanceScore(p: RawProduct, keywords: string[]): number {
  const title = p.title.toLowerCase();
  const titleHits = keywords.filter((k) => title.includes(k)).length;
  return matchCount(p, keywords) * 10 + titleHits * 5 + (p.rating ?? 0);
}

export function sortProducts(products: RawProduct[], sortBy: SortOption, keywords: string[]): RawProduct[] {
  const sorted = [...products];
  switch (sortBy) {
    case 'price_asc':
      return sorted.sort((a, b) => a.price - b.price);
    case 'price_desc':
      return sorted.sort((a, b) => b.price - a.price);
    case 'rating':
      return sorted.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    case 'relevance':
    default:
      return sorted.sort((a, b) => relevanceScore(b, keywords) - relevanceScore(a, keywords));
  }
}

export function toSummary(p: RawProduct): ProductSummary {
  return {
    id: p.id,
    title: p.title,
    description: p.description.length > DESCRIPTION_MAX ? `${p.description.slice(0, DESCRIPTION_MAX - 1).trimEnd()}…` : p.description,
    price: p.price,
    discountPercentage: p.discountPercentage,
    rating: p.rating,
    stock: p.stock,
    brand: p.brand,
    category: p.category,
    thumbnail: p.thumbnail,
  };
}
