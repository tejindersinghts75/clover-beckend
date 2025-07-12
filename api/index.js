import axios from 'axios';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { code } = req.body;
  const CLOVER_API_KEY = process.env.CLOVER_API_KEY;
  const CLOVER_MERCHANT_ID = process.env.CLOVER_MERCHANT_ID;
  const CLOVER_ORDER_ID = "YOUR_ORDER_ID"; // Dynamically fetch this in real use

  try {
    // 1. Validate the discount code (replace with your logic)
    const isValid = await validateDiscountCode(code);
    if (!isValid) {
      return res.status(400).json({ message: "Invalid discount code" });
    }

    // 2. Apply discount to Clover order via API
    const response = await axios.post(
      `https://api.clover.com/v3/merchants/${CLOVER_MERCHANT_ID}/orders/${CLOVER_ORDER_ID}/discounts`,
      {
        name: "Custom Discount",
        type: "FIXED", // or "PERCENT"
        amount: 1000, // $10.00 (in cents) or percentage (e.g., 10 for 10%)
      },
      {
        headers: {
          Authorization: `Bearer ${CLOVER_API_KEY}`,
        },
      }
    );

    res.status(200).json({ message: "Discount applied successfully!" });
  } catch (error) {
    console.error("Clover API error:", error.response?.data);
    res.status(500).json({ message: "Failed to apply discount" });
  }
}

// Mock validation (replace with DB lookup)
async function validateDiscountCode(code) {
  const validCodes = ["SAVE10", "FREESHIP"];
  return validCodes.includes(code);
}