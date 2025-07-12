import fetch from "node-fetch";

const CLOVER_API_KEY = process.env.CLOVER_API_KEY;
const MERCHANT_ID = process.env.CLOVER_MERCHANT_ID;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Only POST requests allowed" });
  }

  try {
    const { discount } = JSON.parse(req.body);

    if (!discount) {
      return res.status(400).json({ error: "Discount is required" });
    }

    const originalAmount = 1000; // ₹10 or $10 in cents
    const discountedAmount = Math.round(originalAmount - (originalAmount * discount) / 100);

    const response = await fetch(`https://sandbox.dev.clover.com/v3/merchants/${MERCHANT_ID}/pay/link`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CLOVER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        amount: discountedAmount,
        currency: "USD"
      })
    });

    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || !contentType.includes("application/json")) {
      const errorText = await response.text();
      throw new Error(`Clover error: ${errorText}`);
    }

    const data = await response.json();
    res.status(200).json({ paymentLink: data.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
