//lib/neosoft/reportBot.js

import { lookupReports, getReportUrl } from "./client";
import {
  saveReportOptions,
  getReportReqId,
  clearReportSession
} from "./sessionStore";

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

export async function handleReportRequest(phone) {
  const reports = await lookupReports(phone);

  if (!reports || reports.length === 0) {
    return {
      type: "text",
      message: "No reports were found for this phone number."
    };
  }

  saveReportOptions(phone, reports);

  let message = "We found your recent reports:\n\n";

  reports.slice(0, 3).forEach((r, i) => {
    message += `${i + 1}️⃣ ${r.patient_name} - ${formatDate(r.reqdt)}\n`;
  });

  message += "\nReply with 1, 2 or 3 to receive the report.";

  return {
    type: "text",
    message
  };
}

export async function handleReportSelection(phone, option) {
  const reqid = getReportReqId(phone, option);

  if (!reqid) {
    return {
      type: "text",
      message: "Please type 'report' to retrieve your lab reports."
    };
  }

  clearReportSession(phone);

  return {
    type: "document",
    url: getReportUrl(reqid),
    filename: "LabReport.pdf"
  };
}