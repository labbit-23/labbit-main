"use client";

import { useEffect, useState } from "react";
import { Box } from "@chakra-ui/react";
import { supabase } from "../../../lib/supabaseClient";
import { useUser } from "../../context/UserContext";
import RequireAuth from "../../../components/RequireAuth";
import ShortcutBar from "../../../components/ShortcutBar";
import YourDayView from "../YourDayView";

function localYmd(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function YourDayViewContent({ userRole = "executive" }) {
  const { user } = useUser();
  const [themeMode, setThemeMode]               = useState("light");
  const [executives, setExecutives]             = useState([]);
  const [selectedExecutiveId, setSelectedExecutiveId] = useState(null);
  const [selectedExecutiveName, setSelectedExecutiveName] = useState(null);
  const [selectedDate, setSelectedDate]         = useState(localYmd());

  const lockExecutive =
    !!user &&
    user.userType === "executive" &&
    (user.executiveType || "").toLowerCase() === "phlebo";

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("phleboThemeMode");
    if (saved === "dark" || saved === "light") setThemeMode(saved);
  }, []);

  const toggleThemeMode = () => {
    const next = themeMode === "dark" ? "light" : "dark";
    setThemeMode(next);
    if (typeof window !== "undefined") window.localStorage.setItem("phleboThemeMode", next);
  };

  useEffect(() => {
    if (lockExecutive) {
      setSelectedExecutiveId(user.id);
      setSelectedExecutiveName(user.name ?? null);
    }
  }, [user, lockExecutive]);

  useEffect(() => {
    async function fetchExecutives() {
      try {
        const { data, error } = await supabase
          .from("executives")
          .select("id, name")
          .in("status", ["active", "available"])
          .eq("type", "Phlebo");
        if (error) throw error;
        setExecutives(data || []);
        if (!lockExecutive && data?.length > 0) {
          setSelectedExecutiveId(data[0].id);
          setSelectedExecutiveName(data[0]?.name ?? null);
        }
      } catch (err) {
        console.error("Failed to fetch executives", err);
      }
    }
    fetchExecutives();
  }, [lockExecutive]);

  useEffect(() => {
    if (!selectedExecutiveId || executives.length === 0) return;
    const exec = executives.find(e => e.id === selectedExecutiveId);
    if (exec) setSelectedExecutiveName(exec.name);
  }, [selectedExecutiveId, executives]);

  return (
    <Box
      minH="100vh"
      w="100vw"
      className={`dashboard-theme-shell ${themeMode === "dark" ? "dashboard-theme-dark" : ""}`}
      bg="var(--bg)"
      color="var(--text)"
    >
      <ShortcutBar
        userRole={userRole}
        hvExecutiveName={selectedExecutiveName}
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
        executives={executives}
        selectedExecutiveId={selectedExecutiveId}
        setSelectedExecutiveId={lockExecutive ? undefined : setSelectedExecutiveId}
        lockExecutive={lockExecutive}
        themeMode={themeMode}
        onToggleTheme={toggleThemeMode}
      />
      <YourDayView executiveId={selectedExecutiveId} themeMode={themeMode} />
    </Box>
  );
}

export default function YourDayViewPage() {
  return (
    <RequireAuth roles={["phlebo"]}>
      <YourDayViewContent />
    </RequireAuth>
  );
}
