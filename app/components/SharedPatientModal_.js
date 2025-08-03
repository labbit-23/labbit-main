// app/components/SharedPatientModal.js
'use client';

import { useState, useEffect } from 'react';
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

// Using your updated AddressPicker component
import AddressPicker from './AddressPicker';

export default function SharedPatientModal({ isOpen, onClose, onSubmit }) {
  const [phone, setPhone] = useState('');
  const [step, setStep] = useState('phone'); // 'phone' → 'existing-list' → 'form'
  const [patients, setPatients] = useState([]);
  const [patientData, setPatientData] = useState({
    id: null,
    name: '',
    dob: '',
    gender: '',
    email: '',
    cregno: '',
  });
  const [addresses, setAddresses] = useState([]);
  const toast = useToast();

  // Reset everything on close
  const reset = () => {
    setPhone('');
    setStep('phone');
    setPatients([]);
    setPatientData({
      id: null,
      name: '',
      dob: '',
      gender: '',
      email: '',
      cregno: '',
    });
    setAddresses([]);
  };

  const handleCancel = () => {
    reset();
    onClose();
  };

  // Lookup patient by phone
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
      const data = await res.json();
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
        setPatientData(p => ({ ...p, phone }));
        setAddresses([]); // no addresses yet
      }
    } catch (err) {
      toast({
        title: 'Lookup failed',
        description: err.message || 'Check console',
        status: 'error',
      });
    }
  };

  // Save patient + addresses (calls your updated patient save API)
  const handleSave = async () => {
    const payload = {
      ...patientData,
      phone,
      addresses,  // array of addresses from AddressPicker
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
        reset();
        onClose();
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
        description: 'Check console',
        status: 'error',
      });
    }
  };

  // Load addresses on patientData change
  useEffect(() => {
    if (!patientData.id) {
      setAddresses([]);
      return;
    }
    const fetchAddresses = async () => {
      try {
        const res = await fetch(`/api/patients/addresses?patient_id=${patientData.id}`);
        if (!res.ok) throw new Error('Failed to fetch addresses');
        const data = await res.json();
        setAddresses(Array.isArray(data) ? data : []);
      } catch (e) {
        toast({ title: 'Error loading addresses', description: e.message, status: 'error' });
        setAddresses([]);
      }
    };
    fetchAddresses();
  }, [patientData.id, toast]);

  return (
    <Modal isOpen={isOpen} onClose={handleCancel} size="4xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent maxHeight="80vh" overflowY="auto">
        <ModalHeader>Add / Edit Patient</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          {step === 'phone' && (
            <FormControl>
              <FormLabel>Phone Number</FormLabel>
              <Input
                placeholder="Enter patient phone"
                value={phone}
                onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
                maxLength={10}
              />
              <Button mt={4} colorScheme="blue" onClick={handleLookup}>
                Lookup
              </Button>
            </FormControl>
          )}

          {step === 'existing-list' && (
            <VStack spacing={3} align="stretch">
              <Text fontWeight="bold">Patients found:</Text>
              {patients.map((p, i) => (
                <Box
                  key={p.id ?? i}
                  p={3}
                  borderWidth="1px"
                  borderColor="blue.300"
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
                      cregno: p.cregno || '',
                      phone: p.phone || phone,
                    });
                    setStep('form');
                  }}
                >
                  <Text fontWeight="semibold">{p.name}</Text>
                  <Text fontSize="sm" color="gray.700">
                    {p.mrn && (<><b>{p.mrn}</b> • </>)}
                    DOB: {p.dob} • Gender: {p.gender || 'N/A'}
                  </Text>
                  {p.cregno && !p.mrn && (
                    <Badge colorScheme="green" fontSize="xs">CREGNO: {p.cregno}</Badge>
                  )}
                </Box>
              ))}
              <Button
                mt={4}
                leftIcon={<AddIcon />}
                onClick={() => {
                  setStep('form');
                  setPatientData(p => ({
                    ...p,
                    id: null,
                    name: '',
                    dob: '',
                    gender: '',
                    email: '',
                    cregno: '',
                  }));
                  setAddresses([]);
                }}
                colorScheme="green"
              >
                Add New Patient
              </Button>
            </VStack>
          )}

          {step === 'form' && (
            <VStack spacing={4} align="stretch">
              <FormControl>
                <FormLabel>Patient Name</FormLabel>
                <Input
                  value={patientData.name}
                  onChange={e => setPatientData({ ...patientData, name: e.target.value })}
                />
              </FormControl>
              <FormControl>
                <FormLabel>Date of Birth</FormLabel>
                <Input
                  type="date"
                  value={patientData.dob}
                  onChange={e => setPatientData({ ...patientData, dob: e.target.value })}
                />
              </FormControl>
              <FormControl>
                <FormLabel>Gender</FormLabel>
                <Select
                  value={patientData.gender}
                  onChange={e => setPatientData({ ...patientData, gender: e.target.value })}
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
                  onChange={e => setPatientData({ ...patientData, email: e.target.value })}
                />
              </FormControl>
              <FormControl>
                <FormLabel>CREGNO</FormLabel>
                <Input
                  value={patientData.cregno}
                  onChange={e => setPatientData({ ...patientData, cregno: e.target.value })}
                  isDisabled={!!patientData.id}
                />
                {patientData.id && !patientData.cregno && (
                  <Text fontSize="sm" color="gray.500" mt={1}>
                    Save patient to enable CREGNO input.
                  </Text>
                )}
              </FormControl>

              <FormControl>
                <FormLabel>Address Information</FormLabel>
                <AddressPicker
                  patientId={patientData.id}
                  initialAddresses={addresses}
                  onSubmit={addresses => setAddresses(addresses)}
                  onChange={setAddresses}
                  addresses={addresses}
                />
              </FormControl>
            </VStack>
          )}
        </ModalBody>
        <ModalFooter>
          {step === 'form' ? (
            <>
              <Button colorScheme="blue" onClick={handleSave}>Save</Button>
              <Button onClick={() => setStep('phone')} ml={3}>Back</Button>
            </>
          ) : (
            <Button onClick={handleCancel}>Close</Button>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
