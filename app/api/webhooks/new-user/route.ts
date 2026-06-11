import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.SUPABASE_WEBHOOK_SECRET;
  const resendApiKey = process.env.RESEND_API_KEY;
  const notifyEmail = process.env.NOTIFICATION_EMAIL;

  if (!webhookSecret || !resendApiKey || !notifyEmail) {
    console.error("New user webhook is not fully configured.");
    return NextResponse.json({ error: "Not configured." }, { status: 500 });
  }

  if (request.headers.get("x-webhook-secret") !== webhookSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const email = body?.record?.email ?? "unknown";

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Training Signals <notifications@trainingsignals.cc>",
      to: notifyEmail,
      subject: "New Training Signals signup",
      text: `A new account was created: ${email}`,
    }),
  });

  if (!response.ok) {
    console.error("Failed to send new user notification:", response.status, await response.text());
    return NextResponse.json({ error: "Failed to send notification." }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
