import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { ironOptions } from "@/lib/session";
import { getDeliveryRequisitionsByDate } from "@/lib/neosoft/client";
import {
  canUseReportDispatch,
  getAllowedDispatchOrgIds,
  getRoleKey,
  isScopedDispatchRole,
  filterRowsByOrgScope,
} from "@/lib/reportDispatchScope";

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
    if (!String(value).trim()) continue;
    if (wanted.has(normalizedKey(candidate))) {
      return String(value).trim();
    }
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
    if (wanted.some((token) => key.includes(token))) {
      return text;
    }
  }
  return "";
}

function keepNamePartIfComposite(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const parts = text.split("|").map((part) => String(part || "").trim()).filter(Boolean);
  if (parts.length < 2) return text;
  return parts[0] || text;
}

function readOrgName(row) {
  return (
    readValue(row, "DRNAME", "drname", "DR_NAME", "dr_name", "ORG_NAME", "org_name", "organization_name", "organisation_name") ||
    readValueByNormalizedKeyIncludes(row, ["drname", "orgname", "organizationname", "organisationname", "clientname", "accountname"])
  );
}

function readOrgId(row) {
  return (
    readValue(
      row,
      "REFDOCTOR",
      "refdoctor",
      "REF_DOCTOR",
      "ref_doctor",
      "external_org_id",
      "neosoft_org_id",
      "ORG_ID",
      "org_id",
      "organization_id",
      "organisation_id",
      "org_code",
      "ORGCODE",
      "client_id",
      "account_id"
    ) ||
    readValueByNormalizedKeyIncludes(row, [
      "refdoctor",
      "externalorgid",
      "neosoftorgid",
      "orgid",
      "organizationid",
      "organisationid",
      "orgcode",
      "clientid",
      "accountid"
    ])
  );
}

function buildSourceLabel(row) {
  const drName = readOrgName(row);
  const refDoctor = readOrgId(row);
  if (drName) return drName;
  if (refDoctor) return refDoctor;
  const fallback = (
    readValue(row, "source", "SOURCE", "src", "SRC", "origin", "ORIGIN") ||
    readValueByNormalizedKeyIncludes(row, ["source", "origin", "channel"])
  );
  return keepNamePartIfComposite(fallback) || null;
}

export async function GET(request) {
  try {
    const cookieStore = await cookies();
    const sessionData = await getIronSession(cookieStore, ironOptions);
    const user = sessionData?.user;
    if (!user || !canUseReportDispatch(user)) {
      return new Response("Forbidden", { status: 403 });
    }

    const date = String(new URL(request.url).searchParams.get("date") || "").trim();
    if (!date) {
      return new Response("Missing date", { status: 400 });
    }

    const effectiveRole = getRoleKey(user);
    const scoped = isScopedDispatchRole(user);
    let scopedOrgIds = [];
    if (scoped) {
      scopedOrgIds = await getAllowedDispatchOrgIds(user);
      if (scopedOrgIds.length === 0) {
        return NextResponse.json(
          {
            ok: true,
            date,
            scoped: true,
            effective_role: effectiveRole || null,
            scoped_reason: "role_scoped_but_no_org_mapping",
            allowed_org_ids: [],
            scope_issue: "missing_allowed_org_ids",
            upstream_called: false,
            requisitions: []
          },
          { status: 200 }
        );
      }
    }

    let upstreamCalled = false;
    upstreamCalled = true;
    const data = await getDeliveryRequisitionsByDate(date, {
      orgIds: scopedOrgIds
    });
    const allRows = Array.isArray(data?.requisitions) ? data.requisitions : [];

    let requisitions = allRows;
    if (scoped) {
      // Safety fallback: enforce local filtering even if upstream ignores org params.
      requisitions = filterRowsByOrgScope(allRows, scopedOrgIds);
    }

    return NextResponse.json(
      {
        ok: true,
        date: String(data?.date || date),
        scoped,
        effective_role: effectiveRole || null,
        scoped_reason: scoped ? "role_scoped" : "role_unscoped",
        allowed_org_ids: scopedOrgIds,
        scope_issue: null,
        upstream_called: upstreamCalled,
        requisitions: requisitions.map((row) => ({
          reqno: String(row?.reqno || "").trim() || null,
          reqid: String(row?.reqid || "").trim() || null,
          patient_name: String(row?.patient_name || "").trim() || null,
          phoneno: String(row?.phoneno || "").trim() || null,
          mrno: String(row?.mrno || "").trim() || null,
          source: buildSourceLabel(row),
          org_id: readOrgId(row) || null,
          org_name: readOrgName(row) || null
        }))
      },
      { status: 200 }
    );
  } catch (error) {
    return new Response(error?.message || "Failed to load requisitions by date", { status: 500 });
  }
}
