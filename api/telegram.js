export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return res.status(500).json({
      error: "Missing ENV",
      hasToken: !!token,
      hasChatId: !!chatId,
    });
  }

  try {
    const { name = "", phone = "", city = "", details = "", page = "" } = req.body || {};

    const text =
      `🚀 NEW WEBSITE LEAD\n\n` +
      `👤 Name: ${name}\n` +
      `📞 Phone: ${phone}\n` +
      `🏙 City: ${city}\n` +
      `🛠 Details: ${details}\n` +
      (page ? `🔗 Page: ${page}\n` : "") +
      `🕒 Time: ${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })}`;

    const tgResp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    });

    const data = await tgResp.json();

    return res.status(tgResp.ok ? 200 : 500).json({
      success: tgResp.ok,
      telegram: data,
    });
  } catch (e) {
    return res.status(500).json({ error: "Telegram request failed", details: String(e) });
  }
}
