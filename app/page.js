"use client";

import { Box, Heading, Text, Button, VStack } from "@chakra-ui/react";
import { FaUserShield, FaUser, FaUserNurse } from "react-icons/fa";
import Link from "next/link";

export default function Page() {
  return (
    <Box
      maxW="lg"
      mx="auto"
      mt={[10, 20]}
      px={[4, 8]}
      py={8}
      bg="white"
      borderRadius="lg"
      boxShadow="xl"
      textAlign="center"
      role="main"
    >
      <Heading size="2xl" fontWeight="extrabold" mb={6} color="blue.700">
        Welcome to Labbit
      </Heading>

      <Text fontSize="lg" mb={8} color="gray.600">
        Your platform for seamless home sample collection management.
      </Text>

      <VStack spacing={8} maxW="400px" mx="auto" align="stretch">
        <Button
          as={Link}
          href="/admin"
          leftIcon={<FaUserShield />}
          colorScheme="blue"
          size="lg"
          width="100%"
          variant="solid"
          aria-label="Admin Dashboard"
        >
          Admin Dashboard
        </Button>

        <Button
          as={Link}
          href="/patient"
          leftIcon={<FaUser />}
          colorScheme="green"
          size="lg"
          width="100%"
          variant="solid"
          aria-label="Patient - Book a Home Visit"
        >
          Patient - Book a Home Visit
        </Button>

        <Button
          as={Link}
          href="/phlebo"
          leftIcon={<FaUserNurse />}
          colorScheme="purple"
          size="lg"
          width="100%"
          variant="solid"
          aria-label="HV Executive Dashboard"
        >
          HV Executive Dashboard
        </Button>
      </VStack>
    </Box>
  );
}
