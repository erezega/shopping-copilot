import type { ProductSummary } from '@shopping-copilot/shared';

import styles from './ProductCard.module.css';

export function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(price);
}

export function ProductCard({ product }: { product: ProductSummary }) {
  const hasDiscount = (product.discountPercentage ?? 0) >= 1;
  const originalPrice = hasDiscount ? product.price / (1 - product.discountPercentage! / 100) : null;
  const outOfStock = product.stock === 0;

  return (
    <article className={styles.card} data-testid="product-card">
      <div className={styles.imageWrap}>
        <img className={styles.image} src={product.thumbnail} alt={product.title} loading="lazy" />
        {hasDiscount && <span className={styles.badge}>-{Math.round(product.discountPercentage!)}%</span>}
      </div>
      <div className={styles.body}>
        <div className={styles.meta}>
          {product.brand ?? product.category.replace(/-/g, ' ')}
          {product.rating !== undefined && <span className={styles.rating}>★ {product.rating.toFixed(1)}</span>}
        </div>
        <h3 className={styles.title}>{product.title}</h3>
        <p className={styles.description}>{product.description}</p>
        <div className={styles.priceRow}>
          <span className={styles.price}>{formatPrice(product.price)}</span>
          {originalPrice && <span className={styles.original}>{formatPrice(originalPrice)}</span>}
          {outOfStock && <span className={styles.stock}>Out of stock</span>}
        </div>
      </div>
    </article>
  );
}
