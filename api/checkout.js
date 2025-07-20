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

    // Create Hosted Checkout Session using the CORRECT API
    const cloverResponse = await createHostedCheckoutSession({
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

// CORRECTED FUNCTION - Use Hosted Checkout API
async function createHostedCheckoutSession({ amount, originalAmount, discountAmount, coupon, customerData }) {
  const CLOVER_AUTH_TOKEN = process.env.CLOVER_AUTH_TOKEN;
  const CLOVER_MERCHANT_ID = process.env.CLOVER_MERCHANT_ID;
  
  // Use the CORRECT Clover Hosted Checkout API endpoint
  const HOSTED_CHECKOUT_URL = `https://scl-sandbox.dev.clover.com/v1/checkout`;

  try {
    // Create checkout session payload
    const checkoutPayload = {
      customer: {
        email: customerData?.email || 'test@example.com',
        name: customerData?.name || 'Test Customer'
      },
      shoppingCart: {
        lineItems: [
          {
            name: `Order ${coupon ? `with ${coupon.code} discount` : ''}`,
            unitQty: 1,
            price: amount * 100 // Clover expects cents
          }
        ]
      }
    };

    // Add discount as a separate line item if applicable
    if (discountAmount > 0 && coupon) {
      checkoutPayload.shoppingCart.lineItems.push({
        name: `Discount: ${coupon.code}`,
        unitQty: 1,
        price: -(discountAmount * 100) // Negative amount for discount
      });
    }

    // Create checkout session
    const checkoutResponse = await fetch(HOSTED_CHECKOUT_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CLOVER_AUTH_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Clover-Merchant-Id': CLOVER_MERCHANT_ID
      },
      body: JSON.stringify(checkoutPayload)
    });

    if (!checkoutResponse.ok) {
      const errorText = await checkoutResponse.text();
      console.error('Clover API Error:', errorText);
      throw new Error(`Checkout session creation failed: ${checkoutResponse.status}`);
    }

    const checkoutData = await checkoutResponse.json();
    
    return {
      success: true,
      checkoutUrl: checkoutData.href, // This will be the correct working URL
      sessionId: checkoutData.id
    };

  } catch (error) {
    console.error('Clover Hosted Checkout API error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}
