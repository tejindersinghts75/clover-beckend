import fetch from "node-fetch";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const { CLOVER_API_KEY, CLOVER_MERCHANT_ID } = process.env;
  if (!CLOVER_API_KEY || !CLOVER_MERCHANT_ID) {
    return res.status(500).json({ error: "Server misconfiguration" });
  }

  const { discount } = req.body;
  if (typeof discount !== "number" || discount < 0 || discount > 100) {
    return res.status(400).json({ error: "Invalid discount (0-100 required)" });
  }

  try {
    const amount = Math.round(1000 * (1 - discount / 100));

    const cloverResponse = await fetch(
      `https://sandbox.dev.clover.com/v3/merchants/${CLOVER_MERCHANT_ID}/payment_links`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${CLOVER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount,
          currency: "USD",
          description: `Discounted payment (${discount}% off)`,
        }),
      }
    );

    // First get the response as text
    const responseText = await cloverResponse.text();
    
    // Try to parse it as JSON
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (e) {
      // If parsing fails, log the raw response for debugging
      console.error("Non-JSON Response:", responseText);
      throw new Error(`Clover returned invalid JSON: ${responseText.substring(0, 100)}`);
    }

    if (!cloverResponse.ok) {
      throw new Error(responseData.message || "Payment failed");
    }

    res.status(200).json({ 
      paymentLink: responseData.payment_link?.url || responseData.url 
    });

  } catch (err) {
    console.error("Full Error:", err);
    res.status(500).json({ 
      error: err.message || "Payment processing failed",
      details: err.response?.data || null
    });
  }
}