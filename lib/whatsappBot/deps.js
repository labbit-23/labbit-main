// Real dependencies for the router (production wiring). Imported lazily by the webhook hook so nothing loads unless a flag is on.
import * as store from "./store.js";

export async function buildDeps() {
  const [{ sendTextMessage, sendDocumentMessage }, neosoft, { buildReportStatusMessage }, { supabase }, { submitBotEnquiry }, { searchCatalog }, { handoffToHuman }] = await Promise.all([
    import("../whatsapp/sender.js"),
    import("../neosoft/client.js"),
    import("../neosoft/reportStatusMessage.js"),
    import("../supabaseServer.js"),
    import("./enquiry.js"),
    import("./catalog.js"),
    import("../whatsapp/sessions.js")
  ]);
  return {
    loadSettings: () => store.loadSettings(),
    recordEvent: (e) => store.recordEvent(e),
    countEvents: (a) => store.countEvents(a),
    campaignContext: (p, d) => store.campaignContext(p, d),
    findOpenThread: (p) => store.findOpenThread(p),
    createThread: (a) => store.createThread(a),
    appendThreadMessage: (a) => store.appendThreadMessage(a),
    touchThreadInbound: (t) => store.touchThreadInbound(t),
    removeOptOut: (p) => store.removeOptOut(p),
    markSessionHandoff: (id) => (id ? handoffToHuman(id) : null),
    sendText: ({ phone, labId, text }) => sendTextMessage({ labId, phone, text, sender: { name: "whatsapp-bot", role: "system", userType: "service" } }),
    sendDocument: ({ phone, labId, documentUrl, filename, caption }) => sendDocumentMessage({ labId, phone, documentUrl, filename, caption, sender: { name: "whatsapp-bot", role: "system", userType: "service" } }),
    lookupReports: (phone10) => neosoft.lookupReports(phone10),
    getReportStatus: (reqno) => neosoft.getReportStatus(reqno),
    buildStatusMessage: buildReportStatusMessage,
    getReportUrl: (reqid, reqno) => neosoft.getReportUrl(reqid, { reqno }),
    isPdfReachable: async (url) => { try { const r = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(8000) }); return r.ok; } catch { return false; } },
    searchCatalog: (term, max) => searchCatalog(supabase, term, max),
    submitEnquiry: (a) => submitBotEnquiry(a)
  };
}
