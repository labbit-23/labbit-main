"use client";

import { Box, Heading, Text, Button, VStack, Image, Flex } from "@chakra-ui/react";
import { FaUserShield, FaUser, FaUserNurse } from "react-icons/fa";
import Link from "next/link";

export default function Page() {
  return (
    <Box
      minH="100vh"
      w="100vw"
      bg="gray.50"
      style={{
        backgroundImage: 'url("/visual.png")',
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundSize: "cover",
      }}
    >
      <Flex
        align="center"
        justify="center"
        h="100vh"
        py={12}
      >
        <Box
          maxW="lg"
          w="full"
          bg="rgba(255,255,255,0.50)"
          borderRadius="lg"
          boxShadow="2xl"
          textAlign="center"
          px={[6, 12]}
          py={[10, 14]}
          backdropFilter="blur(6px)"
          style={{
            // For Safari support
            WebkitBackdropFilter: "blur(6px)",
          }}
        >
          <Image
            src="/logo.png"
            alt="Labbit Logo"
            mx="auto"
            mb={8}
            maxH="80px"
            objectFit="contain"
            fallbackSrc="https://via.placeholder.com/150"
          />
          <Heading
            size="2xl"
            fontWeight="extrabold"
            mb={4}
            color="teal.600"
            lineHeight="shorter"
          >
            Welcome to Labbit
          </Heading>
          <Text
            fontSize="lg"
            mb={10}
            color="gray.600"
            maxW="md"
            mx="auto"
            letterSpacing="wide"
          >
            Your platform for seamless home sample collection management.
          </Text>

          <VStack spacing={6} maxW="400px" mx="auto" align="stretch">
            <Button
              as={Link}
              href="/admin"
              leftIcon={<FaUserShield />}
              colorScheme="teal"
              size="lg"
              width="100%"
              fontWeight="bold"
              borderRadius="md"
              variant="solid"
              aria-label="Admin Dashboard"
              _hover={{ bg: "teal.700" }}
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
              fontWeight="bold"
              borderRadius="md"
              variant="solid"
              aria-label="Patient - Book a Home Visit"
              _hover={{ bg: "green.600" }}
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
              fontWeight="bold"
              borderRadius="md"
              variant="solid"
              aria-label="HV Executive Dashboard"
              _hover={{ bg: "purple.600" }}
            >
              HV Executive Dashboard
            </Button>
          </VStack>
        </Box>
      </Flex>
    </Box>
  );
}
