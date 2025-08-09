"use client";

import React, { useState, useEffect } from "react";
import {
  Box,
  Heading,
  Text,
  Button,
  VStack,
  HStack,
  Input,
  useDisclosure,
  useToast,
  Spinner,
  Divider,
  Flex,
} from "@chakra-ui/react";

import PatientLookup from "./PatientLookup";
import VisitModal from "../components/VisitModal"; // Adjust this import per your structure
import AddressManager from "../components/AddressManager";
import TestPackageSelector from "../../components/TestPackageSelector";

export default function PatientDashboard() {
  const toast = useToast();

  const [selectedPatient, setSelectedPatient] = useState(null);
  const [defaultAddress, setDefaultAddress] = useState(null);
  const [selectedTests, setSelectedTests] = useState(new Set());

  const { isOpen: isVisitModalOpen, onOpen: onVisitModalOpen, onClose: onVisitModalClose } = useDisclosure();
  const { isOpen: isAddressManagerOpen, onOpen: onAddressManagerOpen, onClose: onAddressManagerClose } = useDisclosure();

  const [loadingPatientData, setLoadingPatientData] = useState(false);
  const [upcomingVisits, setUpcomingVisits] = useState(null);
  const [loadingVisits, setLoadingVisits] = useState(false);

  // When a patient is selected, load their upcoming visits & default address
  useEffect(() => {
    if (!selectedPatient) {
      setUpcomingVisits(null);
      setDefaultAddress(null);
      return;
    }

    const fetchPatientData = async () => {
      setLoadingVisits(true);
      try {
        // Fetch upcoming visits - replace API endpoint based on your backend
        const res = await fetch(`/api/visits?patient_id=${selectedPatient.id}&limit=3&order=asc`); 
        const visits = await res.json();
        setUpcomingVisits(visits || []);
        
        // Fetch patient addresses - modify if you have separate API
        const addrRes = await fetch(`/api/patients/addresses?patient_id=${selectedPatient.id}`);
        const addresses = await addrRes.json();
        const defaultAdr = addresses.find((a) => a.is_default) || addresses[0] || null;
        setDefaultAddress(defaultAdr);
      } catch (e) {
        toast({
          title: "Error loading patient data",
          description: e.message || "Please try again later.",
          status: "error",
          duration: 4000,
          isClosable: true,
        });
      }
      setLoadingVisits(false);
    };

    fetchPatientData();
  }, [selectedPatient, toast]);

  const updateDefaultAddress = (address) => setDefaultAddress(address);

  // Simple helper to format visit date/time
  const formatVisitInfo = (visit) => {
    const date = new Date(visit.visit_date).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    const time = visit.time_slot ? visit.time_slot : "Time TBD";
    const status = visit.status ? visit.status.replace(/_/g, " ") : "Status Unknown";
    return `${date} at ${time} — ${status}`;
  };

  return (
    <Box maxW="480px" mx="auto" p={4}>
      {/* Header */}
      <Box as="header" mb={6} textAlign="center" borderBottom="1px solid" borderColor="gray.200" pb={4}>
        <Heading size="lg" color="brand.500" fontWeight="bold">
          Labbit
        </Heading>
        <Text fontSize="sm" color="gray.600" mt={1}>
          Your health, our priority.
        </Text>
      </Box>

      {/* Patient Selector */}
      <Box mb={6}>
        <PatientLookup
          onPatientSelected={setSelectedPatient}
          onNewPatient={() => toast({ title: "Add New Patient Coming Soon", status: "info" })}
        />
      </Box>

      {/* Welcome */}
      {selectedPatient ? (
        <Box px={2} mb={6}>
          <Text fontSize="lg" fontWeight="semibold" color="gray.700" mb={1}>
            Hello, {selectedPatient.name}!
          </Text>
          <Text fontSize="sm" color="gray.600">
            Monitor your health and book visits easily.
          </Text>
        </Box>
      ) : (
        <Text mb={6} px={2} fontSize="sm" color="gray.500" textAlign="center">
          Please select a patient to continue.
        </Text>
      )}

      {/* Upcoming Visits Summary */}
      {selectedPatient && (
        <Box mb={6} px={2}>
          <Heading size="md" mb={3}>Upcoming Visits</Heading>
          {loadingVisits ? (
            <Spinner />
          ) : upcomingVisits && upcomingVisits.length > 0 ? (
            <VStack spacing={3} align="stretch">
              {upcomingVisits.map((visit) => (
                <Box key={visit.id} p={3} borderWidth="1px" borderRadius="md" bg="gray.50">
                  <Text fontWeight="bold" fontSize="sm">{formatVisitInfo(visit)}</Text>
                  <Text fontSize="sm" color="gray.600">{visit.address || "Address not set"}</Text>
                </Box>
              ))}
            </VStack>
          ) : (
            <Text fontSize="sm" color="gray.500">No upcoming visits scheduled.</Text>
          )}
        </Box>
      )}

      {/* Tests & Packages */}
      {selectedPatient && (
        <Box mb={6} px={2} bg="gray.50" p={3} borderRadius="md">
          <Heading size="md" mb={3} color="gray.700">Browse Tests & Packages</Heading>
          <Input
            placeholder="Search tests and packages..."
            mb={3}
            size="md"
            // onChange={} // Implement search/filter logic in TestPackageSelector
          />
          <Box maxHeight="300px" overflowY="auto">
            <TestPackageSelector
              initialSelectedTests={selectedTests}
              onSelectionChange={setSelectedTests}
            />
          </Box>
        </Box>
      )}

      {/* Address Summary & Manage */}
      {selectedPatient && (
        <Box mb={6} px={2}>
          <Text fontWeight="medium" color="gray.600" mb={1}>Default Address</Text>

          <Box border="1px solid" borderColor="gray.300" borderRadius="md" p={3} mb={2} minH="60px">
            {defaultAddress ? (
              <>
                <Text fontSize="sm">{defaultAddress.label || "No Label"}</Text>
                <Text fontSize="sm" color="gray.700" mt={1}>
                  {defaultAddress.address_line}
                </Text>
              </>
            ) : (
              <Text fontSize="sm" color="gray.500">No default address set.</Text>
            )}
          </Box>
          <Button variant="outline" colorScheme="blue" size="sm" width="100%" onClick={onAddressManagerOpen}>
            Manage Addresses
          </Button>
        </Box>
      )}

      {/* Booking Actions */}
      {selectedPatient && (
        <>
          <Divider my={6} />
          <VStack spacing={3} mb={6}>
            <Button colorScheme="green" size="lg" width="100%" onClick={onVisitModalOpen}>
              Book Home Visit
            </Button>
            <Button
              colorScheme="teal"
              size="lg"
              width="100%"
              isDisabled
            >
              Book Lab Appointment (Coming Soon)
            </Button>
          </VStack>
        </>
      )}

      {/* Modals */}
      <VisitModal
        isOpen={isVisitModalOpen}
        onClose={onVisitModalClose}
        onSubmit={(visitData) => {
          console.log("Scheduled visit data", visitData);
          toast({ title: "Visit booked (demo)", status: "success" });
          onVisitModalClose();
        }}
        patientId={selectedPatient?.id}
        patients={selectedPatient ? [selectedPatient] : []}
        isLoading={false}
      />

      <AddressManager
        isOpen={isAddressManagerOpen}
        onClose={onAddressManagerClose}
        patientId={selectedPatient?.id}
        onAddressChange={setDefaultAddress}
      />
    </Box>
  );
}

