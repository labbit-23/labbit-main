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
} from "@chakra-ui/react";
import { FiLogOut, FiHome } from "react-icons/fi";
import DateSelector from "../app/components/DateSelector";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";
import { useUser } from "../app/context/UserContext";

// Map roles to display label and color scheme
const ROLE_MARKERS = {
  admin:    { label: "Admin",    color: "blue"   },
  manager:  { label: "Manager",  color: "cyan"   },
  director: { label: "Director", color: "purple" },
  phlebo:   { label: "Phlebo",   color: "green"  },
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
}) {
  const router = useRouter();
  const isMobile = useBreakpointValue({ base: true, md: false });
  const { user, refreshUser } = useUser();

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
          router.push("/admin");
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

  return (
    <Box
      position="fixed"
      top={0}
      left={0}
      right={0}
      bg="rgba(255,255,255,0.85)"
      backdropFilter="blur(12px)"
      boxShadow="sm"
      zIndex={1000}
    >
      {/* First row: logo + info + home/role/logout all fit here */}
      <Flex
        height="56px"
        px={{ base: 2, md: 4 }}
        align="center"
        justify="space-between"
        userSelect="none"
        flexWrap="nowrap"
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
              alt="Labbit Logo"
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
              color="teal.700"
              isTruncated
              maxW={{ base: "90px", sm: "150px" }}
            >
              {user.name}
            </Text>
          )}
        </Flex>

        {/* Right section: Home + Role badge + Logout */}
        <Flex align="center" gap={{ base: 1, sm: 2 }} flexShrink={0}>
          <Tooltip label="Dashboard Home">
            <IconButton
              icon={<FiHome />}
              onClick={handleHomeDashboard}
              variant="ghost"
              size={{ base: "sm", sm: "md" }}
              aria-label="Go to dashboard home"
            />
          </Tooltip>
          {!!user && (
            <Tooltip label={`Logged in as ${roleMarker.label}`}>
              <Badge
                colorScheme={roleMarker.color}
                variant="subtle"
                px={{ base: 1, sm: 2 }}
                borderRadius="md"
                fontSize="xs"
                fontWeight="bold"
                maxW="60px"
                isTruncated
              >
                {roleMarker.label}
              </Badge>
            </Tooltip>
          )}
          <Tooltip label="Logout">
            <IconButton
              icon={<FiLogOut />}
              onClick={handleLogout}
              variant="ghost"
              size={{ base: "sm", sm: "md" }}
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
          borderColor="gray.200"
          display="flex"
          justifyContent="center"
          userSelect="none"
        >
          <DateSelector date={selectedDate} setDate={setSelectedDate} />
        </Box>
      )}

      {!isMobile && selectedDate && setSelectedDate && (
        <Flex
          position="absolute"
          top={0}
          left="50%"
          transform="translateX(-50%)"
          height="72px"
          alignItems="center"
          pointerEvents="none"
          userSelect="none"
          zIndex={999}
          px={4}
        >
          <Box pointerEvents="auto" maxW="320px" width="100%">
            <DateSelector date={selectedDate} setDate={setSelectedDate} />
          </Box>
        </Flex>
      )}
    </Box>
  );
}
