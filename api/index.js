import fetch from "node-fetch";

export default async function handler(req, res) {
  // 1. Method Check
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  // 2. Env Validation
  const { CLOVER_API_KEY, CLOVER_MERCHANT_ID } = process.env;
  if (!CLOVER_API_KEY || !CLOVER_MERCHANT_ID) {
    return res.status(500).json({ error: "Server misconfiguration" });
  }

  // 3. Input Validation
  const { discount } = req.body;
  if (typeof discount !== "number" || discount < 0 || discount > 100) {
    return res.status(400).json({ error: "Invalid discount (0-100 required)" });
  }

  try {
    // 4. Calculate Amount
    const amount = Math.round(1000 * (1 - discount / 100)); // $10 base

    // 5. Call Clover API (Updated Endpoint)
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

    // 6. Handle Response
    if (!cloverResponse.ok) {
      const error = await cloverResponse.json();
      throw new Error(`Clover Error: ${error.message || "Unknown error"}`);
    }

    const { payment_link: { url } } = await cloverResponse.json();
    res.status(200).json({ paymentLink: url });

  } catch (err) {
    // 7. Error Handling
    console.error("Payment Error:", err);
    res.status(500).json({ 
      error: err.message || "Payment processing failed" 
    });
  }
}