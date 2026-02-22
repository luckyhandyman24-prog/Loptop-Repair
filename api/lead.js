// /api/lead.js
export default async function handler(req, res) {
  // CORS (на всякий случай)
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

    // ✅ ENV
    const token = process.env.WA_TOKEN;
    const phoneNumberId = process.env.WA_PHONE_NUMBER_ID;

    // ✅ 2 номера получателей (второй можно не задавать)
    const to1 = (process.env.WA_TO || "").replace(/[^\d]/g, "");
    const to2 = (process.env.WA_TO_2 || "").replace(/[^\d]/g, "");

    // список получателей без пустых и без дублей
    const recipients = Array.from(new Set([to1, to2].filter(Boolean)));

    if (!token || !phoneNumberId || recipients.length === 0) {
      const missing = {
        hasToken: !!token,
        hasPhoneNumberId: !!phoneNumberId,
        hasTo1: !!to1,
        hasTo2: !!to2,
      };
      console.log("WHATSAPP ENV MISSING:", missing);
      return res.status(500).json({ ok: false, stage: "env", missing });
    }

    const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;

    // ✅ Текст сообщения
    const text =
      `🧰 New Tech Repair Lead\n` +
      `Name: ${lead.name || "-"}\n` +
      `Phone: ${lead.phone || "-"}\n` +
      `City: ${lead.city || "-"}\n` +
      `Device: ${lead.device || "-"}\n` +
      `Service: ${lead.service || "-"}\n` +
      `Urgency: ${lead.urgency || "-"}\n` +
      `Details: ${lead.details || "-"}\n` +
      `Page: ${lead.page || lead.url || "-"}\n` +
      `Time: ${ts}`;

    const payloadBase = {
      messaging_product: "whatsapp",
      type: "text",
      text: { body: text },
    };

    // ✅ Отправка на оба номера + сбор результатов
    const wa_results = [];

    for (const to of recipients) {
      const r = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...payloadBase, to }),
      });

      const bodyText = await r.text();
      let bodyJson = null;
      try {
        bodyJson = JSON.parse(bodyText);
      } catch (_) {}

      const result = {
        to,
        wa_status: r.status,
        wa_body: bodyJson || bodyText,
      };

      wa_results.push(result);
      console.log("WA SEND RESULT:", result);
    }

    return res.status(200).json({
      ok: true,
      ts,
      lead_received: lead,
      wa_results,
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
