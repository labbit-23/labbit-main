// File: /app/patient/page.js

"use client";

import React, { useState, useMemo } from "react";
import { Box, Heading, Text, VStack, Flex, Button } from "@chakra-ui/react";
import ShortcutBar from "../../components/ShortcutBar";

// Your app-specific components
import PatientsTab from "./PatientsTab";
import VisitModal from "./VisitModal";
import AddressManager from "../../components/AddressManager";
import AddressSelector from "./AddressSelector";
import VisitScheduler from "../../components/VisitScheduler";
import ModularPatientModal from "../../components/ModularPatientModal";

export default function PatientDashboard({ initialPhone }) {
  // State for selected patient, visit, and modal control
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [selectedVisit, setSelectedVisit] = useState(null); // null for "new", object for edit
  const [visitModalOpen, setVisitModalOpen] = useState(false);

  // Address-related UI state (if needed for display)
  const [addresses, setAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [addressLabel, setAddressLabel] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [latLng, setLatLng] = useState({ lat: null, lng: null });

  // Patient Modal state
  const [patientModalOpen, setPatientModalOpen] = useState(false);

  // Submission logic for VisitModal
  const handleVisitSubmit = (formData) => {
    // You can add API calls, notification, visit refresh, etc. here
    // For now, just close the modal.
    setVisitModalOpen(false);
    // Optionally update local visits state, selectedVisit, etc.
  };

  // Memoize any default values for VisitModal to avoid effect loops
  const visitModalDefaultValues = useMemo(
    () => ({
      status: "booked", // example; add more defaults as needed
    }),
    []
  );

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

            {/* PatientsTab for switching/managing patient selection */}
            <PatientsTab
              onPatientSelected={setSelectedPatient}
              // other handlers as needed
            />

            {selectedPatient ? (
              <>
                <Text fontWeight="medium" color="gray.600">
                  Current: {selectedPatient.name}
                </Text>

                {/* Address picker - can manage or edit outside VisitModal */}
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

                {/* Manage addresses for current patient */}
                <AddressManager patientId={selectedPatient.id} />

                {/* Book new visit button */}
                <Button
                  colorScheme="green"
                  onClick={() => {
                    setSelectedVisit(null); // new booking
                    setVisitModalOpen(true);
                  }}
                  width="100%"
                >
                  Book a Home Visit
                </Button>

                {/* VisitModal for creating or editing a visit (edit logic can be added as needed) */}
                {visitModalOpen && (
                  <VisitModal
                    isOpen={visitModalOpen}
                    onClose={() => setVisitModalOpen(false)}
                    onSubmit={handleVisitSubmit}
                    patientId={selectedPatient.id}
                    visitInitialData={selectedVisit}
                    defaultValues={visitModalDefaultValues}
                    // Pass hiddenFields/readOnlyFields if needed for role
                  />
                )}

                {/* Edit patient info */}
                <ModularPatientModal
                  isOpen={patientModalOpen}
                  onClose={() => setPatientModalOpen(false)}
                  patient={selectedPatient}
                  // add other props as needed
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
