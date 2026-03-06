const reportSessions = new Map();

/*
Structure stored in memory

phone -> {
  "1": {
      reqid: "P1597044",
      reqno: "20260212077",
      patient_name: "SANVI"
  },
  "2": {...},
  "3": {...}
}
*/

export function saveReportOptions(phone, reports = []) {

  const map = {};

  reports.slice(0,3).forEach((r,index) => {

    map[String(index+1)] = {
      reqid: r.reqid,
      reqno: r.reqno,
      patient_name: r.patient_name
    };

  });

  reportSessions.set(phone, map);
}

export function getReportEntry(phone, option) {

  const entry = reportSessions.get(phone);

  if (!entry) return null;

  return entry[option] || null;

}

export function clearReportSession(phone) {
  reportSessions.delete(phone);
}