import Report from '../src/components/Report.jsx';
import { ProductCard } from '../src/components/ProductCard.jsx';

export default function Home({ products, orders }) {
  return (
    <main>
      {products.map((p) => <ProductCard key={p.id} product={p} />)}
      <Report orders={orders} />
    </main>
  );
}

export async function getServerSideProps() {
  return { props: { products: [], orders: [] } };
}
