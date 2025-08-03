//app/patient/page.js
"use client";

import React, { useState, useEffect } from "react";
import { Box, Heading, Text, VStack, Flex, Button } from "@chakra-ui/react";
import ShortcutBar from "../../components/ShortcutBar";
import PatientVisitCards from "../components/PatientVisitCards";
import PatientsTab from '../components/PatientsTab';
import AddressPicker from "../components/AddressPicker";       // Make sure these imports exist
import AddressManager from "../components/AddressManager";
import ModularPatientModal from "../components/ModularPatientModal";
import VisitModal from "../components/VisitModal";

export default function PatientDashboard() {
  // For now, hardcode userRole as "patient"
  const userRole = "patient";

  const [phone, setPhone] = useState("");
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [addresses, setAddresses] = useState([]);
  const [selectedAddress, setSelectedAddress] = useState(null);
  const [isPatientModalOpen, setPatientModalOpen] = useState(false);
  const [isVisitModalOpen, setVisitModalOpen] = useState(false);
  const [visitToEdit, setVisitModalToEdit] = useState(null);

  // State to hold the currently selected visit card
  const [selectedVisitId, setSelectedVisitId] = useState(null);

  const openVisitModal = (visit = null) => {
    setVisitModalToEdit(visit);
    setVisitModalOpen(true);
  };

  // Select visit card handler: toggles selection
  const handleSelectVisit = (visitId) => {
    setSelectedVisitId(visitId === selectedVisitId ? null : visitId);
  };

  // Logging selected patient and selected visit for debug
  useEffect(() => {
    if (selectedPatient) {
      console.log("Selected patient:", selectedPatient);
    } else {
      console.log("No patient selected");
    }
  }, [selectedPatient]);

  useEffect(() => {
    console.log("Selected Visit ID:", selectedVisitId);
  }, [selectedVisitId]);

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
      {/* Pass userRole prop */}
      <ShortcutBar userRole={userRole} />

      <Flex align="flex-start" justify="center" minH="100vh" py={8} pt="64px">
        <Box
          maxW="600px"
          w="full"
          bg="rgba(255,255,255,0.75)"
          borderRadius="xl"
          boxShadow="2xl"
          p={6}
        >
          <VStack spacing={6} align="stretch">
            <Heading size="lg" textAlign="center" color="teal.700">
              Welcome to Labbit
            </Heading>

            {/* PatientsTab to select patient */}
            <PatientsTab onPatientSelected={setSelectedPatient} />

            {selectedPatient ? (
              <>
                <Text fontWeight="medium" color="gray.600">
                  Hello, {selectedPatient.name || "Patient"}!
                </Text>

                
                {/* AddressPicker and AddressManager */}
                {/*
                <AddressPicker
                  patientId={selectedPatient.id}
                  selectedAddress={selectedAddress}
                  setSelectedAddress={setSelectedAddress}
                />
                <AddressManager
                  patientId={selectedPatient.id}
                  onAddressesChange={setAddresses}
                />
                
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
                />

                <Button
                  colorScheme="green"
                  mt={4}
                  onClick={() => openVisitModal()}
                  width="100%"
                >
                  Book a Home Visit
                </Button>
                
                */}
                
                {/* PatientVisitCards with selection */}
                <PatientVisitCards
                  patientId={selectedPatient.id}
                  selectedVisitId={selectedVisitId}
                  onSelectVisit={handleSelectVisit}
                  openVisitModal={openVisitModal}
                />

                {/* Visit modal for new/edit */}
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
