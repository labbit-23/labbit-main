// File: /app/components/ModularPatientModal.js

'use client';

import { useState, useEffect } from 'react';
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
  Select,
  Text,
  VStack,
  useToast,
  Box,
  Collapse,
  IconButton,
  Flex,
} from '@chakra-ui/react';

import { ChevronDownIcon, ChevronUpIcon } from '@chakra-ui/icons';

import AddressManager from './AddressManager'; // Update import path/name if needed

export default function ModularPatientModal({ isOpen, onClose, onSubmit, initialPatient, disablePhoneInput = false }) {
  const toast = useToast();

  // Patient form state
  const [patientData, setPatientData] = useState({
    id: null,
    name: '',
    dob: '',
    gender: '',
    email: '',
    cregno: '',
    phone: '',
  });

  // Addresses state
  const [addresses, setAddresses] = useState([]);
  const [loadingAddresses, setLoadingAddresses] = useState(false);

  // Collapsible addresses toggle state
  const [showAddresses, setShowAddresses] = useState(false);

  // Toggle function for addresses section
  const toggleAddresses = () => setShowAddresses((prev) => !prev);

  // Update local state when modal opens or initialPatient changes
  useEffect(() => {
    if (!isOpen) return;

    if (initialPatient) {
      setPatientData({
        id: initialPatient.id ?? null,
        name: initialPatient.name ?? initialPatient.fname ?? '',
        dob: initialPatient.dob ?? '',
        gender: initialPatient.gender ?? '',
        email: initialPatient.email ?? '',
        cregno: initialPatient.cregno ?? '',
        phone: initialPatient.phone ?? '',
      });

      if (initialPatient.addresses && Array.isArray(initialPatient.addresses)) {
        // Use provided addresses if any
        setAddresses(initialPatient.addresses);
        setShowAddresses(initialPatient.addresses.length > 0); // open if addresses exist
      } else if (initialPatient.id) {
        // Fetch addresses from backend API for existing patient
        setLoadingAddresses(true);
        fetch(`/api/patients/addresses?patient_id=${initialPatient.id}`)
          .then((res) => res.json())
          .then((data) => {
            if (Array.isArray(data)) setAddresses(data);
            else setAddresses([]);
            setShowAddresses(data?.length > 0);
          })
          .catch(() => {
            setAddresses([]);
            setShowAddresses(false);
          })
          .finally(() => setLoadingAddresses(false));
      } else {
        // New patient: start with empty addresses and collapsed
        setAddresses([]);
        setShowAddresses(false);
      }
    } else {
      // No initialPatient: reset form and collapse addresses
      setPatientData({
        id: null,
        name: '',
        dob: '',
        gender: '',
        email: '',
        cregno: '',
        phone: '',
      });
      setAddresses([]);
      setShowAddresses(false);
    }
  }, [initialPatient, isOpen]);

  // Helper to update patient fields immutably
  const updateField = (field) => (e) => {
    setPatientData((prev) => ({ ...prev, [field]: e.target.value }));
  };

  // Validate required form fields before saving
  const validateForm = () => {
    if (!patientData.name.trim()) {
      toast({ title: 'Please enter patient name', status: 'warning' });
      return false;
    }
    if (!patientData.dob) {
      toast({ title: 'Please enter date of birth', status: 'warning' });
      return false;
    }
    if (!patientData.phone || patientData.phone.length < 10) {
      toast({ title: 'Valid phone number required', status: 'warning' });
      return false;
    }
    return true;
  };

  // Save patient including addresses
  const handleSave = async () => {
    if (!validateForm()) return;

    try {
      const payload = {
        ...patientData,
        addresses,
      };

      const res = await fetch('/api/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const error = await res.json();
        toast({ title: 'Save failed', description: error.error ?? 'Unknown error', status: 'error' });
        return;
      }

      const savedPatient = await res.json();
      toast({ title: 'Patient saved successfully', status: 'success' });
      onSubmit?.(savedPatient);
      onClose();
    } catch (err) {
      toast({ title: 'Error saving patient', description: err.message || 'Check console', status: 'error' });
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="4xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent maxHeight="80vh" overflowY="auto">
        <ModalHeader>{patientData.id ? 'Edit Patient' : 'Add Patient'}</ModalHeader>
        <ModalCloseButton />

        <ModalBody>
          <VStack spacing={4} align="stretch">
            <FormControl isRequired>
              <FormLabel>Name</FormLabel>
              <Input value={patientData.name} onChange={updateField('name')} />
            </FormControl>

            <FormControl isRequired>
              <FormLabel>Date of Birth</FormLabel>
              <Input type="date" value={patientData.dob} onChange={updateField('dob')} />
            </FormControl>

            <FormControl>
              <FormLabel>Gender</FormLabel>
              <Select value={patientData.gender} onChange={updateField('gender')}>
                <option value="">Select</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </Select>
            </FormControl>

            <FormControl>
              <FormLabel>Email</FormLabel>
              <Input type="email" value={patientData.email} onChange={updateField('email')} />
            </FormControl>

            <FormControl isRequired>
              <FormLabel>Phone</FormLabel>
              <Input
                value={patientData.phone}
                maxLength={10}
                onChange={updateField('phone')}
                placeholder="10-digit phone number"
                isDisabled={disablePhoneInput}
                aria-readonly={disablePhoneInput}
              />
            </FormControl>

            <FormControl>
              <FormLabel>CREGNO</FormLabel>
              <Input value={patientData.cregno} onChange={updateField('cregno')} isDisabled={!!patientData.id} />
              {patientData.id && !patientData.cregno && (
                <Text fontSize="sm" color="gray.500" mt={1}>
                  Save patient to enable CREGNO input.
                </Text>
              )}
            </FormControl>

            {/* Collapsible Addresses Section */}
            <Box>
              <Flex
                justify="space-between"
                align="center"
                cursor="pointer"
                onClick={toggleAddresses}
                p={2}
                borderBottom="1px solid"
                borderColor="gray.200"
                userSelect="none"
                fontWeight="semibold"
              >
                Addresses
                <IconButton
                  size="sm"
                  icon={showAddresses ? <ChevronUpIcon /> : <ChevronDownIcon />}
                  aria-label={showAddresses ? 'Collapse addresses' : 'Expand addresses'}
                  onClick={(e) => {
                    e.stopPropagation(); // prevent toggleAddresses firing twice
                    toggleAddresses();
                  }}
                />
              </Flex>
              <Collapse in={showAddresses} animateOpacity>
                <Box mt={3}>
                  {loadingAddresses ? (
                    <Text>Loading addresses...</Text>
                  ) : (
                    <AddressManager patientId={patientData.id} initialAddresses={addresses} onChange={setAddresses} />
                  )}
                </Box>
              </Collapse>
            </Box>
          </VStack>
        </ModalBody>

        <ModalFooter>
          <Button colorScheme="blue" onClick={handleSave} mr={3}>
            Save
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
