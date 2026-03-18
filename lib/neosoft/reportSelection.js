import { phoneLast10 } from "@/lib/phone";
import { lookupReports } from "@/lib/neosoft/client";

function formatReportDate(dateValue) {
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return "";

  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

export function buildReportMenuRows(reports = []) {
  return (reports || []).slice(0, 5).map((report) => ({
    ...report,
    display_title: `Req No: ${report.reqno} • ${formatReportDate(report.reqdt)}`
  }));
}

export function buildReportOptionsMap(reports = []) {
  return (reports || []).slice(0, 5).reduce((acc, report) => {
    acc[String(report.reqid)] = {
      reqid: String(report.reqid || "").trim(),
      reqno: String(report.reqno || "").trim(),
      patient_name: String(report.patient_name || "").trim(),
      mrno: String(report.mrno || "").trim() || null,
      reqdt: report.reqdt
    };
    return acc;
  }, {});
}

export async function lookupReportSelection(phone) {
  const cleanPhone = phoneLast10(phone);
  const reports = await lookupReports(cleanPhone);
  return {
    reports,
    recentReports: buildReportMenuRows(reports),
    reportOptions: buildReportOptionsMap(reports)
  };
}
