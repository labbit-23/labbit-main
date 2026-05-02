export default function AppHelpPage() {
  return (
    <div style={{ padding: 20, background: "#f4f7fb", minHeight: "100vh" }}>
      <article style={{ maxWidth: 980, margin: "0 auto", background: "#fff", border: "1px solid #d9e3f0", borderRadius: 12, padding: 20 }}>
        <h1 style={{ marginTop: 0, color: "#0f2f4a" }}>App Help</h1>
        <p style={{ color: "#475467" }}>
          This page explains the full system in simple terms for non-technical users.
        </p>

        <h2>1. Booking Requests</h2>
        <p>Patients request home visits from website or WhatsApp. Requests appear in admin as pending bookings.</p>

        <h2>2. Booking & Visit Operations</h2>
        <p>Team reviews requests, assigns executive, and confirms slot. Visit records move through status steps till completion.</p>

        <h2>3. WhatsApp Inbox</h2>
        <p>All patient chats come into one inbox. Agents can reply manually, handover to bot, or trigger templates.</p>

        <h2>4. Bot Features</h2>
        <p>The bot supports report requests, home-visit booking assistance, menu navigation, and feedback collection.</p>

        <h2>5. Report Dispatch</h2>
        <p>Dispatch can be manual or auto. Auto-dispatch queues jobs, waits for readiness + cooloff, then sends report template.</p>

        <h2>6. Partial vs Full Reports</h2>
        <p>Same-day tests can trigger partial sends first. Reconciliation checks recent partial/unsent jobs and sends again when fully ready.</p>

        <h2>7. CTO Monitoring</h2>
        <p>CTO panels show service health, events, latency trends, and operational alerts to track reliability.</p>

        <h2>8. Plugins / Integrations</h2>
        <p>External systems include lab APIs, WhatsApp provider, report endpoints, and operational tools. Setup values are managed in admin setup pages.</p>

        <h2>9. Roles & Access</h2>
        <p>UAC controls who can view, edit, push dispatch, pause queues, and access advanced tools.</p>

        <h2>10. Daily Workflow (Simple)</h2>
        <p>
          Morning: check bookings and queue. Daytime: process samples, monitor dispatch. Evening: verify pending items and delivery statuses.
        </p>

        <h2>11. Collection Centre Help (Tailored)</h2>
        <p>
          Collection centre teams should focus on same-day registration accuracy, sample packaging quality, and handoff timestamps.
        </p>
        <p>
          Practical flow: register patient details correctly, collect sample, mark collection time, pack as per test type, and hand over for transport with tracking note.
        </p>

        <h2>12. Logistics Help: Pickup and Drop (Tailored)</h2>
        <p>
          Logistics teams should work in route batches: pickup from centres, verify sample counts, maintain handling requirements, then drop to lab and confirm receipt.
        </p>
        <p>
          Handoff points to track: pickup time, bag count, condition check, in-transit status, drop time, receiving person. Any mismatch must be logged immediately.
        </p>

        <h2>13. Agent-Facing Navigation</h2>
        <p>
          Use the shortcut/burger menu as the common entry point. Visible actions are role-based (UAC). Help remains visible for all users.
        </p>
      </article>
    </div>
  );
}
