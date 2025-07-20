export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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

    // Create Clover hosted checkout session with CORRECT endpoint
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

// CORRECTED function with proper API endpoint
async function createHostedCheckoutSession({ amount, originalAmount, discountAmount, coupon, customerData }) {
  const CLOVER_AUTH_TOKEN = process.env.CLOVER_AUTH_TOKEN;
  const CLOVER_MERCHANT_ID = process.env.CLOVER_MERCHANT_ID;
  
  // CORRECT Clover Hosted Checkout API endpoint
  const HOSTED_CHECKOUT_URL = 'https://apisandbox.dev.clover.com/invoicingcheckoutservice/v1/checkouts';

  try {
    // Build line items array
    const lineItems = [];
    
    // Main order line item
    lineItems.push({
      name: coupon ? `Order (${coupon.code} applied)` : 'Order',
      price: originalAmount * 100, // Clover expects cents
      unitQty: 1,
      note: 'Online order'
    });

    // Add discount as separate line item if applicable
    if (discountAmount > 0 && coupon) {
      lineItems.push({
        name: `Discount: ${coupon.code}`,
        price: -(discountAmount * 100), // Negative for discount
        unitQty: 1,
        note: 'Coupon discount applied'
      });
    }

    // Checkout session payload with correct structure
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

    console.log('Making request to:', HOSTED_CHECKOUT_URL);
    console.log('Payload:', JSON.stringify(checkoutPayload, null, 2));

    // Make API request to Clover with CORRECT headers
    const checkoutResponse = await fetch(HOSTED_CHECKOUT_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CLOVER_AUTH_TOKEN}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Clover-Merchant-Id': CLOVER_MERCHANT_ID
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
