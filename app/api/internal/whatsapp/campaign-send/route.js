import { NextResponse } from "next/server";
import { runJob } from "@/lib/patientMessageJobs";

// Generic patient-message-job send. The py_utils enqueue-watch loop fetches
// each job's source feed and POSTs one { key, context } row at a time here.
// All logic — dedup, variable resolution, attachment, send, audit — is in
// lib/patientMessageJobs. Adding a job is a config edit
// (labs_apis.templates.patient_message_jobs[]); adding a variable/recipient
// is one registry line.

function getAuthToken(request) {
  return (
    request.headers.get("x-internal-token") ||
    request.headers.get("x-ingest-token") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    ""
  ).trim();
}

export async function POST(request) {
  try {
    const expected =
      process.env.WHATSAPP_INTERNAL_SEND_TOKEN || process.env.WHATSAPP_EXTERNAL_INGEST_TOKEN || "";
    if (!expected || getAuthToken(request) !== expected) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json();
    const key = String(body?.key || body?.job_key || "").trim();
    const context = body?.context && typeof body.context === "object" ? body.context : body;
    if (!key) return NextResponse.json({ error: "Missing key" }, { status: 400 });

    const result = await runJob({
      labId: String(body?.lab_id || process.env.DEFAULT_LAB_ID || "").trim(),
      key,
      context
    });
    return NextResponse.json(result, { status: result?.ok === false ? 400 : 200 });
  } catch (err) {
    return NextResponse.json({ error: err?.message || "Internal error" }, { status: 500 });
  }
}
