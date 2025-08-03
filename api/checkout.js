export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Environment variables
  const CLOVER_API_KEY = process.env.CLOVER_AUTH_TOKEN;
  const CLOVER_ECOMMERCE_ID = process.env.CLOVER_MERCHANT_ID;
  const IS_PRODUCTION = process.env.NODE_ENV === 'production';
  
  if (!CLOVER_API_KEY || !CLOVER_ECOMMERCE_ID) {
    return res.status(500).json({ 
      error: 'Server configuration error',
      details: 'Missing Clover credentials'
    });
  }

  try {
    const { amount, coupon, customerData } = req.body;
    
    // Validate amount
    if (!amount || amount <= 0 || isNaN(amount)) {
      return res.status(400).json({ error: 'Invalid amount provided' });
    }

    // 1. Apply coupon discount
    const coupons = [
      { code: 'SAVE10', type: 'percentage', value: 10, active: true },
      { code: 'SAVE20', type: 'percentage', value: 20, active: true },
      { code: 'SAVE50', type: 'percentage', value: 50, active: true }
    ];

    let discountAmount = 0;
    let appliedCoupon = null;
    
    if (coupon) {
      const foundCoupon = coupons.find(c => 
        c.code === coupon && c.active
      );
      
      if (foundCoupon) {
        discountAmount = (amount * foundCoupon.value) / 100;
        appliedCoupon = foundCoupon;
      }
    }

    const finalAmount = Math.max(0, amount - discountAmount);

    // 2. Create Clover payment session
    const baseUrl = IS_PRODUCTION 
      ? 'https://api.clover.com' 
      : 'https://sandbox.dev.clover.com';

    const response = await fetch(`${baseUrl}/pay/authorize`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CLOVER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: Math.round(finalAmount * 100), // Convert to cents
        currency: "USD",
        source: CLOVER_ECOMMERCE_ID,
        redirect_url: "https://your-website.com/thank-you",
        cancel_url: "https://your-website.com/cancel",
        email: customerData?.email || "",
        name: customerData?.name || ""
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Clover API: ${response.status} - ${errorData}`);
    }

    const paymentData = await response.json();
    
    // 3. Generate checkout URL
    const checkoutBase = IS_PRODUCTION
      ? 'https://checkout.clover.com'
      : 'https://checkout.sandbox.dev.clover.com';
    
    const checkoutUrl = `${checkoutBase}/pay?payment_id=${paymentData.id}`;

    return res.status(200).json({
      checkoutUrl,
      originalAmount: amount,
      discountAmount,
      finalAmount,
      couponApplied: appliedCoupon?.code || null,
      paymentId: paymentData.id
    });

  } catch (error) {
    console.error('Payment Error:', error);
    return res.status(500).json({ 
      error: 'Payment processing failed',
      details: error.message 
    });
  }
}