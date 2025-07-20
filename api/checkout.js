export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { amount, coupon, customerData } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    // Your admin-created coupons
    const coupons = [
      { code: 'SAVE10', type: 'percentage', value: 10, active: true },
      { code: 'SAVE20', type: 'percentage', value: 20, active: true },
      { code: 'SAVE50', type: 'percentage', value: 50, active: true }
    ];

    let discountAmount = 0;
    let appliedCoupon = null;
    
    if (coupon) {
      const foundCoupon = coupons.find(c => c.code === coupon && c.active);
      if (foundCoupon) {
        discountAmount = Math.round((amount * foundCoupon.value) / 100);
        appliedCoupon = foundCoupon;
      }
    }

    const finalAmount = Math.max(0, amount - discountAmount);

    // Create Clover order
    const cloverResponse = await createCloverOrder({
      amount: finalAmount,
      originalAmount: amount,
      discountAmount,
      coupon: appliedCoupon,
      customerData
    });

    if (!cloverResponse.success) {
      return res.status(500).json({ error: 'Payment processing failed' });
    }

    return res.status(200).json({
      checkoutUrl: cloverResponse.checkoutUrl,
      originalAmount: amount,
      discountAmount,
      finalAmount,
      couponApplied: appliedCoupon?.code || null
    });

  } catch (error) {
    console.error('Checkout error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function createCloverOrder({ amount, originalAmount, discountAmount, coupon, customerData }) {
  const CLOVER_AUTH_TOKEN = process.env.CLOVER_AUTH_TOKEN;
  const CLOVER_MERCHANT_ID = process.env.CLOVER_MERCHANT_ID;
  const CLOVER_BASE_URL = process.env.CLOVER_BASE_URL || 'https://apisandbox.dev.clover.com';

  try {
    // Create order in Clover
    const orderResponse = await fetch(`${CLOVER_BASE_URL}/v3/merchants/${CLOVER_MERCHANT_ID}/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CLOVER_AUTH_TOKEN}`,
        'Content-Type': 'application/json',
      }, 
      body: JSON.stringify({
        total: amount * 100, // Clover expects 
        state: 'open'
      })
    });

    if (!orderResponse.ok) {
      throw new Error(`Order creation failed: ${orderResponse.status}`);
    }

    const order = await orderResponse.json();

    // Add discount if applicable
    if (discountAmount > 0 && coupon) {
      await fetch(`${CLOVER_BASE_URL}/v3/merchants/${CLOVER_MERCHANT_ID}/orders/${order.id}/discounts`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${CLOVER_AUTH_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: `Coupon: ${coupon.code}`,
          amount: discountAmount * 100
        })
      });
    }

    const checkoutUrl = `https://sandbox.dev.clover.com/payment-links/${order.id}`;

    return {
      success: true,
      checkoutUrl,
      orderId: order.id
    };

  } catch (error) {
    console.error('Clover API error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}
