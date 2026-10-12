import { formatDate } from './date.js';

export function cartTotal(items) {
  return items.reduce((sum, item) => sum + item.price * item.qty, 0);
}

export function applyCoupon(total, coupon) {
  if (coupon == null) return total;
  return Math.round(total * (1 - coupon.percent / 100) * 100) / 100;
}

export function receiptHeader(order) {
  return `Order ${order.id} on ${formatDate(order.createdAt)}`;
}
