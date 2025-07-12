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
    const { discountName, discountValue, orderId } = req.body;
    
    // Validate inputs
    if (!discountName || typeof discountValue !== "number" || !orderId) {
      return res.status(400).json({ 
        error: "Missing required fields: discountName, discountValue, orderId" 
      });
    }

    // Create discount
    const discountResponse = await fetch(
      `https://sandbox.dev.clover.com/v3/merchants/${CLOVER_MERCHANT_ID}/discounts`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${CLOVER_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: discountName,
          amount: Math.abs(discountValue) * 100, // Convert to cents
          percentage: discountValue < 0 ? Math.abs(discountValue) * 100 : 0,
          type: discountValue < 0 ? "PERCENTAGE" : "FIXED_AMOUNT"
        })
      }
    );

    if (!discountResponse.ok) {
      const error = await discountResponse.text();
      throw new Error(`Discount creation failed: ${error}`);
    }

    const { id: discountId } = await discountResponse.json();

    // Apply discount to order
    const orderUpdateResponse = await fetch(
      `https://sandbox.dev.clover.com/v3/merchants/${CLOVER_MERCHANT_ID}/orders/${orderId}/discounts`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${CLOVER_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          discounts: [{
            id: discountId
          }]
        })
      }
    );

    if (!orderUpdateResponse.ok) {
      const error = await orderUpdateResponse.text();
      throw new Error(`Discount application failed: ${error}`);
    }

    res.status(200).json({ 
      success: true,
      discountId,
      orderId
    });

  } catch (err) {
    console.error("Discount Error:", err);
    res.status(500).json({ 
      error: err.message || "Discount processing failed",
      details: process.env.NODE_ENV === "development" ? err.stack : null
    });
  }
}