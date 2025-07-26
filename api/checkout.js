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

    // Create Clover hosted checkout session with retry logic
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

// Enhanced function with comprehensive retry and backoff logic
async function createHostedCheckoutSession({ amount, originalAmount, discountAmount, coupon, customerData }) {
  const CLOVER_AUTH_TOKEN = process.env.CLOVER_AUTH_TOKEN;
  const CLOVER_MERCHANT_ID = process.env.CLOVER_MERCHANT_ID;
  
  // Production URL
  const HOSTED_CHECKOUT_URL = 'https://api.clover.com/invoicingcheckoutservice/v1/checkouts';

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
            price: amount * 100, // In cents
            unitQty: 1,
            note: coupon ? `Original: $${originalAmount}, Discount: $${discountAmount}` : 'Online order'
          }
        ]
      }
    };

    // Make API request with retry logic
    const result = await makeRequestWithRetry(HOSTED_CHECKOUT_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CLOVER_AUTH_TOKEN}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Clover-Merchant-Id': CLOVER_MERCHANT_ID
      },
      body: JSON.stringify(checkoutPayload)
    });

    return {
      success: true,
      checkoutUrl: result.href,
      sessionId: result.checkoutSessionId
    };

  } catch (error) {
    console.error('Clover Hosted Checkout API error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Robust retry function with exponential backoff
async function makeRequestWithRetry(url, options, maxRetries = 5, baseDelay = 1000) {
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Making API request (attempt ${attempt + 1}/${maxRetries + 1})`);
      
      const response = await fetch(url, options);
      
      // If successful, return the parsed response
      if (response.ok) {
        return await response.json();
      }
      
      // Handle 429 specifically with exponential backoff
      if (response.status === 429) {
        if (attempt === maxRetries) {
          throw new Error(`Max retries (${maxRetries}) exceeded for rate limiting`);
        }
        
        // Check for Retry-After header (Clover best practice)
        const retryAfter = response.headers.get('Retry-After');
        let waitTime;
        
        if (retryAfter) {
          // Retry-After can be in seconds or HTTP date format
          if (/^\d+$/.test(retryAfter)) {
            waitTime = parseInt(retryAfter) * 1000; // Convert seconds to milliseconds
          } else {
            // Parse HTTP date and calculate difference
            const retryDate = new Date(retryAfter);
            waitTime = Math.max(0, retryDate.getTime() - Date.now());
          }
        } else {
          // Use exponential backoff with jitter if no Retry-After header
          const exponentialDelay = baseDelay * Math.pow(2, attempt);
          const jitter = Math.random() * 1000; // Add randomness to prevent thundering herd
          waitTime = exponentialDelay + jitter;
        }
        
        console.log(`Rate limited (429). Waiting ${waitTime}ms before retry...`);
        await sleep(waitTime);
        continue;
      }
      
      // Handle other HTTP errors
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
      
    } catch (error) {
      lastError = error;
      
      // Only retry for network errors, not application errors
      if (error.name === 'TypeError' || error.message.includes('fetch')) {
        if (attempt === maxRetries) {
          throw error;
        }
        const waitTime = baseDelay * Math.pow(2, attempt);
        console.log(`Network error. Retrying in ${waitTime}ms...`);
        await sleep(waitTime);
        continue;
      }
      
      // For other errors (like 401, 403, 400), don't retry
      throw error;
    }
  }
  
  throw lastError;
}

// Utility function for delays
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}














// export default async function handler(req, res) {
//   // CORS headers
//   res.setHeader('Access-Control-Allow-Origin', '*');
//   res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
//   res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
//   if (req.method === 'OPTIONS') return res.status(200).end();
//   if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

//   // Environment variables validation
//   const CLOVER_AUTH_TOKEN = process.env.CLOVER_AUTH_TOKEN;
//   const CLOVER_MERCHANT_ID = process.env.CLOVER_MERCHANT_ID;
  
//   if (!CLOVER_AUTH_TOKEN || !CLOVER_MERCHANT_ID) {
//     return res.status(500).json({ 
//       error: 'Server configuration error',
//       details: 'Missing Clover credentials'
//     });
//   }

//   try {
//     const { amount, coupon, customerData } = req.body;
    
//     if (!amount || amount <= 0) {
//       return res.status(400).json({ error: 'Invalid amount provided' });
//     }

//     // Coupon validation
//     const coupons = [
//       { code: 'SAVE10', type: 'percentage', value: 10, active: true },
//       { code: 'SAVE20', type: 'percentage', value: 20, active: true },
//       { code: 'SAVE50', type: 'percentage', value: 50, active: true }
//     ];

//     let discountAmount = 0;
//     let appliedCoupon = null;
    
//     if (coupon) {
//       const foundCoupon = coupons.find(c => c.code === coupon && c.active);
//       if (foundCoupon) {
//         discountAmount = Math.round((amount * foundCoupon.value) / 100);
//         appliedCoupon = foundCoupon;
//       }
//     }

//     const finalAmount = Math.max(0, amount - discountAmount);

//     // Create Clover hosted checkout session
//     const cloverResponse = await createHostedCheckoutSession({
//       amount: finalAmount,
//       originalAmount: amount,
//       discountAmount,
//       coupon: appliedCoupon,
//       customerData: customerData || {}
//     });

//     if (!cloverResponse.success) {
//       return res.status(500).json({ 
//         error: 'Payment processing failed',
//         details: cloverResponse.error
//       });
//     }

//     return res.status(200).json({
//       checkoutUrl: cloverResponse.checkoutUrl,
//       originalAmount: amount,
//       discountAmount,
//       finalAmount,
//       couponApplied: appliedCoupon?.code || null,
//       sessionId: cloverResponse.sessionId
//     });

//   } catch (error) {
//     console.error('Checkout processing error:', error);
//     return res.status(500).json({ 
//       error: 'Internal server error',
//       details: error.message 
//     });
//   }
// }

// // CORRECTED function - No negative line items
// async function createHostedCheckoutSession({ amount, originalAmount, discountAmount, coupon, customerData }) {
//   const CLOVER_AUTH_TOKEN = process.env.CLOVER_AUTH_TOKEN;
//   const CLOVER_MERCHANT_ID = process.env.CLOVER_MERCHANT_ID;
  
//   // Correct Clover Hosted Checkout API endpoint
//   const HOSTED_CHECKOUT_URL = 'https://api.clover.com/invoicingcheckoutservice/v1/checkouts';

//   try {
//     // Create a single line item with the final discounted price
//     const lineItemName = coupon 
//       ? `Order (${coupon.code} applied - $${discountAmount} off)` 
//       : 'Order';

//     // ✅ CORRECTED: Single line item with final discounted price
//     const checkoutPayload = {
//       customer: {
//         email: customerData.email || 'customer@example.com',
//         firstName: customerData.name?.split(' ')[0] || 'Customer',
//         lastName: customerData.name?.split(' ').slice(1).join(' ') || 'User'
//       },
//       shoppingCart: {
//         lineItems: [
//           {
//             name: lineItemName,
//             price: amount * 100, // Final discounted amount in cents
//             unitQty: 1,
//             note: coupon ? `Original: $${originalAmount}, Discount: $${discountAmount}` : 'Online order'
//           }
//         ]
//       }
//     };

//     console.log('Making request to:', HOSTED_CHECKOUT_URL);
//     console.log('Payload:', JSON.stringify(checkoutPayload, null, 2));

//     // Make API request to Clover
//     const checkoutResponse = await fetch(HOSTED_CHECKOUT_URL, {
//       method: 'POST',
//       headers: {
//         'Authorization': `Bearer ${CLOVER_AUTH_TOKEN}`,
//         'Content-Type': 'application/json',
//         'Accept': 'application/json',
//         'X-Clover-Merchant-Id': CLOVER_MERCHANT_ID
//       },
//       body: JSON.stringify(checkoutPayload)
//     });

//     console.log('Response status:', checkoutResponse.status);

//     if (!checkoutResponse.ok) {
//       const errorText = await checkoutResponse.text();
//       console.error('Clover API Error Response:', errorText);
//       throw new Error(`Clover API returned ${checkoutResponse.status}: ${errorText}`);
//     }

//     const checkoutData = await checkoutResponse.json();
//     console.log('Success response:', checkoutData);
    
//     return {
//       success: true,
//       checkoutUrl: checkoutData.href,
//       sessionId: checkoutData.checkoutSessionId
//     };

//   } catch (error) {
//     console.error('Clover Hosted Checkout API error:', error);
//     return {
//       success: false,
//       error: error.message
//     };
//   }
// }
