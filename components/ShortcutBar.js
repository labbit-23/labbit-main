"use client";

import { Flex, IconButton, Tooltip, Image, Box } from "@chakra-ui/react";
import { FiLogOut, FiHome } from "react-icons/fi";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";
import Link from "next/link";

export default function ShortcutBar() {
  const router = useRouter();

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      alert("Error logging out: " + error.message);
    } else {
      router.push("/login"); // Or wherever your login/home page is
    }
  };

  const handleHomeDashboard = () => {
    router.push("/admin");
  };

  return (
    <Flex
      position="fixed"
      top={0}
      left={0}
      right={0}
      height="56px"
      bg="rgba(255, 255, 255, 0.75)"
      backdropFilter="blur(10px)"
      px={4}
      boxShadow="sm"
      align="center"
      justify="space-between"
      zIndex={1000}
    >
      {/* Logo on the left */}
      <Box cursor="pointer" onClick={() => router.push("/")} maxH="40px" display="flex" alignItems="center">
        <Image
          src="/logo.png"           // Assuming logo is in /public/logo.png
          alt="Labbit Logo"
          maxH="40px"
          objectFit="contain"
          _hover={{ opacity: 0.8 }}
        />
      </Box>

      {/* Shortcut buttons on the right */}
      <Flex align="center" gap={2}>
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
