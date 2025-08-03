export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Environment variables validation
  const CLOVER_AUTH_TOKEN = process.env.CLOVER_AUTH_TOKEN; // ⚠️ Must be PRODUCTION token
  const CLOVER_MERCHANT_ID = process.env.CLOVER_MERCHANT_ID; // ⚠️ Must be PRODUCTION merchant ID
  
  if (!CLOVER_AUTH_TOKEN || !CLOVER_MERCHANT_ID) {
    return res.status(500).json({ 
      error: 'Server configuration error',
      details: 'Missing Clover credentials'
    });
  }

  try {
    const { amount, coupon, customerData } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount provided' });
    }

    // Coupon validation
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

    // Create Clover hosted checkout session
    const cloverResponse = await createHostedCheckoutSession({
      amount: finalAmount,
      originalAmount: amount,
      discountAmount,
      coupon: appliedCoupon,
      customerData: customerData || {}
    });

    if (!cloverResponse.success) {
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

async function createHostedCheckoutSession({ amount, originalAmount, discountAmount, coupon, customerData }) {
  const CLOVER_AUTH_TOKEN = process.env.CLOVER_AUTH_TOKEN; // ⚠️ Must be PRODUCTION token
  const CLOVER_MERCHANT_ID = process.env.CLOVER_MERCHANT_ID; // ⚠️ Must be PRODUCTION merchant ID
  
  // ✅ FIXED: Use production URL instead of sandbox
  const HOSTED_CHECKOUT_URL = 'https://api.clover.com/invoicingcheckoutservice/v1/checkouts';
  // For Europe: 'https://api.eu.clover.com/invoicingcheckoutservice/v1/checkouts'
  // For Latin America: 'https://api.la.clover.com/invoicingcheckoutservice/v1/checkouts'

  try {
    const lineItemName = coupon 
      ? `Order (${coupon.code} applied - $${discountAmount} off)` 
      : 'Order';

    const checkoutPayload = {
      customer: {
        email: customerData.email || 'customer@example.com',
        firstName: customerData.name?.split(' ')[0] || 'Customer',
        lastName: customerData.name?.split(' ').slice(1).join(' ') || 'User'
      },
      shoppingCart: {
        lineItems: [
          {
            name: lineItemName,
            price: amount * 100, // Final amount in cents
            unitQty: 1,
            note: coupon ? `Original: $${originalAmount}, Discount: $${discountAmount}` : 'Online order'
          }
        ]
      }
    };

    console.log('Making request to:', HOSTED_CHECKOUT_URL);
    console.log('Payload:', JSON.stringify(checkoutPayload, null, 2));

    const checkoutResponse = await fetch(HOSTED_CHECKOUT_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CLOVER_AUTH_TOKEN}`, // ⚠️ Must be production token
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Clover-Merchant-Id': CLOVER_MERCHANT_ID // ⚠️ Must be production merchant ID
      },
      body: JSON.stringify(checkoutPayload)
    });

    console.log('Response status:', checkoutResponse.status);

    if (!checkoutResponse.ok) {
      const errorText = await checkoutResponse.text();
      console.error('Clover API Error Response:', errorText);
      throw new Error(`Clover API returned ${checkoutResponse.status}: ${errorText}`);
    }

    const checkoutData = await checkoutResponse.json();
    console.log('Success response:', checkoutData);
    
    return {
      success: true,
      checkoutUrl: checkoutData.href,
      sessionId: checkoutData.checkoutSessionId
    };

  } catch (error) {
    console.error('Clover Hosted Checkout API error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}
