import { cartTotal, applyCoupon } from '../../src/utils/cart.js';

export default function handler(req, res) {
  const total = applyCoupon(cartTotal(req.body.items), req.body.coupon);
  res.status(200).json({ total });
}
