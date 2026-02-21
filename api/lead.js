export default async function handler(req, res) {
  // CORS
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  // Preflight
  if (req.method === "OPTIONS") {
    Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(200).send("ok");
  }

  if (req.method !== "POST") {
    Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).send("Method Not Allowed");
  }

  // --- helpers ---
  function normalizeSource(raw) {
    const s = String(raw || "").toLowerCase();
    if (s.includes("fb") || s.includes("face")) return "Facebook";
    if (s.includes("google") || s.includes("gads") || s.includes("ads")) return "Google";
    if (s.includes("web") || s.includes("site") || s.includes("popup") || s.includes("landing")) return "Website";
    return "Website";
  }

  async function sendToERPNext(data) {
    const base = process.env.ERP_BASE_URL;
    const key = process.env.ERP_API_KEY;
    const secret = process.env.ERP_API_SECRET;

    if (!base || !key || !secret) {
      console.log("ERP ENV MISSING:", { hasBase: !!base, hasKey: !!key, hasSecret: !!secret });
      return { ok: false, skipped: "env_missing" };
    }

    const remarksText = [
      data.details ? `Details: ${data.details}` : null,
      data.page ? `Page: ${data.page}` : null,
      data.source ? `Raw source: ${data.source}` : null,
      data.ts ? `TS: ${data.ts}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const payload = {
      doctype: "Lead",
      lead_name: data.name || "Website Lead",
      mobile_no: data.phone || "",
      email_id: data.email || "",
      city: data.city || "",
      source: normalizeSource(data.source),
      remarks: remarksText,
    };

    const r = await fetch(`${base.replace(/\/$/, "")}/api/resource/Lead`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `token ${key}:${secret}`,
        "ngrok-skip-browser-warning": "1",
      },
      body: JSON.stringify(payload),
    });

    const text = await r.text();
    console.log("ERP STATUS:", r.status);
    console.log("ERP BODY:", text);

    if (!r.ok) return { ok: false, status: r.status, body: text };
    return { ok: true, body: text };
  }

  async function sendToWhatsApp(msg) {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_ID; // важно: у тебя именно так
    const to = process.env.WHATSAPP_TO;

    if (!token || !phoneId || !to) {
      console.log("WHATSAPP ENV MISSING:", {
        hasToken: !!token,
        hasPhoneId: !!phoneId,
        hasTo: !!to,
      });
      return { ok: false, skipped: "env_missing" };
    }

    const r = await fetch(`https://graph.facebook.com/v22.0/${phoneId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: msg },
      }),
    });

    const resultText = await r.text();
    console.log("WHATSAPP STATUS:", r.status);
    console.log("WHATSAPP BODY:", resultText);

    if (!r.ok) return { ok: false, status: r.status, body: resultText };
    return { ok: true };
  }

  // --- main ---
  try {
    // Vercel обычно уже даёт объект, но подстрахуемся
    const data = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});

    console.log("LEAD RECEIVED:", data);

    const msg = `🔔 New Lead (Lucky Handyman)

Name: ${data.name || "-"}
Phone: ${data.phone || "-"}
City: ${data.city || "-"}
Details: ${data.details || "-"}
Source: ${data.source || "-"}
Page: ${data.page || "-"}
Time: ${data.ts || "-"}`;

    const waResult = await sendToWhatsApp(msg);
    const erpResult = await sendToERPNext(data);

    Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));

    // Никогда не валим форму
    return res.status(200).json({
      ok: true,
      whatsapp: waResult.ok ? "sent" : (waResult.skipped || "failed"),
      erpnext: erpResult.ok ? "created" : (erpResult.skipped || "failed"),
      erp_status: erpResult.status || null,
      wa_status: waResult.status || null,
    });
  } catch (err) {
    console.error("LEAD ERROR:", err);
    Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(500).json({ ok: false, error: "server_error" });
  }
}