import fetch from "node-fetch";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Only POST requests allowed" });
  }

  const { CLOVER_API_KEY, CLOVER_MERCHANT_ID } = process.env;
  if (!CLOVER_API_KEY || !CLOVER_MERCHANT_ID) {
    return res.status(500).json({ error: "Missing API credentials" });
  }

  try {
    // Now only expecting 'discount' in the body
    const { discount } = req.body;
    
    if (typeof discount !== "number" || discount < 0 || discount > 100) {
      return res.status(400).json({ 
        error: "Discount must be a number between 0-100" 
      });
    }

    // 1. First create an order
    const orderResponse = await fetch(
      `https://sandbox.dev.clover.com/v3/merchants/${CLOVER_MERCHANT_ID}/orders`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${CLOVER_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          currency: "USD"
        })
      }
    );

    if (!orderResponse.ok) {
      const error = await orderResponse.text();
      throw new Error(`Order creation failed: ${error}`);
    }

    const { id: orderId } = await orderResponse.json();

    // 2. Create and apply discount
    const discountResponse = await fetch(
      `https://sandbox.dev.clover.com/v3/merchants/${CLOVER_MERCHANT_ID}/discounts`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${CLOVER_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: `${discount}% Off Discount`,
          percentage: discount * 100, // Clover expects percentage as 1000 for 10%
          type: "PERCENTAGE"
        })
      }
    );

    if (!discountResponse.ok) {
      const error = await discountResponse.text();
      throw new Error(`Discount creation failed: ${error}`);
    }

    const { id: discountId } = await discountResponse.json();

    // 3. Apply discount to order
    const applyResponse = await fetch(
      `https://sandbox.dev.clover.com/v3/merchants/${CLOVER_MERCHANT_ID}/orders/${orderId}/discounts`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${CLOVER_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          discounts: [{ id: discountId }]
        })
      }
    );

    if (!applyResponse.ok) {
      const error = await applyResponse.text();
      throw new Error(`Discount application failed: ${error}`);
    }

    // 4. Create payment link
    const paymentResponse = await fetch(
      `https://sandbox.dev.clover.com/v3/merchants/${CLOVER_MERCHANT_ID}/orders/${orderId}/payments`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${CLOVER_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          amount: 10000, // $100 base amount for example
          currency: "USD"
        })
      }
    );

    if (!paymentResponse.ok) {
      const error = await paymentResponse.text();
      throw new Error(`Payment creation failed: ${error}`);
    }

    res.status(200).json({ 
      success: true,
      orderId,
      discountApplied: `${discount}%`
    });

  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ 
      error: err.message || "Processing failed"
    });
  }
}