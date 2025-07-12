// File: /api/create-payment-link.js
import fetch from "node-fetch"

export default async function handler(req, res) {
  const { amount, discount } = req.body

  const merchantId = process.env.CLOVER_MERCHANT_ID
  const token = process.env.CLOVER_ACCESS_TOKEN
  const baseUrl = `https://sandbox.dev.clover.com/v3/merchants/${merchantId}`

  try {
    // 1. Create order
    const orderRes = await fetch(`${baseUrl}/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    })
    const order = await orderRes.json()

    // 2. Add line item to order
    const lineItemRes = await fetch(`${baseUrl}/orders/${order.id}/line_items`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Product",
        price: Math.round(Number(amount) * 100), // cents
        quantity: 1,
      }),
    })

    // 3. Add discount (if any)
    if (discount && Number(discount) > 0) {
      await fetch(`${baseUrl}/orders/${order.id}/discounts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: `${discount}% Off`,
          percentage: Number(discount) * 100, // Clover needs percent * 100
        }),
      })
    }

    // 4. Create payment link
    const paymentLinkRes = await fetch(`${baseUrl}/pay/link`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: Math.round(Number(amount) * 100),
        orderId: order.id,
        currency: "USD",
        receiptEmail: "customer@example.com",
      }),
    })

    const link = await paymentLinkRes.json()
    res.status(200).json({ url: link.url })
  } catch (err) {
    console.error("Error:", err)
    res.status(500).json({ error: "Something went wrong" })
  }
}






// export default async function handler(req, res) {
//   const { CLOVER_ACCESS_TOKEN, CLOVER_MERCHANT_ID } = process.env;

//   if (!CLOVER_ACCESS_TOKEN || !CLOVER_MERCHANT_ID) {
//     return res.status(500).json({ error: "Missing Clover credentials" });
//   }

//   try {
//     const response = await fetch(
//       `https://sandbox.dev.clover.com/v3/merchants/${CLOVER_MERCHANT_ID}`,
//       {
//         headers: {
//           Authorization: `Bearer ${CLOVER_ACCESS_TOKEN}`,
//           Accept: 'application/json',
//         },
//       }
//     );

//     if (!response.ok) {
//       const err = await response.json();
//       return res.status(response.status).json({ error: err });
//     }

//     const data = await response.json();
//     res.status(200).json({ merchant: data });
//   } catch (err) {
//     res.status(500).json({ error: 'Failed to fetch from Clover', details: err.message });
//   }
// }
