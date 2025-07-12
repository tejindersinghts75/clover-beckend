import fetch from "node-fetch";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Only POST requests allowed" });
  }

  // ✅ Validate env variables
  if (!process.env.CLOVER_API_KEY || !process.env.CLOVER_MERCHANT_ID) {
    return res.status(500).json({ 
      error: "Clover API credentials not configured. Check server environment variables.",
    });
  }

  try {
    const { discount } = req.body; // No need for JSON.parse (Next.js auto-parses)

    if (discount === undefined || discount === null) {
      return res.status(400).json({ error: "Discount is required" });
    }

    const originalAmount = 1000; // $10 in cents
    const discountedAmount = Math.round(originalAmount - (originalAmount * discount) / 100);

    const response = await fetch(
      `https://sandbox.dev.clover.com/v3/merchants/${process.env.CLOVER_MERCHANT_ID}/pay/link`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.CLOVER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: discountedAmount,
          currency: "USD",
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Clover API error: ${errorText}`);
    }

    const data = await response.json();
    res.status(200).json({ paymentLink: data.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}