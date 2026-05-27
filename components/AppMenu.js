"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Divider,
  HStack,
  Icon,
  IconButton,
  Menu,
  MenuButton,
  MenuGroup,
  MenuItem,
  MenuList,
  Spinner,
  Text,
  Tooltip,
  useBreakpointValue,
} from "@chakra-ui/react";
import {
  BarChart3,
  Bot,
  Building2,
  ClipboardList,
  FileBarChart,
  FileText,
  FlaskConical,
  HeartPulse,
  Home,
  LayoutDashboard,
  Menu as MenuIcon,
  MessageCircle,
  MonitorCog,
  ScanLine,
  Settings,
  Shield,
  Stethoscope,
} from "lucide-react";
import { useUser } from "../app/context/UserContext";

const EXTERNAL_LINKS = {
  dexaReports: process.env.NEXT_PUBLIC_DEXA_REPORTS_URL || "",
  dicomDashboard: process.env.NEXT_PUBLIC_DICOM_DASHBOARD_URL || "",
};

const FALLBACK_ROLE_PERMISSIONS = {
  director: ["*"],
  director_ceo: [
    "management.metrics.view",
    "reports.run.mis",
    "reports.logs.view",
    "reports.auto_dispatch.view",
  ],
  admin: [
    "uac.view",
    "uac.manage",
    "patients.create",
    "patients.update",
    "patients.update_identity",
    "visits.create",
    "visits.update",
    "quickbook.update",
    "executives.status.update",
    "whatsapp.reply",
    "reports.setup",
    "reports.run.mis",
    "reports.run.transaction",
    "reports.logs.view",
    "reports.dispatch",
    "reports.auto_dispatch.view",
    "shivam.tools.view",
    "shivam.demographics.update",
    "shivam.pricelist.sync",
    "cto.view",
  ],
  manager: [
    "patients.create",
    "patients.update",
    "visits.create",
    "visits.update",
    "quickbook.update",
    "whatsapp.reply",
    "reports.run.mis",
    "reports.run.transaction",
    "reports.logs.view",
    "reports.dispatch",
    "reports.auto_dispatch.view",
    "shivam.tools.view",
    "shivam.demographics.update",
    "cto.view",
  ],
  agent: ["reports.auto_dispatch.view"],
  executive: ["whatsapp.reply", "reports.auto_dispatch.view"],
  b2b: ["reports.auto_dispatch.view"],
  logistics: ["reports.auto_dispatch.view"],
  phlebo: [],
  patient: [],
};

const MENU_GROUPS = [
  {
    key: "workspaces",
    label: "Workspaces",
    items: [
      { key: "management", label: "Management Metrics", description: "CEO view for visits, WhatsApp, and operations", href: "/management", icon: BarChart3, roles: ["director", "director_ceo"], permissions: ["management.metrics.view"] },
      { key: "cto", label: "CTO Ops", description: "System health, incidents, trends, and diagnostics", href: "/cto", icon: MonitorCog, roles: ["director"] },
      { key: "admin", label: "Admin Dashboard", description: "Visits, bookings, patients, executives, and UAC", href: "/admin", icon: LayoutDashboard, roles: ["admin", "manager", "director"], permissions: ["visits.create", "visits.update", "patients.update", "quickbook.update", "executives.status.update"] },
      { key: "phlebo", label: "Phlebo Dashboard", description: "Assigned and open visits", href: "/phlebo", icon: Stethoscope, roles: ["phlebo"] },
      { key: "collection", label: "Collection Centre", description: "B2B and logistics workspace", href: "/collection-centre", icon: Building2, roles: ["b2b", "logistics", "admin", "manager", "director"] },
      { key: "patient", label: "Patient Portal", description: "Patient bookings and reports", href: "/patient", icon: HeartPulse, roles: ["patient"] },
    ],
  },
  {
    key: "operations",
    label: "Operations",
    items: [
      { key: "whatsapp", label: "WhatsApp Inbox", description: "Patient conversations and handoffs", href: "/admin/whatsapp", icon: MessageCircle, roles: ["admin", "manager", "director"], permissions: ["whatsapp.reply"] },
      { key: "report_dispatch", label: "Report Dispatch", description: "Manual and auto report dispatch monitor", href: "/admin/report-dispatch", icon: FileText, roles: ["admin", "manager", "director", "b2b", "logistics"], permissions: ["reports.dispatch", "reports.auto_dispatch.view"] },
      { key: "run_reports", label: "Run Reports", description: "MIS and transaction reports", href: "/admin/reports/run", icon: FileBarChart, roles: ["admin", "manager", "director"], permissions: ["reports.run.mis", "reports.run.transaction", "reports.setup"] },
      { key: "report_master", label: "Report Master", description: "Report catalog and setup", href: "/admin/reports/master", icon: ClipboardList, roles: ["admin", "director"], permissions: ["reports.setup"] },
      { key: "cto_sim", label: "WhatsApp Simulator", description: "CTO-only simulator tools", href: "/cto/whatsapp-sim", icon: Bot, roles: ["director"], permissions: ["simulator.read"] },
    ],
  },
  {
    key: "diagnostics",
    label: "Diagnostics & Imaging",
    items: [
      { key: "dexa_reports", label: "DEXA Reports", description: "External DEXA report workspace", href: EXTERNAL_LINKS.dexaReports, icon: FlaskConical, roles: ["director", "director_ceo", "admin", "manager"], permissions: ["reports.run.mis", "management.metrics.view"], external: true, hidden: !EXTERNAL_LINKS.dexaReports },
      { key: "dicom_dashboard", label: "DICOM Dashboard", description: "External imaging and DICOM dashboard", href: EXTERNAL_LINKS.dicomDashboard, icon: ScanLine, roles: ["director", "director_ceo", "admin", "manager"], permissions: ["cto.view", "management.metrics.view"], external: true, hidden: !EXTERNAL_LINKS.dicomDashboard },
    ],
  },
  {
    key: "setup",
    label: "Setup",
    items: [
      { key: "uac", label: "User Access Control", description: "Role permissions in Admin", href: "/admin?section=uac", icon: Shield, roles: ["director", "admin"], permissions: ["uac.view"] },
      { key: "whatsapp_setup", label: "WhatsApp Setup", description: "Provider and runtime settings", href: "/admin/whatsapp-setup", icon: Settings, roles: ["director"] },
      { key: "app_setup", label: "App Setup", description: "Runtime feature controls", href: "/admin/app-setup", icon: Settings, roles: ["director"] },
    ],
  },
];

function roleKeyFromUser(user) {
  if (!user) return "guest";
  if (user.userType === "executive") {
    return String(user.executiveType || user.roleKey || "executive").toLowerCase().trim();
  }
  return String(user.userType || user.roleKey || "guest").toLowerCase().trim();
}

function roleLabel(roleKey) {
  const labels = {
    director_ceo: "Director / CEO",
    director: "Director",
    admin: "Admin",
    manager: "Manager",
    phlebo: "Phlebo",
    logistics: "Logistics",
    b2b: "Collection Centre",
    patient: "Patient",
  };
  return labels[roleKey] || "User";
}

function hasAccess(item, roleKey, permissions) {
  if (item.hidden || !item.href) return false;
  const granted = Array.isArray(permissions) ? permissions : [];
  if (granted.includes("*")) return true;
  if (Array.isArray(item.roles) && item.roles.includes(roleKey)) return true;
  if (Array.isArray(item.permissions) && item.permissions.some((permission) => granted.includes(permission))) return true;
  return false;
}

export function getAppMenuGroups({ roleKey, permissions }) {
  return MENU_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => hasAccess(item, roleKey, permissions)),
  })).filter((group) => group.items.length > 0);
}

export default function AppMenu({ themeMode = "light", variant = "icon" }) {
  const { user, isLoading } = useUser();
  const roleKey = roleKeyFromUser(user);
  const fallbackPermissions = useMemo(() => FALLBACK_ROLE_PERMISSIONS[roleKey] || [], [roleKey]);
  const [permissions, setPermissions] = useState(fallbackPermissions);
  const [loadingPermissions, setLoadingPermissions] = useState(false);
  const isMobile = useBreakpointValue({ base: true, md: false });

  useEffect(() => {
    setPermissions(fallbackPermissions);
  }, [fallbackPermissions]);

  useEffect(() => {
    if (!user?.id || user?.userType !== "executive") return;
    const labId = String(user?.labId || (Array.isArray(user?.labIds) ? user.labIds[0] : "") || "").trim();
    if (!labId) return;

    let cancelled = false;
    setLoadingPermissions(true);
    fetch("/api/admin/uac/permissions?lab_id=" + encodeURIComponent(labId), { cache: "no-store" })
      .then(async (res) => {
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload?.error || "Failed to load menu permissions");
        const granted = Array.isArray(payload?.policy?.[roleKey]) ? payload.policy[roleKey] : fallbackPermissions;
        if (!cancelled) setPermissions(granted);
      })
      .catch(() => {
        if (!cancelled) setPermissions(fallbackPermissions);
      })
      .finally(() => {
        if (!cancelled) setLoadingPermissions(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fallbackPermissions, roleKey, user]);

  const groups = useMemo(() => getAppMenuGroups({ roleKey, permissions }), [roleKey, permissions]);
  const isDark = themeMode === "dark";
  const buttonColor = isDark ? "whiteAlpha.900" : "gray.700";
  const menuBg = isDark ? "#111827" : "white";
  const menuBorder = isDark ? "rgba(255,255,255,0.16)" : "rgba(15,23,42,0.12)";
  const itemHoverBg = isDark ? "rgba(255,255,255,0.09)" : "gray.50";
  const mutedColor = isDark ? "whiteAlpha.650" : "gray.500";
  const headingColor = isDark ? "whiteAlpha.950" : "gray.800";

  if (isLoading || !user) return null;

  return (
    <Menu isLazy placement="bottom-end">
      <Tooltip label="App menu" hasArrow>
        <MenuButton
          as={variant === "button" && !isMobile ? Button : IconButton}
          icon={variant === "button" && !isMobile ? undefined : <MenuIcon size={16} />}
          leftIcon={variant === "button" && !isMobile ? <MenuIcon size={16} /> : undefined}
          size={{ base: "sm", sm: "md" }}
          variant="ghost"
          color={buttonColor}
          _hover={themeMode === "dark" ? { bg: "whiteAlpha.200" } : { bg: "gray.100" }}
          aria-label="Open app menu"
        >
          {variant === "button" && !isMobile ? "Menu" : null}
        </MenuButton>
      </Tooltip>
      <MenuList minW={{ base: "260px", md: "300px" }} maxH="75vh" overflowY="auto" p={1.5} bg={menuBg} borderColor={menuBorder} boxShadow={isDark ? "0 18px 50px rgba(0,0,0,0.45)" : "lg"}>
        <Box px={2.5} py={2}>
          <HStack justify="space-between" align="center">
            <Box minW={0}>
              <Text fontSize="sm" fontWeight="800" color={headingColor}>Labit Menu</Text>
              <Text fontSize="xs" color={mutedColor} noOfLines={1}>{roleLabel(roleKey)}</Text>
            </Box>
            {loadingPermissions ? <Spinner size="xs" /> : <Badge colorScheme="teal">Allowed</Badge>}
          </HStack>
        </Box>
        <Divider my={1} borderColor={menuBorder} />
        {groups.length === 0 ? (
          <Box px={3} py={4}>
            <Text fontSize="sm" color={mutedColor}>No menu items available for this role.</Text>
          </Box>
        ) : groups.map((group) => (
          <MenuGroup key={group.key} title={group.label}>
            {group.items.map((item) => (
              <MenuItem
                key={item.key}
                as="a"
                href={item.href}
                target={item.external ? "_blank" : undefined}
                rel={item.external ? "noopener noreferrer" : undefined}
                icon={<Icon as={item.icon || Home} boxSize={3.5} />}
                borderRadius="md"
                minH="38px"
                py={1.5}
                px={2}
                bg="transparent"
                color={headingColor}
                _hover={{ bg: itemHoverBg }}
                _focus={{ bg: itemHoverBg }}
              >
                <Box minW={0}>
                  <HStack spacing={2} align="center">
                    <Text fontSize="sm" fontWeight="700" lineHeight="1.15">{item.label}</Text>
                    {item.external ? <Badge size="sm" colorScheme="purple">External</Badge> : null}
                  </HStack>
                  {item.description ? (
                    <Text fontSize="xs" color={mutedColor} noOfLines={1} lineHeight="1.2">{item.description}</Text>
                  ) : null}
                </Box>
              </MenuItem>
            ))}
          </MenuGroup>
        ))}
      </MenuList>
    </Menu>
  );
}
