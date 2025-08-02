// File: /app/patient/page.js

"use client";

import React, { useState } from "react";
import { Box, Heading, Text, VStack, Flex, Button } from "@chakra-ui/react";
import ShortcutBar from "../../components/ShortcutBar";

// REUSE your components:
import PatientsTab from "./PatientsTab";
import VisitModal from "./VisitModal";
import AddressManager from "../../components/AddressManager";
import AddressSelector from "./AddressSelector";
import VisitScheduler from "../../components/VisitScheduler";
import ModularPatientModal from "../../components/ModularPatientModal";

export default function PatientDashboard({ initialPhone }) {
  // State for selected patient, visit, and modal control
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [selectedVisit, setSelectedVisit] = useState(null);
  const [visitModalOpen, setVisitModalOpen] = useState(false);

  // Address states
  const [addresses, setAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [addressLabel, setAddressLabel] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [latLng, setLatLng] = useState({ lat: null, lng: null });

  // Patient Modal state
  const [patientModalOpen, setPatientModalOpen] = useState(false);

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

            {/* PatientsTab for listing, switching, or managing family patients */}
            <PatientsTab
              onPatientSelected={(patient) => setSelectedPatient(patient)}
              // add other handlers if needed
            />

            {/* Selected patient actions */}
            {selectedPatient ? (
              <>
                <Text fontWeight="medium" color="gray.600">
                  Current: {selectedPatient.name}
                </Text>

                {/* Address picker for this patient */}
                <AddressSelector
                  addresses={addresses}
                  selectedAddressId={selectedAddressId}
                  setSelectedAddressId={setSelectedAddressId}
                  addressLabel={addressLabel}
                  setAddressLabel={setAddressLabel}
                  addressLine={addressLine}
                  setAddressLine={setAddressLine}
                  latLng={latLng}
                  setLatLng={setLatLng}
                />

                {/* Manage addresses if needed */}
                <AddressManager patientId={selectedPatient.id} />

                {/* Button to open VisitModal for new visit booking */}
                <Button
                  colorScheme="green"
                  onClick={() => {
                    setSelectedVisit(null); // Set to null for a new booking, or pass visit for edit
                    setVisitModalOpen(true);
                  }}
                  width="100%"
                >
                  Book a Home Visit
                </Button>

                {/* VisitModal for booking/editing visits */}
                <VisitModal
                  isOpen={visitModalOpen}
                  onClose={() => setVisitModalOpen(false)}
                  onSubmit={/* callback to handle new/edited visit submission */}
                  patientId={selectedPatient.id}
                  addresses={addresses}
                  visitInitialData={selectedVisit}
                  // Add other props as required
                />

                {/* ModularPatientModal for editing patient info */}
                <ModularPatientModal
                  isOpen={patientModalOpen}
                  onClose={() => setPatientModalOpen(false)}
                  patient={selectedPatient}
                />
              </>
            ) : (
              <Text color="gray.500" textAlign="center">
                Please select a patient or family member above.
              </Text>
            )}
          </VStack>
        </Box>
      </Flex>
    </Box>
  );
}
