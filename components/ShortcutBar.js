// File: /components/ShortcutBar.js

"use client";

import React from "react";
import {
  Flex,
  IconButton,
  Tooltip,
  Image,
  Box,
  Heading,
  Select,
} from "@chakra-ui/react";
import { FiLogOut, FiHome } from "react-icons/fi";
import DateSelector from "../app/components/DateSelector"; // Using your confirmed import path
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
}) {
  const router = useRouter();

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      alert("Error logging out: " + error.message);
    } else {
      router.push("/login");
    }
  };

  const handleHomeDashboard = () => {
    if (userRole === "patient") {
      router.push("/patient-dashboard");
    } else if (userRole === "phlebo" || userRole === "executive") {
      router.push("/phlebo");
    } else if (userRole === "admin") {
      router.push("/admin");
    } else {
      router.push("/");
    }
  };

  return (
    <Flex
      position="fixed"
      top={0}
      left={0}
      right={0}
      height="72px" // taller for welcome + date
      bg="rgba(255, 255, 255, 0.85)"
      backdropFilter="blur(12px)"
      px={2}
      boxShadow="sm"
      align="center"
      justify="space-between"
      zIndex={1000}
    >
      {/* Left: Logo + Welcome + Executive Selector */}
      <Box
        display="flex"
        alignItems="center"
        cursor="pointer"
        onClick={() => router.push("/")}
        maxH="56px"
        minW="180px"
      >
        <Image
          src="/logo.png"
          alt="Labbit Logo"
          maxH="44px"
          objectFit="contain"
          _hover={{ opacity: 0.8 }}
          mr={{ base: 2, md: 4 }}
        />
        {(userRole === "phlebo" || userRole === "executive" || userRole === "admin") && (
          <Box>
            <Heading
              size="sm"
              color="teal.600"
              fontWeight="extrabold"
              mb={-1}
              whiteSpace="nowrap"
              textOverflow="ellipsis"
              overflow="hidden"
              maxW="110px"
              title={hvExecutiveName}
            >
              {hvExecutiveName ? `Welcome, ${hvExecutiveName}` : "Welcome"}
            </Heading>

            {/* Executive selector: show only when multiple execs and setter prop provided, disable as required */}
            {executives.length > 1 && setSelectedExecutiveId && (
              <Select
                size="sm"
                mt={1}
                value={selectedExecutiveId || ""}
                onChange={(e) => setSelectedExecutiveId(e.target.value)}
                maxW="120px"
                aria-label="Select Executive"
                isDisabled={!!hvExecutiveName && userRole !== "admin"}
              >
                {executives.map(({ id, name }) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </Select>
            )}
          </Box>
        )}
      </Box>

      {/* Center: DateSelector container */}
      {(userRole === "admin" || userRole === "phlebo" || userRole === "executive") &&
      selectedDate &&
      setSelectedDate ? (
        <Box
          flex="1"
          minW={{ base: "168px", md: "250px" }}
          maxW={{ base: "100%", md: "300px" }}
          display="flex"
          justifyContent="center"
          alignItems="center"
          px={{ base: 1, md: 0 }}
          overflow="visible"
        >
          <DateSelector date={selectedDate} setDate={setSelectedDate} />
        </Box>
      ) : (
        <Box flex="1" />
      )}

      {/* Right: Home & Logout Buttons */}
      <Flex align="center" gap={1}>
        <Tooltip label="Dashboard Home" aria-label="Dashboard Home button">
          <IconButton
            icon={<FiHome />}
            onClick={handleHomeDashboard}
            variant="ghost"
            size="md"
            aria-label="Go to dashboard home"
          />
        </Tooltip>

        <Tooltip label="Logout" aria-label="Logout button">
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
  );
}
