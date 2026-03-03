"use client";

import { useEffect, useRef } from "react";
import { useUser } from "../app/context/UserContext";

const POLL_MS = 30000;

function showNotification(title, body) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission === "granted") {
    new Notification(title, { body });
  }
}

function notifyDiff(roleKey, prev, next) {
  if (!prev) return;

  const delta = (key) => (next[key] || 0) - (prev[key] || 0);

  if (["admin", "manager", "director"].includes(roleKey)) {
    if (delta("pickups_samples_ready_urgent") > 0) {
      showNotification("URGENT Pickup Lot", `${delta("pickups_samples_ready_urgent")} urgent pickup lot(s) added.`);
    }
    if (delta("quickbook_pending") > 0) {
      showNotification("New QuickBook Request", `${delta("quickbook_pending")} new pending request(s).`);
    }
    if (delta("whatsapp_unread") > 0) {
      showNotification("WhatsApp Inbox Update", `${delta("whatsapp_unread")} new unread WhatsApp message(s).`);
    }
    if (delta("pickups_samples_ready") > 0) {
      showNotification("Samples Ready For Pickup", `${delta("pickups_samples_ready")} new pickup-ready lot(s).`);
    }
  }

  if (["logistics", "b2b"].includes(roleKey)) {
    if (delta("pickups_samples_ready_urgent") > 0) {
      showNotification("URGENT Pickup Lot", `${delta("pickups_samples_ready_urgent")} urgent pickup lot(s) require attention.`);
    }
    if (delta("pickups_samples_ready") > 0) {
      showNotification("New Pickup Request", `${delta("pickups_samples_ready")} new lot(s) ready for pickup.`);
    }
  }

  if (roleKey === "phlebo") {
    if (delta("phlebo_assigned_active") > 0) {
      showNotification("New Assigned Visit", `${delta("phlebo_assigned_active")} new assigned visit(s).`);
    }
    if (delta("phlebo_unassigned_available") > 0) {
      showNotification("Unassigned Visits Available", `${delta("phlebo_unassigned_available")} new unassigned visit(s) available to claim.`);
    }
  }
}

export default function AppNotifications() {
  const { user } = useUser();
  const previousCountsRef = useRef(null);

  useEffect(() => {
    previousCountsRef.current = null;
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || user?.userType !== "executive") return;

    const roleKey = (user.executiveType || "").toLowerCase();
    const supportedRoles = new Set(["admin", "manager", "director", "phlebo", "logistics", "b2b"]);
    if (!supportedRoles.has(roleKey)) return;

    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }

    let timer = null;
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch("/api/notifications/summary", { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled || !data?.counts) return;

        const prev = previousCountsRef.current;
        const next = data.counts;
        notifyDiff(roleKey, prev, next);
        previousCountsRef.current = next;
      } catch {
        // non-blocking
      }
    };

    poll();
    timer = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [user]);

  return null;
}
