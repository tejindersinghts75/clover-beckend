const axios = require('axios');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { coupon, amount } = req.body;
  const merchantId = process.env.CLOVER_MERCHANT_ID;
  const apiKey = process.env.CLOVER_API_KEY;
  const baseUrl = 'https://sandbox.dev.clover.com';

  // Simple coupon logic
  const coupons = {
    SAVE10: { type: 'percentage', value: 10 }, // 10% off
    SAVE20: { type: 'percentage', value: 20 }, // 20% off
  };

  // Convert amount to cents (Clover expects cents)
  let finalAmount = Math.round(amount * 100);
  let discountApplied = 0;

  if (coupon && coupons[coupon]) {
    const couponDetails = coupons[coupon];
    if (couponDetails.type === 'percentage') {
      discountApplied = Math.round((couponDetails.value / 100) * finalAmount);
      finalAmount -= discountApplied;
    }
  }

  try {
    const response = await axios.post(
      `${baseUrl}/v1/checkouts`,
      {
        amount: finalAmount,
        currency: 'USD',
        items: [
          {
            name: 'Order Total',
            price: finalAmount,
            description: coupon ? `Discount applied: ${coupon}` : 'No discount',
          },
        ],
        source: 'online',
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const checkoutUrl = response.data.href;
    return res.status(200).json({ checkoutUrl });
  } catch (error) {
    console.error('Clover API error:', error.response?.data || error.message);
    return res.status(500).json({ error: 'Failed to create checkout' });
  }
}