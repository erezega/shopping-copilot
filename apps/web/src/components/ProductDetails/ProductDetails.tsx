import type { GetProductDetailsOutput } from '@shopping-copilot/shared';

import { formatPrice } from '../ProductCard';
import styles from './ProductDetails.module.css';

export function ProductDetails({ output }: { output: GetProductDetailsOutput }) {
  const p = output.product;
  if (!p) return <div className={styles.error}>{output.error ?? 'Product not found.'}</div>;
  return (
    <article className={styles.details} data-testid="product-details">
      <img className={styles.image} src={p.thumbnail} alt={p.title} />
      <div className={styles.body}>
        <h3 className={styles.title}>{p.title}</h3>
        <div className={styles.price}>
          {formatPrice(p.price)}
          {p.rating !== undefined && <span className={styles.rating}>★ {p.rating.toFixed(1)}</span>}
        </div>
        <p className={styles.description}>{p.description}</p>
        <dl className={styles.facts}>
          {p.availabilityStatus && (<><dt>Availability</dt><dd>{p.availabilityStatus}</dd></>)}
          {p.shippingInformation && (<><dt>Shipping</dt><dd>{p.shippingInformation}</dd></>)}
          {p.warrantyInformation && (<><dt>Warranty</dt><dd>{p.warrantyInformation}</dd></>)}
          {p.returnPolicy && (<><dt>Returns</dt><dd>{p.returnPolicy}</dd></>)}
        </dl>
        {p.reviews && p.reviews.length > 0 && (
          <ul className={styles.reviews}>
            {p.reviews.map((r, i) => (
              <li key={i}>
                <span className={styles.rating}>{'★'.repeat(r.rating)}</span> {r.comment}
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}
