export default async function handler(req, res) {
  // CORS (если форма на другом домене)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  const ts = new Date().toISOString();

  try {
    const lead = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    console.log("LEAD RECEIVED:", { ts, lead });

    const token = process.env.WA_TOKEN;
    const phoneNumberId = process.env.WA_PHONE_NUMBER_ID; // именно Phone Number ID, не WABA ID
    const to = (process.env.WA_TO || "").replace(/[^\d]/g, ""); // оставляем только цифры

    if (!token || !phoneNumberId || !to) {
      const missing = { hasToken: !!token, hasPhoneNumberId: !!phoneNumberId, hasTo: !!to };
      console.log("WHATSAPP ENV MISSING:", missing);
      return res.status(500).json({
        ok: false,
        stage: "env",
        missing,
      });
    }

    const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;

    const text =
      `🧰 New Tech Repair Lead\n` +
      `Name: ${lead.name || "-"}\n` +
      `Phone: ${lead.phone || "-"}\n` +
      `City: ${lead.city || "-"}\n` +
      `Details: ${lead.details || "-"}\n` +
      `Page: ${lead.page || lead.url || "-"}\n` +
      `Time: ${ts}`;

    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text }
    };

    let wa_status = 0;
    let wa_body_text = "";
    let wa_body_json = null;

    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    wa_status = r.status;
    wa_body_text = await r.text();

    try { wa_body_json = JSON.parse(wa_body_text); } catch (_) {}

    console.log("WA META RESPONSE:", { wa_status, wa_body: wa_body_json || wa_body_text });

    // ВАЖНО: возвращаем клиенту диагностический ответ
    return res.status(200).json({
      ok: true,
      ts,
      lead_received: lead,
      wa_status,
      wa_body: wa_body_json || wa_body_text,
      hint: "Пришли мне этот JSON (Network → Response) одним куском."
    });

  } catch (e) {
    console.log("API ERROR:", String(e?.stack || e));
    return res.status(500).json({
      ok: false,
      stage: "exception",
      error: String(e?.message || e),
    });
  }
}
