// File: /app/patient/page.js

"use client";

import React, { useState } from "react";
import { Box, Heading, Text, VStack, Flex } from "@chakra-ui/react";
import ShortcutBar from "../../components/ShortcutBar";
import PatientsTab from "../components/PatientsTab";

export default function PatientDashboard() {
  // Track selected patient (PatientsTab is now fully responsible for bookings/visits)
  const [selectedPatient, setSelectedPatient] = useState(null);

  return (
    <Box
      minH="100vh"
      w="100vw"
      style={{
        backgroundImage: 'url("/visual.png")',
        backgroundPosition: "top center",
        backgroundRepeat: "no-repeat",
        backgroundSize: "cover",
      }}
    >
      <ShortcutBar />
      <Flex align="flex-start" justify="center" minH="100vh" py={8} pt="64px">
        <Box
          maxW="600px"
          w="full"
          bg="rgba(255,255,255,0.5)"
          borderRadius="xl"
          boxShadow="2xl"
          p={[4, 6, 8]}
        >
          <VStack spacing={6} align="stretch">
            <Heading size="lg" color="teal.700" textAlign="center">
              Welcome to Labbit
            </Heading>

            {/* Patient selection and visit controls */}
            <PatientsTab onPatientSelected={setSelectedPatient} />

            {/* (Optional) Reference to current patient */}
            {selectedPatient && (
              <Text fontWeight="medium" color="gray.600">
                Selected Patient: {selectedPatient.name}
              </Text>
            )}

            {/* No extra "Book a Home Visit" button or modal here—handled inside PatientsTab */}
          </VStack>
        </Box>
      </Flex>
    </Box>
  );
}
