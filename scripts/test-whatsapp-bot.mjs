import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex <= 0) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function phoneVariantsIndia(value) {
  const digits = digitsOnly(value);
  const last10 = digits.length >= 10 ? digits.slice(-10) : digits;
  const canonical = last10 ? `91${last10}` : digits;
  return Array.from(new Set([
    String(value || "").trim(),
    digits,
    last10,
    canonical,
    canonical ? `+${canonical}` : ""
  ].filter(Boolean)));
}

function parseArgs(argv) {
  const options = {
    baseUrl: "http://localhost:3000",
    phone: "919999000001",
    name: "CTO Test",
    waitMs: 2500,
    cleanup: false,
    steps: []
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--base-url") options.baseUrl = argv[++i];
    else if (arg === "--phone") options.phone = argv[++i];
    else if (arg === "--name") options.name = argv[++i];
    else if (arg === "--wait-ms") options.waitMs = Number(argv[++i] || 2500);
    else if (arg === "--cleanup") options.cleanup = true;
    else options.steps.push(arg);
  }

  if (options.steps.length === 0) {
    options.steps = ["Hi"];
  }

  return options;
}

function buildWebhookPayload({ phone, name, step }) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const baseMessage = {
    from: digitsOnly(phone),
    id: `wamid.${Date.now()}.${Math.random().toString(36).slice(2, 10)}`,
    timestamp
  };

  let message;
  if (step.startsWith("button:")) {
    const text = step.slice("button:".length).trim() || "Hi";
    message = {
      ...baseMessage,
      type: "button",
      button: {
        payload: text,
        text
      }
    };
  } else if (step.startsWith("list:")) {
    const [, idRaw, titleRaw] = step.split(":");
    const id = String(idRaw || "").trim() || "REQUEST_REPORTS";
    const title = String(titleRaw || id).trim();
    message = {
      ...baseMessage,
      type: "interactive",
      interactive: {
        type: "list_reply",
        list_reply: {
          id,
          title
        }
      }
    };
  } else {
    message = {
      ...baseMessage,
      type: "text",
      text: {
        body: step
      }
    };
  }

  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "919849110001",
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "919849110001",
                phone_number_id: ""
              },
              contacts: [
                {
                  profile: { name },
                  wa_id: digitsOnly(phone)
                }
              ],
              messages: [message]
            },
            field: "messages"
          }
        ]
      }
    ]
  };
}

function summarizeMessage(row) {
  const sender = row?.payload?.sender;
  const request = row?.payload?.request || {};
  const document = request?.document || {};
  return {
    created_at: row?.created_at || null,
    direction: row?.direction || null,
    sender: sender?.name || sender?.id || "bot/system",
    text: row?.message || null,
    request_type: request?.type || null,
    document: document?.filename || null
  };
}

async function main() {
  loadEnvFile(path.resolve(".env.local"));
  const options = parseArgs(process.argv.slice(2));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.");
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
  const startedAt = new Date().toISOString();
  const phoneVariants = phoneVariantsIndia(options.phone);

  if (options.cleanup) {
    await supabase
      .from("whatsapp_messages")
      .delete()
      .in("phone", phoneVariants);
    await supabase
      .from("chat_sessions")
      .delete()
      .in("phone", phoneVariants);
    console.log("Cleaned prior test rows for phone", options.phone);
  }

  console.log(`Testing bot via ${options.baseUrl}/api/whatsapp/webhook for ${options.phone}`);

  for (const step of options.steps) {
    console.log(`\n> inbound: ${step}`);
    const payload = buildWebhookPayload({
      phone: options.phone,
      name: options.name,
      step
    });

    const response = await fetch(`${options.baseUrl.replace(/\/$/, "")}/api/whatsapp/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const bodyText = await response.text();
    console.log(`webhook => ${response.status} ${bodyText}`);

    await new Promise((resolve) => setTimeout(resolve, options.waitMs));

    const { data: rows, error } = await supabase
      .from("whatsapp_messages")
      .select("created_at, direction, message, payload")
      .in("phone", phoneVariants)
      .gte("created_at", startedAt)
      .order("created_at", { ascending: true })
      .limit(20);

    if (error) {
      console.error("supabase read failed:", error.message);
      continue;
    }

    const recent = (rows || []).slice(-6).map(summarizeMessage);
    console.log("recent rows:");
    console.log(JSON.stringify(recent, null, 2));
  }

  const { data: sessionRows } = await supabase
    .from("chat_sessions")
    .select("id, phone, status, current_state, patient_name, last_message_at, unread_count")
    .in("phone", phoneVariants)
    .order("created_at", { ascending: false })
    .limit(5);

  console.log("\nfinal sessions:");
  console.log(JSON.stringify(sessionRows || [], null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
