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
import DateSelector from "../app/components/DateSelector"; // Use your confirmed import path
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";

export default function ShortcutBar({
  userRole = "admin",
  executives = [],
  selectedExecutiveId,
  setSelectedExecutiveId,
  hvExecutiveName,
  selectedDate,
  setSelectedDate,
  lockExecutive = false,
}) {
  const router = useRouter();

  const isMobile = useBreakpointValue({ base: true, md: false });

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      alert("Error logging out: " + error.message);
    } else {
      router.push("/");
    }
  };

  const handleHomeDashboard = (e) => {
    e.stopPropagation();
    if (userRole === "patient") {
      router.push("/patient");  // Updated per your last note
    } else if (userRole === "phlebo" || userRole === "executive") {
      router.push("/phlebo");
    } else if (userRole === "admin") {
      router.push("/admin");
    } else {
      router.push("/");
    }
  };

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
      {/* First line: Logo + Welcome + Executive selector + Home/Logout */}
      <Flex
        height="56px"
        px={{ base: 2, md: 4 }}
        align="center"
        justify="space-between"
        userSelect="none"
      >
        {/* Left side */}
        <Flex align="center" flexShrink={0} minW="280px" gap={3}>
          {/* Logo: clickable only */}
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

          {/* Welcome */}
          <Text
            fontWeight="bold"
            fontSize={{ base: "sm", md: "md" }}
            color="teal.600"
            whiteSpace="nowrap"
            userSelect="none"
            display={{ base: "none", md: "block" }} // hide on mobile to save space
          >
            Welcome
          </Text>

          {/* Executive Selector */}
          {executives.length > 0 && setSelectedExecutiveId && (
            <Select
              size="sm"
              maxW="140px"
              value={selectedExecutiveId || ""}
              onChange={(e) => {
                e.stopPropagation();
                setSelectedExecutiveId(e.target.value);
              }}
              aria-label="Select Executive"
              isDisabled={lockExecutive}
              whiteSpace="nowrap"
            >
              {executives.map(({ id, name }) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </Select>
          )}
        </Flex>

        {/* Right side: Home and Logout */}
        <Flex align="center" gap={2} flexShrink={0}>
          <Tooltip label="Dashboard Home" aria-label="Go to dashboard home">
            <IconButton
              icon={<FiHome />}
              onClick={handleHomeDashboard}
              variant="ghost"
              size="md"
              aria-label="Go to dashboard home"
            />
          </Tooltip>

          <Tooltip label="Logout" aria-label="Logout">
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

      {/* Second line: DateSelector (only visible on mobile) */}
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

      {/* On desktop, place DateSelector centered inline and visible */}
      {!isMobile && selectedDate && setSelectedDate && (
        <Flex
          position="absolute"
          top={0}
          left="50%"
          transform="translateX(-50%)"
          height="72px"
          alignItems="center"
          pointerEvents="none" // To avoid overlapping clickable areas in desktop header
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
