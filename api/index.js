import fetch from "node-fetch";

// Replace with your actual Clover sandbox credentials
const CLOVER_API_KEY = "YOUR_CLOVER_API_KEY";
const MERCHANT_ID = "YOUR_MERCHANT_ID";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Only POST allowed" });
  }

  try {
    const { amount, discount } = JSON.parse(req.body);

    if (!amount || !discount) {
      return res.status(400).json({ error: "Amount and discount are required" });
    }

    const discountedAmount = amount - (amount * discount) / 100;

    // Optional: Create order first (Clover may not require this for pay/link)
    // const orderRes = await fetch(`https://sandbox.dev.clover.com/v3/merchants/${MERCHANT_ID}/orders`, {
    //   method: "POST",
    //   headers: {
    //     Authorization: `Bearer ${CLOVER_API_KEY}`,
    //     "Content-Type": "application/json"
    //   },
    //   body: JSON.stringify({})
    // });

    // const order = await orderRes.json();

    // Call /pay/link with discounted amount
    const linkRes = await fetch(`https://sandbox.dev.clover.com/v3/merchants/${MERCHANT_ID}/pay/link`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CLOVER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        amount: Math.round(discountedAmount),
        currency: "USD"
        // orderId: order.id  // <- Only if Clover supports this here
      })
    });

    const contentType = linkRes.headers.get("content-type") || "";

    if (!linkRes.ok) {
      const errorText = await linkRes.text();
      throw new Error(`Clover API error (${linkRes.status}): ${errorText}`);
    }

    if (!contentType.includes("application/json")) {
      const errorText = await linkRes.text();
      throw new Error(`Unexpected response format: ${errorText}`);
    }

    const link = await linkRes.json();
    res.status(200).json({ paymentLink: link.url });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
