import { slugify, titleCase } from '../utils/strings.js';

export function PriceTag({ amount }) {
  return <span className="price">${amount.toFixed(2)}</span>;
}

export function ProductCard({ product }) {
  return (
    <a href={`/p/${slugify(product.name)}`} className="card">
      <h3>{titleCase(product.name)}</h3>
      <p>Don't miss it, it's on sale</p>
      <PriceTag amount={product.price} />
    </a>
  );
}

export function LegacyBadge({ label }) {
  return <b className="badge">{label}</b>;
}
