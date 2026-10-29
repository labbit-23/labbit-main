"use client";

import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { Flex, HStack, Image, Link, Text } from "@chakra-ui/react";

const ITEMS = [
  { href: "/panel", label: "Menu" },
  { href: "/panel/monitor", label: "Monitor" },
];

export default function PanelNav() {
  const pathname = usePathname();
  return (
    <Flex
      as="header"
      align="center"
      justify="space-between"
      wrap="wrap"
      gap={3}
      px={{ base: 4, md: 8 }}
      py={3}
      borderBottom="1px solid #1e2b4a"
      bg="#0b1220"
    >
      <HStack spacing={3}>
        <Image src="/labit-logo.png" alt="Labit" h="28px" />
        <Text fontWeight="700" color="#e5e9f5">Control Panel</Text>
      </HStack>
      <HStack spacing={5} as="nav" aria-label="Panel">
        {ITEMS.map((i) => {
          const active = pathname === i.href;
          return (
            <Link
              as={NextLink}
              key={i.href}
              href={i.href}
              color={active ? "#a5b4fc" : "#94a3b8"}
              fontWeight={active ? "700" : "500"}
              borderBottom={active ? "2px solid #6366f1" : "2px solid transparent"}
              _hover={{ color: "#e5e9f5", textDecoration: "none" }}
            >
              {i.label}
            </Link>
          );
        })}
        <Link as={NextLink} href="/cto" color="#94a3b8" _hover={{ color: "#e5e9f5", textDecoration: "none" }}>
          CTO dashboard
        </Link>
      </HStack>
    </Flex>
  );
}
