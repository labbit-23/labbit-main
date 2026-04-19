// File: /components/ShortcutBar.js
"use client";

import React from "react";
import {
  Flex,
  IconButton,
  Tooltip,
  Image,
  Box,
  Text,
  Select,
  Badge,
  useBreakpointValue,
  useToast,
  Circle,
} from "@chakra-ui/react";
import { MoonIcon, SunIcon } from "@chakra-ui/icons";
import { FiBell, FiBellOff, FiHome, FiLogOut, FiUserCheck, FiUserX } from "react-icons/fi";
import DateSelector from "../app/components/DateSelector";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";
import { useUser } from "../app/context/UserContext";
import AppNotifications from "./AppNotifications";
import NotificationsHelper from "../lib/notificationsHelper";

// Map roles to display label and color scheme
const ROLE_MARKERS = {
  admin:    { label: "Admin",    color: "blue"   },
  manager:  { label: "Manager",  color: "cyan"   },
  director: { label: "Director", color: "purple" },
  phlebo:   { label: "Phlebo",   color: "green"  },
  logistics:  { label: "Logistics",  color: "yellow" },
  b2b:  { label: "B2B Client",  color: "teal" },
  patient:  { label: "Patient",  color: "orange" },
  guest:    { label: "Guest",    color: "gray"   },
  unknown:  { label: "User",     color: "gray"   },
};

function getRoleMarker(user) {
  if (!user) return ROLE_MARKERS.guest;
  if (user.userType === "patient") return ROLE_MARKERS.patient;
  if (user.userType === "executive") {
    const type = (user.executiveType || "").toLowerCase();
    return (
      ROLE_MARKERS[type] ||
      (type === "admin"
        ? ROLE_MARKERS.admin
        : type === "phlebo"
        ? ROLE_MARKERS.phlebo
        : ROLE_MARKERS.unknown)
    );
  }
  return ROLE_MARKERS.unknown;
}

export default function ShortcutBar({
  executives = [],
  selectedExecutiveId,
  setSelectedExecutiveId,
  patients = [],
  selectedPatientId,
  setSelectedPatientId,
  selectedDate,
  setSelectedDate,
  lockExecutive = false,
  themeMode = "light",
  onToggleTheme,
  rightContent = null,
  centerContent = null,
  desktopRowHeight = "56px",
}) {
  const router = useRouter();
  const isMobile = useBreakpointValue({ base: true, md: false });
  const { user, refreshUser } = useUser();
  const toast = useToast();
  const [notificationPermission, setNotificationPermission] = React.useState("unknown");

  React.useEffect(() => {
    const syncNotificationPermission = () => {
      if (typeof window === "undefined" || typeof Notification === "undefined") {
        setNotificationPermission("unsupported");
        return;
      }
      setNotificationPermission(Notification.permission || "default");
    };

    syncNotificationPermission();

    if (typeof window === "undefined") {
      return undefined;
    }

    const handleFocus = () => syncNotificationPermission();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        syncNotificationPermission();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const enableNotifications = async () => {
    if (notificationPermission === "unsupported") {
      toast({
        title: "Notifications unavailable",
        description: "This browser does not support notifications.",
        status: "warning",
        duration: 3000,
      });
      setNotificationPermission("unsupported");
      return;
    }

    if (notificationPermission === "granted") {
      NotificationsHelper.showNotification("Notifications enabled", {
        body: "Browser notifications are already on for this page.",
      });
      toast({
        title: "Notifications already enabled",
        description: "A test notification was sent.",
        status: "success",
        duration: 2500,
      });
      return;
    }

    if (notificationPermission === "denied") {
      toast({
        title: "Notifications blocked",
        description: "Please allow notifications from your browser site settings for this page.",
        status: "warning",
        duration: 4000,
      });
      return;
    }

    if (notificationPermission === "default") {
      toast({
        title: "Browser permission prompt",
        description: "Please allow notifications in the browser prompt if it appears.",
        status: "info",
        duration: 2500,
      });
    }

    const permission = await NotificationsHelper.requestPermission();
    setNotificationPermission(permission);

    if (permission === "granted") {
      NotificationsHelper.showNotification("Notifications enabled", {
        body: "You will now receive browser alerts from Labit while this tab is active.",
      });
      toast({
        title: "Notifications enabled",
        status: "success",
        duration: 3000,
      });
      return;
    }

    if (permission === "denied") {
      toast({
        title: "Notifications blocked",
        description: "Allow notifications in your browser site settings to turn them on.",
        status: "warning",
        duration: 4000,
      });
      return;
    }

    toast({
      title: "Notifications not enabled",
      description: "Use the browser prompt or site settings to allow notifications.",
      status: "info",
      duration: 3000,
    });
  };

  const handleLogout = async () => {
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (!res.ok) throw new Error("Failed to logout from server");
      const { error } = await supabase.auth.signOut();
      if (error) {
        alert("Error logging out Supabase: " + error.message);
        return;
      }
      await refreshUser();
      router.replace("/login");
    } catch (error) {
      alert("Logout failed: " + error.message);
    }
  };

  const handleHomeDashboard = (e) => {
    e.stopPropagation();
    if (!user) {
      router.push("/");
      return;
    }
    switch (user.userType) {
      case "patient":
        router.push("/patient");
        break;
      case "executive":
        if (["admin", "manager", "director"].includes((user.executiveType || "").toLowerCase())) {
          router.push((user.executiveType || "").toLowerCase() === "director" ? "/cto" : "/admin");
        } else if ((user.executiveType || "").toLowerCase() === "phlebo") {
          router.push("/phlebo");
        } else {
          router.push("/dashboard");
        }
        break;
      default:
        router.push("/");
    }
  };

  const selectedPatient = patients.find((p) => p.id === selectedPatientId);
  const roleMarker = getRoleMarker(user);
  const execType = String(user?.executiveType || user?.roleKey || "").toLowerCase();
  const userType = String(user?.userType || "").toLowerCase();
  const isDirector = (userType === "executive" || userType === "director") && execType === "director";
  const supportMode = Boolean(user?.supportMode);
  const supportPatientPhone = String(user?.supportPatientPhone || "").trim();
  const notificationLabel =
    notificationPermission === "granted"
      ? "Notifications On"
      : notificationPermission === "denied"
      ? "Notifications Blocked"
      : notificationPermission === "unsupported"
      ? "Notifications Unsupported"
      : "Enable Notifications";
  const notificationIcon = notificationPermission === "granted" ? <FiBell /> : <FiBellOff />;
  const notificationButtonProps =
    notificationPermission === "granted"
      ? {
          colorScheme: "green",
          variant: themeMode === "dark" ? "solid" : "ghost",
          color: themeMode === "dark" ? "gray.900" : "green.700",
          bg: themeMode === "dark" ? "green.300" : undefined,
        }
      : notificationPermission === "denied"
      ? {
          colorScheme: "red",
          variant: "outline",
          color: themeMode === "dark" ? "red.200" : "red.600",
          borderColor: themeMode === "dark" ? "red.300" : "red.200",
        }
      : notificationPermission === "unsupported"
      ? {
          colorScheme: "gray",
          variant: "ghost",
          color: themeMode === "dark" ? "whiteAlpha.500" : "gray.400",
        }
      : {
          colorScheme: "yellow",
          variant: "outline",
          color: themeMode === "dark" ? "yellow.200" : "yellow.700",
          borderColor: themeMode === "dark" ? "yellow.300" : "yellow.300",
        };
  const notificationDotColor =
    notificationPermission === "granted"
      ? "green.400"
      : notificationPermission === "denied"
      ? "red.400"
      : notificationPermission === "unsupported"
      ? "gray.400"
      : "yellow.400";
  const notificationSrLabel =
    notificationPermission === "granted"
      ? "Notifications enabled"
      : notificationPermission === "denied"
      ? "Notifications blocked"
      : notificationPermission === "unsupported"
      ? "Notifications unsupported"
      : "Notifications not enabled";

  const handleSupportPatientLogin = async () => {
    const input = window.prompt("Enter patient phone number (10 digits):", "");
    if (input == null) return;
    const phone = String(input).replace(/\D/g, "").slice(-10);
    if (phone.length !== 10) {
      toast({
        title: "Invalid phone number",
        description: "Enter a valid 10-digit patient phone.",
        status: "warning",
        duration: 2500,
      });
      return;
    }

    try {
      const res = await fetch("/api/auth/support/patient-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to enable support mode");
      await refreshUser();
      toast({
        title: "Support mode enabled",
        description: `Patient ${phone}`,
        status: "success",
        duration: 2500,
      });
      router.push("/patient");
    } catch (error) {
      toast({
        title: "Support login failed",
        description: String(error?.message || error),
        status: "error",
        duration: 3000,
      });
    }
  };

  const handleSupportExit = async () => {
    try {
      const res = await fetch("/api/auth/support/exit", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to exit support mode");
      await refreshUser();
      toast({
        title: "Support mode exited",
        status: "success",
        duration: 2000,
      });
      router.push("/cto");
    } catch (error) {
      toast({
        title: "Exit support failed",
        description: String(error?.message || error),
        status: "error",
        duration: 3000,
      });
    }
  };

  return (
    <Box
      className={themeMode === "dark" ? "dashboard-theme-shortcutbar" : ""}
      position="fixed"
      top={0}
      left={0}
      right={0}
      bg={themeMode === "dark" ? "#0f172a" : "rgba(255,255,255,0.85)"}
      backdropFilter="blur(12px)"
      boxShadow={themeMode === "dark" ? "0 10px 30px rgba(2,6,23,0.42)" : "sm"}
      borderBottomWidth="1px"
      borderBottomColor={themeMode === "dark" ? "whiteAlpha.200" : "gray.200"}
      zIndex={1000}
    >
      <AppNotifications />
      {/* First row: logo + info + home/role/logout all fit here */}
      <Flex
        height={desktopRowHeight}
        px={{ base: 2, md: 4 }}
        align="center"
        justify="space-between"
        userSelect="none"
        flexWrap="nowrap"
        gap={2}
      >
        {/* Left section: logo + name (truncate if needed) */}
        <Flex align="center" gap={2} flexShrink={1} minW={0}>
          <Box
            cursor="pointer"
            onClick={(e) => {
              e.stopPropagation();
              router.push("/");
            }}
            maxH="44px"
            display="flex"
            alignItems="center"
            flexShrink={0}
          >
            <Image
              src="/logo.png"
              alt="Labit Logo"
              maxH={{ base: "28px", md: "36px" }}
              objectFit="contain"
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
            />
          </Box>

          {/* Patient dropdown only for patient role */}
          {user?.userType === "patient" && (
            <Box whiteSpace="nowrap" fontWeight="medium" color="gray.700" fontSize="sm" minW={0}>
              <Text isTruncated>Phone: {user.phone || "N/A"}</Text>
              {patients.length > 0 && setSelectedPatientId && (
                <Select
                  size="sm"
                  maxW="140px"
                  mt={1}
                  value={selectedPatientId || ""}
                  onChange={(e) => setSelectedPatientId(e.target.value)}
                  aria-label="Select Patient"
                  placeholder="Select Patient"
                >
                  {patients.map(({ id, name }) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </Select>
              )}
            </Box>
          )}

          {/* Executive/Admin/Phlebo name */}
          {user?.userType === "executive" && user?.name && (
            <Text
              fontWeight="bold"
              fontSize={{ base: "sm", md: "md" }}
              color={themeMode === "dark" ? "whiteAlpha.900" : "teal.700"}
              isTruncated
              maxW={{ base: "90px", sm: "150px" }}
            >
              {user.name}
            </Text>
          )}
        </Flex>

        {!isMobile ? (
          <Flex
            flex="1 1 auto"
            minW={0}
            align="center"
            justify="center"
            gap={2}
            px={2}
          >
            {centerContent ? (
              <Box minW={0}>
                {centerContent}
              </Box>
            ) : null}
            {selectedDate && setSelectedDate ? (
              <Box pointerEvents="auto" maxW="320px" width="100%">
                <DateSelector date={selectedDate} setDate={setSelectedDate} />
              </Box>
            ) : null}
          </Flex>
        ) : null}

        {/* Right section: Home + Role badge + Logout */}
        <Flex align="center" gap={{ base: 1, sm: 2 }} flexShrink={0}>
          <Tooltip label="Dashboard Home">
            <IconButton
              icon={<FiHome />}
              onClick={handleHomeDashboard}
              variant="ghost"
              size={{ base: "sm", sm: "md" }}
              color={themeMode === "dark" ? "whiteAlpha.900" : undefined}
              _hover={themeMode === "dark" ? { bg: "whiteAlpha.200" } : undefined}
              aria-label="Go to dashboard home"
            />
          </Tooltip>
          <Tooltip label={notificationLabel}>
            <Box position="relative">
              <IconButton
                icon={notificationIcon}
                onClick={notificationPermission === "unsupported" ? undefined : enableNotifications}
                size={{ base: "sm", sm: "md" }}
                _hover={themeMode === "dark" ? { bg: "whiteAlpha.200" } : { bg: "gray.100" }}
                aria-label={notificationLabel}
                isDisabled={notificationPermission === "unsupported"}
                {...notificationButtonProps}
              />
              <Circle
                size="10px"
                bg={notificationDotColor}
                position="absolute"
                top="1px"
                right="1px"
                borderWidth="2px"
                borderColor={themeMode === "dark" ? "#0f172a" : "white"}
                pointerEvents="none"
              />
              <Box srOnly>{notificationSrLabel}</Box>
            </Box>
          </Tooltip>
          {typeof onToggleTheme === "function" && (
            <Tooltip label={themeMode === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
              <IconButton
                icon={themeMode === "dark" ? <SunIcon /> : <MoonIcon />}
                onClick={onToggleTheme}
                variant="ghost"
                size={{ base: "sm", sm: "md" }}
                color={themeMode === "dark" ? "whiteAlpha.900" : "gray.700"}
                _hover={themeMode === "dark" ? { bg: "whiteAlpha.200" } : { bg: "gray.100" }}
                aria-label="Toggle theme"
              />
            </Tooltip>
          )}
          {!!user && (
            <Tooltip label={`Logged in as ${roleMarker.label}`}>
              <Badge
                colorScheme={roleMarker.color}
                variant="subtle"
                px={{ base: 2, sm: 3 }}
                borderRadius="md"
                fontSize="0.68rem"
                fontWeight="bold"
                maxW="72px"
                isTruncated = {false}
              >
                {roleMarker.label}
              </Badge>
            </Tooltip>
          )}
          {isDirector && !supportMode && (
            <Tooltip label="Support Login as Patient">
              <IconButton
                icon={<FiUserCheck />}
                onClick={handleSupportPatientLogin}
                variant="outline"
                colorScheme="purple"
                size={{ base: "sm", sm: "md" }}
                aria-label="Support login as patient"
              />
            </Tooltip>
          )}
          {isDirector && supportMode && (
            <>
              <Badge colorScheme="purple" variant="subtle" px={{ base: 2, sm: 3 }} borderRadius="md">
                Support {supportPatientPhone || "active"}
              </Badge>
              <Tooltip label="Exit Support Mode">
                <IconButton
                  icon={<FiUserX />}
                  onClick={handleSupportExit}
                  variant="outline"
                  colorScheme="red"
                  size={{ base: "sm", sm: "md" }}
                  aria-label="Exit support mode"
                />
              </Tooltip>
            </>
          )}
          {rightContent ? (
            <Box display="inline-flex" alignItems="center" gap={2}>
              {rightContent}
            </Box>
          ) : null}
          <Tooltip label="Logout">
            <IconButton
              icon={<FiLogOut />}
              onClick={handleLogout}
              variant="ghost"
              size={{ base: "sm", sm: "md" }}
              color={themeMode === "dark" ? "whiteAlpha.900" : undefined}
              _hover={themeMode === "dark" ? { bg: "whiteAlpha.200" } : undefined}
              aria-label="Logout"
            />
          </Tooltip>
        </Flex>
      </Flex>

      {/* Second row: date selector */}
      {isMobile && selectedDate && setSelectedDate && (
        <Box
          px={2}
          py={1}
          borderTop="1px solid"
          borderColor={themeMode === "dark" ? "whiteAlpha.200" : "gray.200"}
          display="flex"
          justifyContent="center"
          userSelect="none"
        >
          <DateSelector date={selectedDate} setDate={setSelectedDate} />
        </Box>
      )}
    </Box>
  );
}
