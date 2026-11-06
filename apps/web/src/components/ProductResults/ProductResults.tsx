import type { SearchProductsInput, SearchProductsOutput } from '@shopping-copilot/shared';

import { formatPrice, ProductCard } from '../ProductCard';
import styles from './ProductResults.module.css';

/** "phone · smartphones · under $300 · cheapest first" — shows the user how the agent read their request. */
export function describeQuery(input: SearchProductsInput | undefined): string {
  if (!input) return 'products';
  // 0/null price bounds mean "no limit" (the model fills every field); don't display them.
  const min = input.minPrice || undefined;
  const max = input.maxPrice || undefined;
  const bits: string[] = [];
  if (input.keywords?.length) bits.push(input.keywords.join(', '));
  if (input.category) bits.push(input.category.replace(/-/g, ' '));
  if (min !== undefined && max !== undefined) bits.push(`${formatPrice(min)}–${formatPrice(max)}`);
  else if (max !== undefined) bits.push(`under ${formatPrice(max)}`);
  else if (min !== undefined) bits.push(`over ${formatPrice(min)}`);
  if (input.sortBy === 'price_asc') bits.push('cheapest first');
  if (input.sortBy === 'price_desc') bits.push('priciest first');
  if (input.sortBy === 'rating') bits.push('top rated');
  return bits.join(' · ') || 'all products';
}

interface Props {
  input: SearchProductsInput | undefined;
  output: SearchProductsOutput;
}

export function ProductResults({ input, output }: Props) {
  if (output.error) {
    return <div className={styles.error} role="alert">{output.error}</div>;
  }
  return (
    <section className={styles.results} data-testid="product-results">
      <header className={styles.header}>
        <span>{describeQuery(input)}</span>
        {output.products.length > 0 && (
          <span>
            {output.products.length < output.totalMatches
              ? `${output.products.length} of ${output.totalMatches}`
              : `${output.products.length} result${output.products.length === 1 ? '' : 's'}`}
          </span>
        )}
      </header>
      {output.note && <p className={styles.note}>{output.note}</p>}
      {output.products.length === 0 ? (
        <p className={styles.empty}>No matching products.</p>
      ) : (
        <div className={styles.grid}>
          {output.products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </section>
  );
}

export function ProductResultsSkeleton({ input }: { input: SearchProductsInput | undefined }) {
  return (
    <section className={styles.results} aria-busy="true">
      <header className={styles.header}>
        <span>Searching {input ? describeQuery(input) : '…'}</span>
      </header>
      <div className={styles.grid}>
        {[0, 1, 2].map((i) => (
          <div key={i} className={styles.skeleton} />
        ))}
      </div>
    </section>
  );
}
