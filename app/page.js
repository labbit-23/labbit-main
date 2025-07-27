'use client';

import { Box, Heading, Text, Button, VStack, HStack, Icon } from "@chakra-ui/react";
import { FaUserShield, FaUser, FaUserNurse } from "react-icons/fa";
import Link from "next/link";

export default function Page() {
  return (
    <Box maxW="lg" mx="auto" mt={20} p={8} bg="white" borderRadius="lg" boxShadow="xl">
      <Heading textAlign="center" size="2xl" fontWeight="extrabold" mb={6} color="blue.700">
        Welcome to Labbit
      </Heading>
      <Text textAlign="center" fontSize="lg" mb={8} color="gray.600">
        Your platform for seamless home sample collection management.
      </Text>
      <VStack spacing={6}>
        <Link href="/admin" passHref>
          <Button
            as="a"
            leftIcon={<FaUserShield />}
            colorScheme="blue"
            size="lg"
            width="100%"
            variant="solid"
          >
            Admin Dashboard
          </Button>
        </Link>

        <Link href="/patient" passHref>
          <Button
            as="a"
            leftIcon={<FaUser />}
            colorScheme="green"
            size="lg"
            width="100%"
            variant="solid"
          >
            Patient - Book a Home Visit
          </Button>
        </Link>

        <Link href="/phlebo" passHref>
          <Button
            as="a"
            leftIcon={<FaUserNurse />}
            colorScheme="purple"
            size="lg"
            width="100%"
            variant="solid"
          >
            HV Executive Dashboard
          </Button>
        </Link>
      </VStack>
    </Box>
  );
}
