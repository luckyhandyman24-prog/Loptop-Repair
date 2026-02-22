export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).send("ok");
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  const safeDigits = (v) => String(v || "").replace(/[^\d]/g, "");

  async function sendToWhatsApp(msg) {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_ID; // ✅ Phone Number ID (не WABA)
    const to = safeDigits(process.env.WHATSAPP_TO);

    if (!token || !phoneNumberId || !to) {
      return {
        ok: false,
        skipped: "env_missing",
        debug: { hasToken: !!token, hasPhoneId: !!phoneNumberId, hasTo: !!to },
      };
    }

    const url = `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`;

    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to, // ✅ только цифры, без +
        type: "text",
        text: { preview_url: false, body: msg },
      }),
    });

    const bodyText = await r.text().catch(() => "");

    return {
      ok: r.ok,
      status: r.status,
      body: bodyText,
      url,
      to,
      phoneNumberId,
    };
  }

  try {
    // На Vercel req.body обычно уже объект. Но подстрахуемся.
    const data =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});

    const msg = `🔔 New Lead (Tampa Tech Repair)

Name: ${data.name || "-"}
Phone: ${data.phone || "-"}
Details: ${data.details || "-"}
Device: ${data.device || "-"}
Service: ${data.service || "-"}
Urgency: ${data.urgency || "-"}
Estimate: ${data.estimate || "-"}
Page: ${data.page || "-"}
Time: ${data.ts || "-"}`;

    const wa = await sendToWhatsApp(msg);

    // ✅ Важно: возвращаем всё для диагностики (без токена)
    return res.status(200).json({
      ok: true,
      whatsapp: wa.ok ? "sent" : (wa.skipped || "failed"),
      wa_status: wa.status || null,
      wa_body: wa.body || null,       // ← тут будет ПРИЧИНА (ошибка Meta)
      wa_url: wa.url || null,
      wa_to: wa.to || null,
      wa_phone_id: wa.phoneNumberId || null,
      env_debug: wa.debug || null,
    });
  } catch (err) {
    // ✅ Не “server_error” вслепую — а что именно сломалось
    return res.status(200).json({
      ok: false,
      error: "server_error",
      err_message: String(err?.message || err),
    });
  }
}