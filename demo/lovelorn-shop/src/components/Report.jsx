import { cartTotal } from '../utils/cart.js';

export default function Report({ orders }) {
  const rows = orders.map((o) => {
    const d = new Date(o.createdAt);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const label = d.getFullYear() + '/' + month + '/' + day;
    return <tr key={o.id}><td>{label}</td><td>{cartTotal(o.items)}</td></tr>;
  });
  return <table>{rows}</table>;
}
