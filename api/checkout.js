export default async function handler(req, res) {
  // CORS headers for Framer integration
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Environment variables validation
  const CLOVER_AUTH_TOKEN = process.env.CLOVER_AUTH_TOKEN;
  const CLOVER_MERCHANT_ID = process.env.CLOVER_MERCHANT_ID;
  
  if (!CLOVER_AUTH_TOKEN || !CLOVER_MERCHANT_ID) {
    return res.status(500).json({ 
      error: 'Server configuration error',
      details: 'Missing Clover credentials'
    });
  }

  try {
    const { amount, coupon, customerData } = req.body;
    
    // Input validation
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount provided' });
    }

    // Admin-managed coupon codes
    const coupons = [
      { code: 'SAVE10', type: 'percentage', value: 10, active: true },
      { code: 'SAVE20', type: 'percentage', value: 20, active: true },
      { code: 'SAVE50', type: 'percentage', value: 50, active: true }
    ];

    // Coupon validation and discount calculation
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

    // Create Clover hosted checkout session
    const cloverResponse = await createHostedCheckoutSession({
      amount: finalAmount,
      originalAmount: amount,
      discountAmount,
      coupon: appliedCoupon,
      customerData: customerData || {}
    });

    if (!cloverResponse.success) {
      console.error('Clover checkout creation failed:', cloverResponse.error);
      return res.status(500).json({ 
        error: 'Payment processing failed',
        details: cloverResponse.error
      });
    }

    return res.status(200).json({
      checkoutUrl: cloverResponse.checkoutUrl,
      originalAmount: amount,
      discountAmount,
      finalAmount,
      couponApplied: appliedCoupon?.code || null,
      sessionId: cloverResponse.sessionId
    });

  } catch (error) {
    console.error('Checkout processing error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
}

// Clover Hosted Checkout API integration
async function createHostedCheckoutSession({ amount, originalAmount, discountAmount, coupon, customerData }) {
  const CLOVER_AUTH_TOKEN = process.env.CLOVER_AUTH_TOKEN;
  const CLOVER_MERCHANT_ID = process.env.CLOVER_MERCHANT_ID;
  
  // Use Clover's Hosted Checkout API (correct endpoint)
  const HOSTED_CHECKOUT_URL = 'https://scl-sandbox.dev.clover.com/v1/checkout';

  try {
    // Build line items array
    const lineItems = [];
    
    // Main order line item
    lineItems.push({
      name: coupon ? `Order (${coupon.code} applied)` : 'Order',
      unitQty: 1,
      price: originalAmount * 100 // Clover expects cents
    });

    // Add discount as separate line item if applicable
    if (discountAmount > 0 && coupon) {
      lineItems.push({
        name: `Discount: ${coupon.code}`,
        unitQty: 1,
        price: -(discountAmount * 100) // Negative for discount
      });
    }

    // Checkout session payload
    const checkoutPayload = {
      customer: {
        email: customerData.email || 'customer@example.com',
        firstName: customerData.name?.split(' ')[0] || 'Customer',
        lastName: customerData.name?.split(' ').slice(1).join(' ') || 'User'
      },
      shoppingCart: {
        lineItems: lineItems
      }
    };

    // Make API request to Clover
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
      throw new Error(`Clover API returned ${checkoutResponse.status}: ${errorText}`);
    }

    const checkoutData = await checkoutResponse.json();
    
    return {
      success: true,
      checkoutUrl: checkoutData.href,
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
