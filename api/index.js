export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Only POST requests allowed" });
  }

  try {
    // ✅ Check if req.body is already an object (parsed by Next.js/Express)
    const { discount } = typeof req.body === "object" ? req.body : JSON.parse(req.body);

    if (!discount) {
      return res.status(400).json({ error: "Discount is required" });
    }

    const originalAmount = 1000; // $10 in cents
    const discountedAmount = Math.round(originalAmount - (originalAmount * discount) / 100);

    const response = await fetch(`https://sandbox.dev.clover.com/v3/merchants/${MERCHANT_ID}/pay/link`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CLOVER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: discountedAmount,
        currency: "USD",
      }),
    });

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