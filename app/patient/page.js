// File: /app/patient/page.js

"use client";

import React, { useState } from "react";
import { Box, Heading, Text, VStack, Flex, Button } from "@chakra-ui/react";
import ShortcutBar from "../../components/ShortcutBar";

// Use the shared/global components ONLY (not /app/patient/)
import PatientLookup from "../components/PatientLookup";
import AddressManager from "../components/AddressManager";
import AddressPicker from "../components/AddressPicker";
import ModularPatientModal from "../components/ModularPatientModal";
import VisitModal from "../components/VisitModal";
import PatientsTab from "../components/PatientsTab";

export default function PatientDashboard() {
  // Global state for patient/phone/address/visit selection
  const [phone, setPhone] = useState("");
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [addresses, setAddresses] = useState([]);
  const [selectedAddress, setSelectedAddress] = useState(null);

  // Modal controls
  const [isPatientModalOpen, setPatientModalOpen] = useState(false);
  const [isVisitModalOpen, setVisitModalOpen] = useState(false);
  const [visitToEdit, setVisitToEdit] = useState(null);

  // Handler to open visit modal for new/edit visit
  const openVisitModal = (visit = null) => {
    setVisitToEdit(visit);
    setVisitModalOpen(true);
  };

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
          p={6}
        >
          <VStack spacing={6} align="stretch">
            <Heading size="lg" textAlign="center" color="teal.700">
              Welcome to Labbit
            </Heading>

            

            {/* If managing multiple patients (family) */}
            <PatientsTab onPatientSelected={setSelectedPatient} />

            {selectedPatient ? (
              <>
                <Text fontWeight="medium" color="gray.600">
                  Hello, {selectedPatient.name || "Patient"}!
                </Text>

                {/* Pick an address (do not use AddressEditor) */}
                <AddressPicker
                  patientId={selectedPatient.id}
                  selectedAddress={selectedAddress}
                  setSelectedAddress={setSelectedAddress}
                />

                {/* Full address management */}
                <AddressManager
                  patientId={selectedPatient.id}
                  onAddressesChange={setAddresses}
                />

                {/* Button to open patient info edit modal */}
                <Button
                  colorScheme="blue"
                  onClick={() => setPatientModalOpen(true)}
                  width="100%"
                >
                  Edit Patient Details
                </Button>

                <ModularPatientModal
                  isOpen={isPatientModalOpen}
                  onClose={() => setPatientModalOpen(false)}
                  patient={selectedPatient}
                  // Add a save handler if needed
                />

                {/* Visit modal for new visits */}
                <Button
                  colorScheme="green"
                  mt={4}
                  onClick={() => openVisitModal()}
                  width="100%"
                >
                  Book a Home Visit
                </Button>
                <VisitModal
                  isOpen={isVisitModalOpen}
                  onClose={() => setVisitModalOpen(false)}
                  onSubmit={() => setVisitModalOpen(false)}
                  patientId={selectedPatient.id}
                  address={selectedAddress}
                  visitInitialData={visitToEdit}
                />
              </>
            ) : (
              <Text fontSize="sm" color="gray.600" textAlign="center">
                Please enter your phone number or select a patient above.
              </Text>
            )}
          </VStack>
        </Box>
      </Flex>
    </Box>
  );
}
