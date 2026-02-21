export async function handler(event) {
  // CORS (на всякий случай)
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "ok" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders, body: "Method Not Allowed" };
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

    // ✅ ВАЖНО: в ERPNext поле "notes" — это child table, туда нельзя строку.
    // Поэтому кладем текст в remarks (обычное текстовое поле).
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
      source: normalizeSource(data.source), // Website / Facebook / Google
      remarks: remarksText,                 // ✅ текст сюда
    };

    // ВАЖНО: ngrok предупреждение обходим этим заголовком
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
    const phoneId = process.env.WHATSAPP_PHONE_ID;
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
    const data = JSON.parse(event.body || "{}");

    console.log("LEAD RECEIVED:", data);
    console.log("LEAD RAW BODY LENGTH:", (event.body || "").length);

    // Сообщение в WhatsApp
    const msg = `🔔 New Lead (Lucky Handyman)

Name: ${data.name || "-"}
Phone: ${data.phone || "-"}
City: ${data.city || "-"}
Details: ${data.details || "-"}
Source: ${data.source || "-"}
Page: ${data.page || "-"}
Time: ${data.ts || "-"}`;

    // 1) Шлём в WhatsApp
    const waResult = await sendToWhatsApp(msg);

    // 2) Шлём в ERPNext
    const erpResult = await sendToERPNext(data);

    // НИКОГДА не валим форму, даже если WA/ERP упали
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        ok: true,
        whatsapp: waResult.ok ? "sent" : (waResult.skipped || "failed"),
        erpnext: erpResult.ok ? "created" : (erpResult.skipped || "failed"),
        erp_status: erpResult.status || null,
        wa_status: waResult.status || null,
      }),
    };
  } catch (err) {
    console.error("LEAD ERROR:", err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ ok: false, error: "server_error" }),
    };
  }
}