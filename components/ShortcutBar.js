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
  useBreakpointValue,
} from "@chakra-ui/react";
import { FiLogOut, FiHome } from "react-icons/fi";
import DateSelector from "../app/components/DateSelector";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";

import { useUser } from "../app/context/UserContext"; // global user context

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
  const { user, refreshUser } = useUser(); // ✅ get refreshUser

  // Logout handler: clears session, refreshes user context, then moves to login
  const handleLogout = async () => {
    try {
      // 1. Clear server-side session cookie
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (!res.ok) throw new Error("Failed to logout from server");

      // 2. Clear any Supabase session
      const { error } = await supabase.auth.signOut();
      if (error) {
        alert("Error logging out Supabase: " + error.message);
        return;
      }

      // 3. Refresh context so `user` becomes null immediately
      await refreshUser();

      // 4. Redirect to login (replace avoids going back with back button)
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
      <Flex
        height="56px"
        px={{ base: 2, md: 4 }}
        align="center"
        justify="space-between"
        userSelect="none"
      >
        {/* Left side: logo + welcome */}
        <Flex align="center" flexShrink={0} minW="280px" gap={3}>
          <Box
            cursor="pointer"
            onClick={(e) => {
              e.stopPropagation();
              router.push("/");
            }}
            maxH="44px"
            display="flex"
            alignItems="center"
          >
            <Image
              src="/logo.png"
              alt="Labbit Logo"
              maxH="36px"
              objectFit="contain"
              _hover={{ opacity: 0.8 }}
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
            />
          </Box>

          <Text
            fontWeight="bold"
            fontSize={{ base: "sm", md: "md" }}
            color="teal.600"
            whiteSpace="nowrap"
            display={{ base: "none", md: "block" }}
          >
            Welcome
          </Text>

          {/* Patient info */}
          {user?.userType === "patient" && (
            <Box whiteSpace="nowrap" fontWeight="medium" color="gray.700" fontSize="sm">
              <Text>Phone: {user.phone || "N/A"}</Text>
              {patients.length > 0 && setSelectedPatientId && (
                <Select
                  size="sm"
                  maxW="160px"
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
              {selectedPatient && (
                <Text mt={1} fontWeight="bold" color="teal.700">
                  Selected: {selectedPatient.name}
                </Text>
              )}
            </Box>
          )}

          {/* Executive/Admin/Phlebo info */}
          {user?.userType === "executive" && user?.name && (
            <Text fontWeight="bold" fontSize={{ base: "sm", md: "md" }} color="teal.700">
              {user.name}
            </Text>
          )}
        </Flex>

        {/* Right side: Dashboard home + Logout */}
        <Flex align="center" gap={2} flexShrink={0}>
          <Tooltip label="Dashboard Home">
            <IconButton
              icon={<FiHome />}
              onClick={handleHomeDashboard}
              variant="ghost"
              size="md"
              aria-label="Go to dashboard home"
            />
          </Tooltip>
          <Tooltip label="Logout">
            <IconButton
              icon={<FiLogOut />}
              onClick={handleLogout}
              variant="ghost"
              size="md"
              aria-label="Logout"
            />
          </Tooltip>
        </Flex>
      </Flex>

      {/* Second line: date selector */}
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
