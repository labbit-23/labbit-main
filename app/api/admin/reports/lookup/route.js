import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { ironOptions } from "@/lib/session";
import { lookupReports } from "@/lib/neosoft/client";
import { canUseReportDispatch, isScopedDispatchRole } from "@/lib/reportDispatchScope";

function normalizedKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function readValue(row, ...keys) {
  if (!row || typeof row !== "object") return "";
  for (const key of keys) {
    const direct = row?.[key];
    if (direct !== undefined && direct !== null && String(direct).trim()) {
      return String(direct).trim();
    }
  }
  const wanted = new Set(keys.map((key) => normalizedKey(key)));
  for (const [candidate, value] of Object.entries(row)) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (!text) continue;
    if (wanted.has(normalizedKey(candidate))) return text;
  }
  return "";
}

function readValueByNormalizedKeyIncludes(row, includes = []) {
  if (!row || typeof row !== "object") return "";
  const wanted = includes.map((value) => normalizedKey(value)).filter(Boolean);
  if (wanted.length === 0) return "";
  for (const [candidate, value] of Object.entries(row)) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (!text) continue;
    const key = normalizedKey(candidate);
    if (wanted.some((token) => key.includes(token))) return text;
  }
  return "";
}

function buildSourceLabel(row) {
  const drName =
    readValue(row, "DRNAME", "drname", "DR_NAME", "dr_name", "ORG_NAME", "org_name", "organization_name", "organisation_name") ||
    readValueByNormalizedKeyIncludes(row, ["drname", "orgname", "organizationname", "organisationname", "clientname", "accountname"]);
  const refDoctor =
    readValue(row, "REFDOCTOR", "refdoctor", "REF_DOCTOR", "ref_doctor", "ORG_ID", "org_id", "organization_id", "organisation_id", "org_code", "ORGCODE") ||
    readValueByNormalizedKeyIncludes(row, ["refdoctor", "orgid", "organizationid", "organisationid", "orgcode", "clientid", "accountid"]);
  if (drName && refDoctor) return `${drName} | ${refDoctor}`;
  if (drName) return drName;
  if (refDoctor) return refDoctor;
  return (
    readValue(row, "source", "SOURCE", "src", "SRC", "origin", "ORIGIN") ||
    readValueByNormalizedKeyIncludes(row, ["source", "origin", "channel"])
  ) || null;
}

export async function GET(request) {
  try {
    const cookieStore = await cookies();
    const sessionData = await getIronSession(cookieStore, ironOptions);
    const user = sessionData?.user;
    if (!user || !canUseReportDispatch(user)) {
      return new Response("Forbidden", { status: 403 });
    }
    if (isScopedDispatchRole(user)) {
      return new Response("Phone lookup is disabled for scoped dispatch roles", { status: 403 });
    }

    const phone = String(new URL(request.url).searchParams.get("phone") || "").trim();
    if (!phone) {
      return new Response("Missing phone", { status: 400 });
    }

    const reports = await lookupReports(phone);
    const latestReports = (Array.isArray(reports) ? reports : []).slice(0, 10).map((row) => ({
      reqid: String(row?.reqid || "").trim() || null,
      reqno: String(row?.reqno || "").trim() || null,
      patient_name: String(row?.patient_name || "").trim() || null,
      mrno: String(row?.mrno || "").trim() || null,
      reqdt: String(row?.reqdt || "").trim() || null,
      source: buildSourceLabel(row)
    }));
    return NextResponse.json({ ok: true, phone, latest_reports: latestReports }, { status: 200 });
  } catch (error) {
    return new Response(error?.message || "Failed to lookup reports", { status: 500 });
  }
}
