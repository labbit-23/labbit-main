// app/components/SharedPatientModal.js
'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
  Button,
  Input,
  FormControl,
  FormLabel,
  Textarea,
  Select,
  Box,
  Text,
  useToast,
  VStack,
  HStack,
  Badge,
} from '@chakra-ui/react';
import { AddIcon } from '@chakra-ui/icons';

// Dynamically import LeafletMap to avoid SSR issues
const DynamicLeafletMap = dynamic(() => import('./LeafletMap'), {
  ssr: false,
  loading: () => (
    <Box height="300px" bg="gray.100" display="flex" alignItems="center" justifyContent="center">
      <Text color="gray.500">Loading map...</Text>
    </Box>
  ),
});

export default function SharedPatientModal({ isOpen, onClose, onSubmit }) {
  const [phone, setPhone] = useState('');
  const [step, setStep] = useState('phone'); // 'phone' → 'existing-list' → 'form'
  const [patients, setPatients] = useState([]); // List of patients from lookup
  const [patientData, setPatientData] = useState({
    id: null,
    name: '',
    dob: '',
    gender: '',
    email: '',
    address_line: '',
    pincode: '',
    lat: null,
    lng: null,
    cregno: '',
  });
  const toast = useToast();

  // Reset form when closing
  const resetForm = () => {
    setPhone('');
    setStep('phone');
    setPatients([]);
    setPatientData({
      id: null,
      name: '',
      dob: '',
      gender: '',
      email: '',
      address_line: '',
      pincode: '',
      lat: null,
      lng: null,
      cregno: '',
    });
  };

  const handleCancel = () => {
    resetForm();
    onClose();
  };

  // Step 1: Lookup by phone
  const handleLookup = async () => {
    if (!phone || phone.length < 10) {
      toast({ title: 'Enter a valid phone number', status: 'warning' });
      return;
    }

    try {
      const res = await fetch(`/api/patient-lookup?phone=${phone}`);

      if (!res.ok) {
        const text = await res.text();
        toast({
          title: 'Lookup failed',
          description: `Error ${res.status}: ${text.substring(0, 100)}...`,
          status: 'error',
        });
        return;
      }

      let data;
      try {
        data = await res.json();
      } catch (jsonError) {
        console.error('Failed to parse JSON:', await res.text());
        toast({
          title: 'Invalid response from server',
          description: 'Check console for details',
          status: 'error',
        });
        return;
      }

      console.log('API Response:', data);

      // ✅ Ensure data.patients is an array
      let patientsFound = [];
      if (data && Array.isArray(data.patients)) {
        patientsFound = data.patients;
      } else if (data && typeof data.patients === 'object' && data.patients !== null) {
        patientsFound = [data.patients];
      } else if (Array.isArray(data)) {
        patientsFound = data;
      }

      if (patientsFound.length > 0) {
        setPatients(patientsFound);
        setStep('existing-list');
      } else {
        setStep('form');
        setPatientData(prev => ({ ...prev, phone }));
      }
    } catch (err) {
      console.error('Lookup failed:', err);
      toast({
        title: 'Lookup failed',
        description: err.message || 'Check console for details',
        status: 'error',
      });
    }
  };

  // Step 2: Save patient
  const handleSave = async () => {
    const payload = {
      ...patientData,
      phone,
    };

    try {
      const res = await fetch('/api/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const savedPatient = await res.json();
        toast({ title: 'Patient saved successfully', status: 'success' });
        onSubmit?.(savedPatient);
        handleCancel();
      } else {
        const error = await res.json();
        toast({
          title: 'Save failed',
          description: error.error || 'Unknown error',
          status: 'error',
        });
      }
    } catch (err) {
      toast({
        title: 'Network error',
        description: 'Check console for details',
        status: 'error',
      });
      console.error('Save error:', err);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleCancel} size="2xl">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Add Patient</ModalHeader>
        <ModalCloseButton />

        <ModalBody sx={{ maxHeight: '70vh', overflowY: 'auto', padding: '4' }}>
          {step === 'phone' && (
            <FormControl>
              <FormLabel>Phone Number</FormLabel>
              <Input
                placeholder="Enter patient phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                maxLength="10"
              />
              <Button mt={4} colorScheme="blue" onClick={handleLookup}>
                Lookup Patient
              </Button>
            </FormControl>
          )}

          {step === 'existing-list' && (
            <VStack spacing={3} align="stretch">
              {/* ✅ Show different headings based on source */}
              {patients[0]?.id ? (
                <Text fontWeight="bold">Patients found in Labbit:</Text>
              ) : (
                <Text fontWeight="bold">Patient from external source:</Text>
              )}

              {patients.map((p, i) => (
                <Box
                  key={i}
                  p={3}
                  border="1px"
                  borderColor="blue.200"
                  borderRadius="md"
                  bg="blue.50"
                  cursor="pointer"
                  _hover={{ bg: 'blue.100' }}
                  onClick={() => {
                    setPatientData({
                      id: p.id,
                      name: p.name,
                      dob: p.dob,
                      gender: p.gender,
                      email: p.email,
                      address_line: p.address_line,
                      pincode: p.pincode,
                      lat: p.lat,
                      lng: p.lng,
                      cregno: p.cregno,
                    });
                    setStep('form');
                  }}
                >
                  <Text fontWeight="semibold">{p.name}</Text>
                  <Text fontSize="sm" color="gray.700">
                    {/* ✅ Show MRN if available */}
                    {p.mrn && <><strong>{p.mrn}</strong> • </>}
                    DOB: {p.dob} • Gender: {p.gender || 'N/A'}
                  </Text>
                  {/* ✅ Only show CREGNO badge if no MRN */}
                  {p.cregno && !p.mrn && (
                    <Badge colorScheme="green" fontSize="xs">
                      CREGNO: {p.cregno}
                    </Badge>
                  )}
                  {p.address_line && (
                    <Text fontSize="sm" color="gray.600" noOfLines={1}>
                      {p.address_line}
                    </Text>
                  )}
                </Box>
              ))}

              <Button
                mt={4}
                variant="outline"
                colorScheme="green"
                leftIcon={<AddIcon />}
                onClick={() => {
                  setStep('form');
                  setPatientData(prev => ({ ...prev, phone, id: null, mrn: null }));
                }}
              >
                + Add New Patient (Same Phone)
              </Button>
            </VStack>
          )}

          {step === 'form' && (
            <VStack spacing={4} align="stretch">
              <FormControl>
                <FormLabel>MRN (Auto-generated)</FormLabel>
                <Input
                  value={patientData.mrn || ''}
                  isReadOnly
                  placeholder="Will be auto-generated"
                />
              </FormControl>

              <FormControl>
                <FormLabel>Name</FormLabel>
                <Input
                  value={patientData.name}
                  onChange={(e) =>
                    setPatientData({ ...patientData, name: e.target.value })
                  }
                />
              </FormControl>

              <FormControl>
                <FormLabel>Date of Birth</FormLabel>
                <Input
                  type="date"
                  value={patientData.dob}
                  onChange={(e) =>
                    setPatientData({ ...patientData, dob: e.target.value })
                  }
                />
              </FormControl>

              <FormControl>
                <FormLabel>Gender</FormLabel>
                <Select
                  value={patientData.gender}
                  onChange={(e) =>
                    setPatientData({ ...patientData, gender: e.target.value })
                  }
                >
                  <option value="">Select</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </Select>
              </FormControl>

              <FormControl>
                <FormLabel>Email</FormLabel>
                <Input
                  type="email"
                  value={patientData.email}
                  onChange={(e) =>
                    setPatientData({ ...patientData, email: e.target.value })
                  }
                />
              </FormControl>

              <FormControl>
                <FormLabel>Full Address</FormLabel>
                <Textarea
                  value={patientData.address_line}
                  onChange={(e) =>
                    setPatientData({
                      ...patientData,
                      address_line: e.target.value,
                    })
                  }
                  placeholder="Enter full address"
                />
              </FormControl>

              <FormControl>
                <FormLabel>Pincode</FormLabel>
                <Input
                  value={patientData.pincode}
                  onChange={(e) =>
                    setPatientData({ ...patientData, pincode: e.target.value })
                  }
                />
              </FormControl>

              <FormControl>
                <FormLabel>CREGNO (External ID)</FormLabel>
                <Input
                  value={patientData.cregno}
                  onChange={(e) =>
                    setPatientData({ ...patientData, cregno: e.target.value })
                  }
                  placeholder="Optional: CREGNO from hospital system"
                  isDisabled={!!patientData.id}
                />
                {!!patientData.id && !patientData.cregno && (
                  <Text fontSize="sm" color="gray.500" mt={1}>
                    Save patient to enable CREGNO input.
                  </Text>
                )}
              </FormControl>

              <FormControl>
                <FormLabel>Set Location on Map</FormLabel>
                <Box
                  height="300px"
                  width="100%"
                  borderRadius="md"
                  border="1px"
                  borderColor="gray.200"
                  overflow="hidden"
                >
                  <DynamicLeafletMap
                    onLocationSelect={(lat, lng) => {
                      setPatientData({ ...patientData, lat, lng });
                    }}
                    markerPosition={
                      patientData.lat && patientData.lng
                        ? [patientData.lat, patientData.lng]
                        : null
                    }
                  />
                </Box>
              </FormControl>
            </VStack>
          )}
        </ModalBody>

        <ModalFooter>
          {step === 'form' && (
            <>
              <Button colorScheme="blue" onClick={handleSave}>
                Save Patient
              </Button>
              <Button variant="ghost" onClick={() => setStep('phone')} ml={2}>
                Back
              </Button>
            </>
          )}
          {step !== 'form' && (
            <Button onClick={handleCancel}>Cancel</Button>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}