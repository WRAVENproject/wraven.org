// WRAVEN inquiry Worker.
//
// Production: a Worker route on wraven.org/api/* sends requests here. GitHub
// Pages continues to serve every other path.
// Local demo: `npm run dev` in this folder serves the whole site from the
// repository root and runs this code for /api/*.

const KINDS = new Set(["review", "training", "audit", "ctf", "business", "sponsor", "school", "recruiting", "other"]);
const LIMITS = { name: 120, email: 200, org: 200, message: 5000 };
const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/inquiry") {
      if (request.method !== "POST") {
        return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
      }
      return handleInquiry(request, env);
    }

    if (url.pathname.startsWith("/api/")) {
      return new Response("Not found", { status: 404 });
    }

    // Local demo only. In production the route covers /api/* and nothing else.
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Not found", { status: 404 });
  },

  // A daily cron trigger runs this. The privacy policy says that WRAVEN
  // deletes form messages after 12 months.
  async scheduled(controller, env) {
    const cutoff = new Date();
    cutoff.setUTCMonth(cutoff.getUTCMonth() - 12);
    const result = await env.DB.prepare("DELETE FROM inquiries WHERE created_at < ?").bind(cutoff.toISOString()).run();
    console.log("retention: deleted", result.meta?.changes ?? 0, "messages older than", cutoff.toISOString());
  },
};

async function handleInquiry(request, env) {
  const wantsJson = (request.headers.get("Accept") || "").includes("application/json");

  // Accept only same-origin posts from a browser form.
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) {
    return reply(wantsJson, 403, { ok: false, error: "This form only accepts posts from wraven.org." });
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return reply(wantsJson, 400, { ok: false, error: "The form data was not readable." });
  }

  // Bots fill the hidden field. Return success so they do not retry.
  if ((form.get("website") || "").toString().trim() !== "") {
    return reply(wantsJson, 200, { ok: true });
  }

  for (const [field, max] of Object.entries(LIMITS)) {
    if ((form.get(field) || "").toString().length > max) {
      return reply(wantsJson, 400, { ok: false, error: `The ${field} field is too long. The limit is ${max} characters.` });
    }
  }

  const data = {
    name: clean(form.get("name"), LIMITS.name),
    email: clean(form.get("email"), LIMITS.email),
    org: clean(form.get("org"), LIMITS.org),
    kind: clean(form.get("kind"), 20),
    message: clean(form.get("message"), LIMITS.message),
  };

  if (!data.name || !data.message) {
    return reply(wantsJson, 400, { ok: false, error: "Add your name and a message." });
  }
  if (!EMAIL_RE.test(data.email)) {
    return reply(wantsJson, 400, { ok: false, error: "That email address does not look right." });
  }
  if (!KINDS.has(data.kind)) data.kind = "other";

  const token = (form.get("cf-turnstile-response") || "").toString();
  let passed;
  try {
    passed = await verifyTurnstile(token, request.headers.get("CF-Connecting-IP"), env);
  } catch (error) {
    console.error("siteverify failed", error);
    return reply(wantsJson, 502, { ok: false, error: "The anti-bot service did not answer." });
  }
  if (!passed) {
    return reply(wantsJson, 400, { ok: false, error: "The anti-bot check did not pass. Wait for it to finish, then send again." });
  }

  const id = crypto.randomUUID();
  try {
    await env.DB.prepare(
      "INSERT INTO inquiries (id, created_at, kind, name, email, org, message) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
      .bind(id, new Date().toISOString(), data.kind, data.name, data.email, data.org, data.message)
      .run();
  } catch (error) {
    console.error("insert failed", error);
    return reply(wantsJson, 502, { ok: false, error: "We could not save the message." });
  }

  // Alerts are optional. A failed alert never loses the message: it is in D1.
  // Discord: a short ping with no personal data. Set the Worker secret DISCORD_WEBHOOK.
  if (env.DISCORD_WEBHOOK) {
    try {
      await pingDiscord(env, id, data.kind);
    } catch (error) {
      console.error("discord ping failed", error);
    }
  }
  // Email: needs a send_email binding named NOTIFY (Workers Paid plan).
  if (env.NOTIFY && env.NOTIFY_FROM && env.NOTIFY_TO) {
    try {
      await sendNotification(env, id, data);
    } catch (error) {
      console.error("notification failed", error);
    }
  }

  return reply(wantsJson, 200, { ok: true, id });
}

function clean(value, max) {
  return (value || "").toString().replace(/\r\n/g, "\n").trim().slice(0, max);
}

async function verifyTurnstile(token, ip, env) {
  if (!token || !env.TURNSTILE_SECRET) return false;
  const body = new FormData();
  body.append("secret", env.TURNSTILE_SECRET);
  body.append("response", token);
  if (ip) body.append("remoteip", ip);
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
  const result = await response.json();
  return result.success === true;
}

const KIND_LABELS = {
  review: "on-premises security review",
  training: "training or a talk",
  audit: "attack surface audit",
  ctf: "CTF event",
  business: "business",
  sponsor: "sponsorship",
  recruiting: "recruiting",
  school: "school, class, or team",
  other: "something else",
};

// The ping names only the topic and the message ID. The name, email address,
// and message text stay in D1, so the privacy policy stays true.
async function pingDiscord(env, id, kind) {
  const response = await fetch(env.DISCORD_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: `New message from the wraven.org form. Topic: ${KIND_LABELS[kind] || kind}. ID: ${id}. Read it in D1 (wraven-inquiries).`,
      allowed_mentions: { parse: [] },
    }),
  });
  if (!response.ok) throw new Error(`Discord returned ${response.status}`);
}

async function sendNotification(env, id, data) {
  // Cloudflare Email Sending, structured form. NOTIFY_FROM is an address on
  // notify.wraven.org. The binding allows only one destination: NOTIFY_TO.
  const text = [
    `Kind: ${data.kind}`,
    `Name: ${data.name}`,
    `Email: ${data.email}`,
    `Organization: ${data.org || "(none)"}`,
    `ID: ${id}`,
    "",
    data.message,
  ].join("\n");
  const result = await env.NOTIFY.send({
    from: { email: env.NOTIFY_FROM, name: "wraven.org form" },
    to: env.NOTIFY_TO,
    replyTo: data.email,
    subject: `wraven.org inquiry (${data.kind}): ${data.name.replace(/[\r\n]/g, " ")}`,
    text,
  });
  console.log("notification sent", id, result?.messageId);
}

function reply(wantsJson, status, body) {
  if (wantsJson) {
    return Response.json(body, { status });
  }
  // A plain form post without JavaScript. Send the reader back to the page.
  const target = body.ok ? "/work-with-us/?sent=1#contact" : "/work-with-us/?error=1#contact";
  return new Response(null, { status: 303, headers: { Location: target } });
}
