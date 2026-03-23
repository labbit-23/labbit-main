function getStatusRowValue(row, ...keys) {
  if (!row || typeof row !== "object") return null;

  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return row[key];
    const lowerKey = String(key).toLowerCase();
    const match = Object.keys(row).find((candidate) => String(candidate).toLowerCase() === lowerKey);
    if (match && row[match] !== undefined && row[match] !== null) {
      return row[match];
    }
  }

  return null;
}

function getPendingLabTestNames(reportStatus) {
  const tests = Array.isArray(reportStatus?.tests) ? reportStatus.tests : [];

  return tests
    .filter((row) => {
      const groupId = String(getStatusRowValue(row, "GROUPID", "groupid") || "").trim();
      const approvalFlag = String(getStatusRowValue(row, "APPROVEDFLG", "approvedflg") || "").trim();
      const status = String(getStatusRowValue(row, "REPORT_STATUS", "report_status") || "").trim();
      return groupId === "GDEP0001" && approvalFlag !== "1" && status !== "LAB_READY";
    })
    .map((row) => String(getStatusRowValue(row, "TESTNM", "testnm", "test_name", "TEST_NAME") || "").trim())
    .filter(Boolean);
}

export function buildReportStatusMessage(reportStatus) {
  if (!reportStatus || typeof reportStatus !== "object") return null;

  const overallStatus = String(reportStatus.overall_status || "").trim();
  const labTotal = Number(reportStatus.lab_total || 0);
  const radiologyTotal = Number(reportStatus.radiology_total || 0);
  const radiologyReady = Number(reportStatus.radiology_ready || 0);
  const pendingLabTests = getPendingLabTestNames(reportStatus);
  const lines = [];

  switch (overallStatus) {
    case "FULL_REPORT":
      lines.push("Lab report status: All lab reports are ready.");
      break;
    case "PARTIAL_REPORT":
      lines.push("Lab report status: Partial lab reports are ready.");
      if (pendingLabTests.length > 0) {
        lines.push("");
        lines.push("Pending lab tests:");
        for (const testName of pendingLabTests) {
          lines.push(`- ${testName}`);
        }
      }
      lines.push("");
      lines.push("This PDF includes only the lab reports that are ready now. Please download again later for the full lab PDF once all pending lab reports are ready.");
      break;
    case "LAB_PENDING":
      lines.push("Lab report status: Some lab reports are still pending.");
      if (pendingLabTests.length > 0) {
        lines.push("");
        lines.push("Pending lab tests:");
        for (const testName of pendingLabTests) {
          lines.push(`- ${testName}`);
        }
      }
      break;
    case "NO_REPORT":
      lines.push("Lab report status: Lab reports are not ready yet.");
      break;
    case "NO_LAB_TESTS":
      if (radiologyTotal > 0) {
        lines.push("Lab report status: No lab reports are available for this requisition.");
      } else if (labTotal === 0) {
        return null;
      }
      break;
    default:
      if (pendingLabTests.length > 0) {
        lines.push("Lab report status: Some lab reports are still pending.");
        lines.push("");
        lines.push("Pending lab tests:");
        for (const testName of pendingLabTests) {
          lines.push(`- ${testName}`);
        }
      } else if (overallStatus) {
        lines.push(`Lab report status: ${overallStatus.replace(/_/g, " ").toLowerCase()}.`);
      } else {
        return null;
      }
  }

  if (radiologyTotal > 0) {
    lines.push("");
    if (radiologyReady >= radiologyTotal) {
      lines.push("Radiology status: Radiology reports are ready.");
    } else if (radiologyReady > 0) {
      lines.push(`Radiology status: ${radiologyReady} of ${radiologyTotal} radiology reports are ready.`);
    } else {
      lines.push("Radiology status: Radiology reports are not ready yet.");
    }
  }

  return lines.join("\n").trim() || null;
}
