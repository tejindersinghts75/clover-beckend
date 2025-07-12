export default async function handler(req, res) {
  const { CLOVER_ACCESS_TOKEN, CLOVER_MERCHANT_ID } = process.env;

  if (!CLOVER_ACCESS_TOKEN || !CLOVER_MERCHANT_ID) {
    return res.status(500).json({ error: "Missing Clover credentials" });
  }

  try {
    const response = await fetch(
      `https://sandbox.dev.clover.com/v3/merchants/${CLOVER_MERCHANT_ID}`,
      {
        headers: {
          Authorization: `Bearer ${CLOVER_ACCESS_TOKEN}`,
          Accept: 'application/json',
        },
      }
    );

    if (!response.ok) {
      const err = await response.json();
      return res.status(response.status).json({ error: err });
    }

    const data = await response.json();
    res.status(200).json({ merchant: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch from Clover', details: err.message });
  }
}
