import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { ironOptions } from "@/lib/session";
import { kioskIronOptions } from "@/lib/kioskSession";
import { supabase } from "@/lib/supabaseServer";
import { getPendingDispatchReportUrl, getReportStatus, getReportStatusByReqid } from "@/lib/neosoft/client";
import { cookies } from "next/headers";
import {
  canUseReportDispatch,
  isScopedDispatchRole,
  getAllowedDispatchOrgIds,
  reportStatusMatchesOrgScope,
} from "@/lib/reportDispatchScope";

const ENABLE_PENDING_PRINT_ONCE = String(process.env.REPORT_PENDING_PRINT_ONCE_ENABLED || "").trim().toLowerCase() === "true";

function rowValue(row, ...keys) {
  if (!row || typeof row !== "object") return null;
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return row[key];
    const lowered = String(key).toLowerCase();
    const matched = Object.keys(row).find((candidate) => String(candidate).toLowerCase() === lowered);
    if (matched && row[matched] !== undefined && row[matched] !== null) return row[matched];
  }
  return null;
}

function normalizedKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function rowValueLoose(row, ...keys) {
  const strict = rowValue(row, ...keys);
  if (strict !== null && strict !== undefined && String(strict).trim()) {
    return strict;
  }
  if (!row || typeof row !== "object") return null;
  const wanted = new Set(keys.map((key) => normalizedKey(key)));
  for (const [candidate, value] of Object.entries(row)) {
    if (value === undefined || value === null) continue;
    if (!String(value).trim()) continue;
    if (wanted.has(normalizedKey(candidate))) return value;
  }
  return null;
}

function rowValueKeyContains(row, includes = []) {
  if (!row || typeof row !== "object") return null;
  const wanted = includes.map((value) => normalizedKey(value)).filter(Boolean);
  if (wanted.length === 0) return null;
  for (const [candidate, value] of Object.entries(row)) {
    if (value === undefined || value === null) continue;
    if (!String(value).trim()) continue;
    const key = normalizedKey(candidate);
    if (wanted.some((token) => key.includes(token))) {
      return value;
    }
  }
  return null;
}

function keepNamePartIfComposite(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const parts = text.split("|").map((part) => String(part || "").trim()).filter(Boolean);
  if (parts.length < 2) return text;
  return parts[0] || text;
}

function normalizeOrgHint(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.split("|")[0]?.trim() || text;
}

function hasOrgScopeSignal(reportStatus) {
  const topLevelOrg = String(
    rowValueLoose(
      reportStatus,
      "REFDOCTOR",
      "refdoctor",
      "REF_DOCTOR",
      "ref_doctor",
      "ORG_ID",
      "org_id",
      "organization_id",
      "organisation_id",
      "org_code",
      "ORGCODE"
    ) ||
      rowValueKeyContains(reportStatus, [
        "refdoctor",
        "orgid",
        "organizationid",
        "organisationid",
        "orgcode",
        "clientid",
        "accountid"
      ]) ||
      ""
  ).trim();
  if (topLevelOrg) return true;

  const tests = Array.isArray(reportStatus?.tests) ? reportStatus.tests : [];
  for (const row of tests) {
    const testOrg = String(
      rowValueLoose(
        row,
        "REFDOCTOR",
        "refdoctor",
        "REF_DOCTOR",
        "ref_doctor",
        "ORG_ID",
        "org_id",
        "organization_id",
        "organisation_id",
        "org_code",
        "ORGCODE"
      ) ||
        rowValueKeyContains(row, [
          "refdoctor",
          "orgid",
          "organizationid",
          "organisationid",
          "orgcode",
          "clientid",
          "accountid"
        ]) ||
        ""
    ).trim();
    if (testOrg) return true;
  }
  return false;
}

function normalizeReqno(reportStatus) {
  const tests = Array.isArray(reportStatus?.tests) ? reportStatus.tests : [];
  for (const row of tests) {
    const reqno = String(rowValue(row, "REQNO", "reqno") || "").trim();
    if (reqno) return reqno;
  }
  return String(reportStatus?.reqno || "").trim() || null;
}

function normalizeReqid(reportStatus, fallbackReqid = null) {
  if (fallbackReqid) return String(fallbackReqid).trim();
  const tests = Array.isArray(reportStatus?.tests) ? reportStatus.tests : [];
  for (const row of tests) {
    const reqid = String(rowValue(row, "REQID", "reqid") || "").trim();
    if (reqid) return reqid;
  }
  return null;
}

function extractPatientPhone(reportStatus) {
  const topLevelPhone = String(
    rowValue(reportStatus, "PHONENO", "phoneno", "PHONE", "phone", "MOBILENO", "mobileno") || ""
  )
    .replace(/\D/g, "")
    .slice(-10);
  if (topLevelPhone) return topLevelPhone;

  const tests = Array.isArray(reportStatus?.tests) ? reportStatus.tests : [];
  for (const row of tests) {
    const phone =
      String(
        rowValue(row, "PHONENO", "phoneno", "PHONE", "phone", "MOBILENO", "mobileno") || ""
      )
        .replace(/\D/g, "")
        .slice(-10);
    if (phone) return phone;
  }
  return null;
}

function extractPatientName(reportStatus) {
  const topLevel = String(
    rowValue(reportStatus, "PATIENT_NAME", "patient_name", "PATIENTNM", "patientnm", "PATNAME", "patname", "NAME", "name")
      || ""
  ).trim();
  if (topLevel) return topLevel;

  const tests = Array.isArray(reportStatus?.tests) ? reportStatus.tests : [];
  for (const row of tests) {
    const name = String(
      rowValue(
        row,
        "PATIENT_NAME",
        "patient_name",
        "PATIENTNM",
        "patientnm",
        "PATNAME",
        "patname",
        "PNAME",
        "pname",
        "NAME",
        "name"
      ) || ""
    ).trim();
    if (name) return name;
  }
  return null;
}

function extractTestDate(reportStatus) {
  const topLevel = String(
    rowValue(reportStatus, "REQDT", "reqdt", "TEST_DATE", "test_date", "BOOKING_DATE", "booking_date", "REQDATE", "reqdate")
      || ""
  ).trim();
  if (topLevel) return topLevel;

  const tests = Array.isArray(reportStatus?.tests) ? reportStatus.tests : [];
  for (const row of tests) {
    const dateValue = String(
      rowValue(row, "REQDT", "reqdt", "TEST_DATE", "test_date", "BOOKING_DATE", "booking_date", "REQDATE", "reqdate") || ""
    ).trim();
    if (dateValue) return dateValue;
  }
  return null;
}

function extractReqTime(reportStatus) {
  const topLevel = String(
    rowValue(reportStatus, "REQTM", "reqtm", "TEST_TIME", "test_time", "REQTIME", "reqtime") || ""
  ).trim();
  if (topLevel) return topLevel;

  const tests = Array.isArray(reportStatus?.tests) ? reportStatus.tests : [];
  for (const row of tests) {
    const timeValue = String(
      rowValue(row, "REQTM", "reqtm", "TEST_TIME", "test_time", "REQTIME", "reqtime") || ""
    ).trim();
    if (timeValue) return timeValue;
  }
  return null;
}

function extractMrno(reportStatus) {
  const topLevelMrno = String(rowValue(reportStatus, "MRNO", "mrno", "CREGNO", "cregno", "UHID", "uhid") || "").trim();
  if (topLevelMrno) return topLevelMrno;

  const tests = Array.isArray(reportStatus?.tests) ? reportStatus.tests : [];
  for (const row of tests) {
    const mrno = String(rowValue(row, "MRNO", "mrno", "CREGNO", "cregno", "UHID", "uhid") || "").trim();
    if (mrno) return mrno;
  }
  return null;
}

function extractReqPassword(reportStatus) {
  const topLevel = String(
    rowValueLoose(
      reportStatus,
      "REQ_PASSWORD",
      "req_password",
      "REQPASSWORD",
      "reqpassword",
      "PASSWORD",
      "password"
    ) || ""
  ).trim();
  if (topLevel) return topLevel;

  const tests = Array.isArray(reportStatus?.tests) ? reportStatus.tests : [];
  for (const row of tests) {
    const candidate = String(
      rowValueLoose(
        row,
        "REQ_PASSWORD",
        "req_password",
        "REQPASSWORD",
        "reqpassword",
        "PASSWORD",
        "password"
      ) || ""
    ).trim();
    if (candidate) return candidate;
  }
  return null;
}

function extractSource(reportStatus) {
  const topDrName = String(
    rowValueLoose(reportStatus, "DRNAME", "drname", "DR_NAME", "dr_name", "ORG_NAME", "org_name", "organization_name", "organisation_name") ||
      rowValueKeyContains(reportStatus, ["drname", "orgname", "organizationname", "organisationname", "clientname", "accountname"]) ||
      ""
  ).trim();
  const topRefDoctor = String(
    rowValueLoose(reportStatus, "REFDOCTOR", "refdoctor", "REF_DOCTOR", "ref_doctor", "ORG_ID", "org_id", "organization_id", "organisation_id", "org_code", "ORGCODE") ||
      rowValueKeyContains(reportStatus, ["refdoctor", "orgid", "organizationid", "organisationid", "orgcode", "clientid", "accountid"]) ||
      ""
  ).trim();
  if (topDrName) return topDrName;
  if (topRefDoctor) return topRefDoctor;

  const topLevelSource = String(
    rowValue(reportStatus, "SOURCE", "source", "SRC", "src", "ORIGIN", "origin") || ""
  ).trim();
  if (topLevelSource) return keepNamePartIfComposite(topLevelSource);

  const tests = Array.isArray(reportStatus?.tests) ? reportStatus.tests : [];
  for (const row of tests) {
    const drName = String(
      rowValueLoose(row, "DRNAME", "drname", "DR_NAME", "dr_name", "ORG_NAME", "org_name", "organization_name", "organisation_name") ||
        rowValueKeyContains(row, ["drname", "orgname", "organizationname", "organisationname", "clientname", "accountname"]) ||
        ""
    ).trim();
    const refDoctor = String(
      rowValueLoose(row, "REFDOCTOR", "refdoctor", "REF_DOCTOR", "ref_doctor", "ORG_ID", "org_id", "organization_id", "organisation_id", "org_code", "ORGCODE") ||
        rowValueKeyContains(row, ["refdoctor", "orgid", "organizationid", "organisationid", "orgcode", "clientid", "accountid"]) ||
        ""
    ).trim();
    if (drName) return drName;
    if (refDoctor) return refDoctor;

    const source = String(
      rowValue(row, "SOURCE", "source", "SRC", "src", "ORIGIN", "origin") || ""
    ).trim();
    if (source) return keepNamePartIfComposite(source);
  }
  return null;
}

function getReadyLabTests(reportStatus) {
  const tests = Array.isArray(reportStatus?.tests) ? reportStatus.tests : [];
  const rows = [];
  const seen = new Set();

  for (const row of tests) {
    const groupId = String(rowValue(row, "GROUPID", "groupid") || "").trim();
    if (groupId !== "GDEP0001") continue;

    const approved = String(rowValue(row, "APPROVEDFLG", "approvedflg") || "").trim();
    const status = String(rowValue(row, "REPORT_STATUS", "report_status") || "").trim();
    if (!(approved === "1" || status === "LAB_READY")) continue;

    const testId = String(rowValue(row, "TESTID", "testid") || "").trim();
    const testName = String(rowValue(row, "TESTNM", "testnm", "TEST_NAME", "test_name") || "").trim();
    const key = testId || testName;
    if (!key || seen.has(key)) continue;
    seen.add(key);

    rows.push({
      key,
      test_id: testId || null,
      test_name: testName || null
    });
  }

  return rows;
}

function getPendingLabTests(reportStatus) {
  const tests = Array.isArray(reportStatus?.tests) ? reportStatus.tests : [];
  const rows = [];
  const seen = new Set();

  for (const row of tests) {
    const groupId = String(rowValue(row, "GROUPID", "groupid") || "").trim();
    if (groupId !== "GDEP0001") continue;

    const approved = String(rowValue(row, "APPROVEDFLG", "approvedflg") || "").trim();
    const status = String(rowValue(row, "REPORT_STATUS", "report_status") || "").trim();
    if (approved === "1" || status === "LAB_READY") continue;

    const testId = String(rowValue(row, "TESTID", "testid") || "").trim();
    const testName = String(rowValue(row, "TESTNM", "testnm", "TEST_NAME", "test_name") || "").trim();
    const key = testId || testName;
    if (!key || seen.has(key)) continue;
    seen.add(key);

    rows.push({
      key,
      test_id: testId || null,
      test_name: testName || null
    });
  }

  return rows;
}

function toDepartment(groupId) {
  if (groupId === "GDEP0001") return "lab";
  if (groupId === "GDEP0002") return "radiology";
  return "other";
}

function isRowReady(row, department) {
  const approved = String(rowValue(row, "APPROVEDFLG", "approvedflg") || "").trim();
  const status = String(rowValue(row, "REPORT_STATUS", "report_status") || "")
    .trim()
    .toUpperCase();
  if (approved === "1") return true;
  if (department === "lab" && status === "LAB_READY") return true;
  if (department === "radiology" && status === "RADIOLOGY_READY") return true;
  return false;
}

function buildTestWiseStatus(reportStatus, deliveredKeys = []) {
  const deliveredSet = new Set((deliveredKeys || []).map((x) => String(x || "").trim()).filter(Boolean));
  const tests = Array.isArray(reportStatus?.tests) ? reportStatus.tests : [];
  const rows = [];
  const seen = new Set();

  for (const row of tests) {
    const groupId = String(rowValue(row, "GROUPID", "groupid") || "").trim();
    const department = toDepartment(groupId);
    const testId = String(rowValue(row, "TESTID", "testid") || "").trim();
    const testName = String(rowValue(row, "TESTNM", "testnm", "TEST_NAME", "test_name") || "").trim();
    const key = (testId || testName || "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const ready = isRowReady(row, department);
    const dispatched = department === "lab" ? deliveredSet.has(key) : false;
    let state = "pending";
    if (ready && department === "lab" && dispatched) state = "ready_dispatched";
    else if (ready) state = "ready_not_dispatched";

    rows.push({
      key,
      test_id: testId || null,
      test_name: testName || null,
      department,
      approved: String(rowValue(row, "APPROVEDFLG", "approvedflg") || "").trim() === "1",
      report_status: String(rowValue(row, "REPORT_STATUS", "report_status") || "").trim() || null,
      ready,
      dispatched,
      state
    });
  }

  return rows.sort((a, b) => {
    const rank = { ready_not_dispatched: 0, pending: 1, ready_dispatched: 2 };
    const ra = rank[a.state] ?? 3;
    const rb = rank[b.state] ?? 3;
    if (ra !== rb) return ra - rb;
    return String(a.test_name || a.key).localeCompare(String(b.test_name || b.key));
  });
}

function normalizeKey(value) {
  const text = String(value || "").trim();
  return text || null;
}

function collectDeliveredLabKeys(logRows = []) {
  const delivered = new Set();
  let hasSuccessRows = false;
  let hasSuccessWithoutTestBreakup = false;
  let lastSuccessAt = null;

  for (const row of logRows) {
    const status = String(row?.status || "").trim().toLowerCase();
    if (status !== "success") continue;

    hasSuccessRows = true;
    const createdAt = String(row?.created_at || "").trim();
    if (createdAt && (!lastSuccessAt || createdAt > lastSuccessAt)) {
      lastSuccessAt = createdAt;
    }

    const payload = row?.request_payload && typeof row.request_payload === "object" ? row.request_payload : {};
    const keys = Array.isArray(payload?.ready_lab_test_keys) ? payload.ready_lab_test_keys : [];

    if (keys.length === 0) {
      hasSuccessWithoutTestBreakup = true;
      continue;
    }

    for (const key of keys) {
      const normalized = normalizeKey(key);
      if (normalized) delivered.add(normalized);
    }
  }

  return {
    delivered_keys: Array.from(delivered),
    has_success_rows: hasSuccessRows,
    has_success_without_test_breakup: hasSuccessWithoutTestBreakup,
    last_success_at: lastSuccessAt
  };
}

function hasConsumedPendingPrintOnce(logRows = []) {
  return (logRows || []).some((row) => {
    if (String(row?.action || "").trim() !== "print") return false;
    const payload = row?.request_payload && typeof row.request_payload === "object" ? row.request_payload : {};
    return String(payload?.printtype || "") === "0";
  });
}

function buildDecision({ readyKeys, deliveredInfo, pendingPrintOnceConsumed, allowPendingPrintOnce, labTotal }) {
  const readySet = new Set(readyKeys);
  const deliveredSet = new Set(deliveredInfo.delivered_keys || []);
  const outstanding = Array.from(readySet).filter((key) => !deliveredSet.has(key));

  if (readySet.size === 0) {
    const noLabTests = Number(labTotal || 0) === 0;
    return {
      mode: "skip",
      reason_code: noLabTests ? "NO_LAB_TESTS" : "NO_READY_LAB_REPORTS",
      reason: noLabTests
        ? "No lab tests are available for this requisition."
        : "No approved lab tests are ready yet.",
      can_print_full: false,
      can_print_delta: false,
      should_block_print: true,
      outstanding_keys: []
    };
  }

  if (!deliveredInfo.has_success_rows) {
    return {
      mode: "allow_full",
      reason_code: "FIRST_DISPATCH",
      reason: "No prior successful dispatch found for this requisition.",
      can_print_full: true,
      can_print_delta: false,
      should_block_print: false,
      outstanding_keys: outstanding
    };
  }

  if (deliveredSet.size === 0) {
    return {
      mode: "manual_review",
      reason_code: "HISTORY_WITHOUT_TEST_BREAKUP",
      reason: "Prior dispatch exists, but historical logs do not have test-level breakup.",
      can_print_full: false,
      can_print_delta: false,
      should_block_print: true,
      outstanding_keys: outstanding
    };
  }

  if (outstanding.length === 0) {
    return {
      mode: "skip",
      reason_code: "ALREADY_DISPATCHED",
      reason: "All currently ready lab tests were already dispatched.",
      can_print_full: false,
      can_print_delta: false,
      should_block_print: true,
      outstanding_keys: []
    };
  }

  if (allowPendingPrintOnce && !pendingPrintOnceConsumed) {
    return {
      mode: "try_pending_print_once",
      reason_code: "DELTA_EXISTS_TRY_PENDING_DISPATCH",
      reason: "New tests are ready. Try NeoSoft pending dispatcher once (printtype=0) before any full reprint.",
      can_print_full: false,
      can_print_delta: true,
      should_block_print: false,
      outstanding_keys: outstanding
    };
  }

  return {
    mode: "manual_review",
    reason_code: "PENDING_PRINT_ONCE_ALREADY_USED",
    reason: "Pending dispatcher was already consumed once. Further attempts may return blank PDF and need manual intervention.",
    can_print_full: false,
    can_print_delta: false,
    should_block_print: true,
    outstanding_keys: outstanding
  };
}

export async function GET(request) {
  try {
    const cookieStore = await cookies();
    const sessionData = await getIronSession(cookieStore, ironOptions);
    const kioskSession = await getIronSession(cookieStore, kioskIronOptions);
    const user = sessionData?.user;
    const kioskUser = kioskSession?.kioskUser;
    const isKioskAuth = Boolean(kioskUser?.authenticated);
    if ((!user || !canUseReportDispatch(user)) && !isKioskAuth) {
      return new Response("Forbidden", { status: 403 });
    }

    const url = new URL(request.url);
    const reqid = String(url.searchParams.get("reqid") || "").trim();
    const reqno = String(url.searchParams.get("reqno") || "").trim();
    const reqPassword = String(
      url.searchParams.get("password") ||
      url.searchParams.get("req_password") ||
      ""
    ).trim();
    const scopedOrgHint = normalizeOrgHint(url.searchParams.get("org_id") || "");
    const source = String(
      url.searchParams.get("source") ||
        request.headers.get("x-report-source") ||
        ""
    )
      .trim()
      .toLowerCase();
    const allowPendingPrintOnce = ENABLE_PENDING_PRINT_ONCE && source === "kiosk";

    if (!reqid && !reqno) {
      return new Response("Missing reqid or reqno", { status: 400 });
    }
    let reportStatus = reqno ? await getReportStatus(reqno) : await getReportStatusByReqid(reqid, reqPassword);
    let normalizedReqno = normalizeReqno(reportStatus);
    let normalizedReqid = normalizeReqid(reportStatus, reqid || null);

    const shouldEnrichFromReqno =
      !reqno &&
      normalizedReqno &&
      (
        !extractPatientName(reportStatus) ||
        !extractTestDate(reportStatus) ||
        !extractMrno(reportStatus) ||
        !extractPatientPhone(reportStatus)
      );

    if (shouldEnrichFromReqno) {
      try {
        const enrichedStatus = await getReportStatus(normalizedReqno);
        if (Array.isArray(enrichedStatus?.tests) && enrichedStatus.tests.length > 0) {
          reportStatus = enrichedStatus;
          normalizedReqno = normalizeReqno(reportStatus);
          normalizedReqid = normalizeReqid(reportStatus, reqid || null);
        }
      } catch {
        // best effort enrichment
      }
    }

    if (user && isScopedDispatchRole(user)) {
      const allowedOrgIds = await getAllowedDispatchOrgIds(user);
      let allowed = reportStatusMatchesOrgScope(reportStatus, allowedOrgIds);
      if (!allowed && scopedOrgHint) {
        const allowedSet = new Set(
          (Array.isArray(allowedOrgIds) ? allowedOrgIds : [])
            .map((value) => normalizeOrgHint(value))
            .filter(Boolean)
        );
        // Safe fallback:
        // If upstream status payload carries no org signal, trust scoped requisition row org_id hint.
        if (allowedSet.has(scopedOrgHint) && !hasOrgScopeSignal(reportStatus)) {
          allowed = true;
        }
      }
      if (!allowed) {
        return new Response("Forbidden for this organization scope", { status: 403 });
      }
    }

    const readyLabTests = getReadyLabTests(reportStatus);
    const pendingLabTests = getPendingLabTests(reportStatus);
    const readyLabTestKeys = readyLabTests.map((row) => row.key);
    const patientPhone = extractPatientPhone(reportStatus);
    const patientName = extractPatientName(reportStatus);
    const testDate = extractTestDate(reportStatus);
    const testTime = extractReqTime(reportStatus);
    const mrno = extractMrno(reportStatus);
    const sourceLabel = extractSource(reportStatus);

    let logsQuery = supabase
      .from("report_dispatch_logs")
      .select("created_at, status, action, request_payload, result_code")
      .in("action", ["print", "download", "send_whatsapp"])
      .order("created_at", { ascending: false })
      .limit(200);

    if (normalizedReqid) {
      logsQuery = logsQuery.eq("reqid", normalizedReqid);
    } else if (normalizedReqno) {
      logsQuery = logsQuery.eq("reqno", normalizedReqno);
    }

    const { data: logRows, error: logsError } = await logsQuery;
    if (logsError) throw logsError;

    const deliveredInfo = collectDeliveredLabKeys(logRows || []);
    const pendingPrintOnceConsumed = hasConsumedPendingPrintOnce(logRows || []);
    const testWiseStatus = buildTestWiseStatus(reportStatus, deliveredInfo.delivered_keys || []);
    const decision = buildDecision({
      readyKeys: readyLabTestKeys,
      deliveredInfo,
      pendingPrintOnceConsumed,
      allowPendingPrintOnce,
      labTotal: Number(reportStatus?.lab_total || 0)
    });

    const pendingPrintUrl =
      allowPendingPrintOnce && normalizedReqid
        ? getPendingDispatchReportUrl(normalizedReqid, normalizedReqno, { chkrephead: 0 })
        : null;

    return NextResponse.json(
      {
        ok: true,
        reqid: normalizedReqid,
        reqno: normalizedReqno,
        live_status: {
          overall_status: reportStatus?.overall_status || null,
          lab_total: Number(reportStatus?.lab_total || 0),
          lab_ready: Number(reportStatus?.lab_ready || 0),
          radiology_total: Number(reportStatus?.radiology_total || 0),
          radiology_ready: Number(reportStatus?.radiology_ready || 0),
          patient_name: patientName,
          patient_phone: patientPhone,
          test_date: testDate,
          test_time: testTime,
          mrno,
          source: sourceLabel,
          ready_lab_tests: readyLabTests,
          ready_lab_test_keys: readyLabTestKeys,
          pending_lab_tests: pendingLabTests,
          tests: testWiseStatus
        },
        dispatch_history: deliveredInfo,
        decision,
        pending_print_once: {
          enabled: allowPendingPrintOnce,
          consumed: pendingPrintOnceConsumed,
          available: allowPendingPrintOnce && !pendingPrintOnceConsumed,
          url: pendingPrintUrl,
          instruction: "Use only via protected server endpoint. Direct repeat calls can consume print count and return blank PDFs."
        }
      },
      { status: 200 }
    );
  } catch (error) {
    return new Response(error?.message || "Failed to resolve dispatch status", { status: 500 });
  }
}
