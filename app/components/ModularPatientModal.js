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
  HStack,
} from '@chakra-ui/react';

import { ChevronDownIcon, ChevronUpIcon } from '@chakra-ui/icons';
import AddressManager from './AddressManager';

function formatGender(val) {
  if (!val) return '';
  const g = String(val).toLowerCase();
  if (g === 'm' || g === 'male') return 'Male';
  if (g === 'f' || g === 'female') return 'Female';
  if (g === 'o' || g === 'other') return 'Other';
  return '';
}

function formatDateInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function deriveAgeFromDob(dob) {
  if (!dob) return '';
  const birthDate = new Date(dob);
  if (Number.isNaN(birthDate.getTime())) return '';

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDelta = today.getMonth() - birthDate.getMonth();
  const dayDelta = today.getDate() - birthDate.getDate();
  if (monthDelta < 0 || (monthDelta === 0 && dayDelta < 0)) {
    age -= 1;
  }

  return age >= 0 ? String(age) : '';
}

function deriveDobFromAge(ageValue) {
  const age = Number(ageValue);
  if (!Number.isFinite(age) || age < 0) return '';

  const today = new Date();
  const estimated = new Date(today.getFullYear() - age, 0, 1);
  return formatDateInput(estimated);
}

export default function ModularPatientModal({
  isOpen,
  onClose,
  onSubmit,
  initialPatient,  
  initialPhone = '',
  disablePhoneInput = false,
}) {
  const toast = useToast();

  // Removed MRN from state
  const [patientData, setPatientData] = useState({
    id: null,
    name: '',
    dob: '',
    gender: '',
    email: '',
    externalMrNo: '',
    phone: '',
    address_line: '',
    pincode: '',
  });

  const [addresses, setAddresses] = useState([]);
  const [ageInput, setAgeInput] = useState('');
  const [loadingAddresses, setLoadingAddresses] = useState(false);
  const [showAddresses, setShowAddresses] = useState(false);
  const [saving, setSaving] = useState(false);

  const toggleAddresses = () => setShowAddresses(prev => !prev);

  useEffect(() => {
    if (!isOpen) return;

    if (initialPatient) {
      setPatientData({
        id: initialPatient.id ?? null,
        name: initialPatient.name ?? '',
        dob: initialPatient.dob ?? '',
        gender: formatGender(initialPatient.gender),
        email: initialPatient.email ?? '',
        externalMrNo: initialPatient.external_key ?? '',
        phone: initialPatient.phone ?? initialPhone ?? '',  // Use fallback initialPhone
        address_line: initialPatient.address_line ?? '',
        pincode: initialPatient.pincode ?? '',
      });
      setAgeInput(deriveAgeFromDob(initialPatient.dob ?? ''));

      if (initialPatient.addresses && Array.isArray(initialPatient.addresses)) {
        setAddresses(initialPatient.addresses);
        setShowAddresses(initialPatient.addresses.length > 0);
      } else if (initialPatient.id) {
        setLoadingAddresses(true);
        fetch(`/api/patients/addresses?patient_id=${initialPatient.id}`)
          .then(res => res.json())
          .then(data => {
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
        setAddresses([]);
        setShowAddresses(false);
      }
    } else {
      setPatientData({
        id: null,
        name: '',
        dob: '',
        gender: '',
        email: '',
        externalMrNo: '',
        phone: initialPhone ?? '',  // <--- use initialPhone directly
        address_line: '',
        pincode: '',
      });
      setAgeInput('');
      setAddresses([]);
      setShowAddresses(false);
    }
  }, [initialPatient, isOpen]);

  const updateField = field => e => {
    const value = e.target.value;
    setPatientData(prev => ({ ...prev, [field]: value }));
    if (field === 'dob') {
      setAgeInput(deriveAgeFromDob(value));
    }
  };

  const updateAge = (e) => {
    const value = e.target.value;
    setAgeInput(value);

    if (value === '') {
      setPatientData((prev) => ({ ...prev, dob: '' }));
      return;
    }

    if (!/^\d{1,3}$/.test(value)) return;

    const derivedDob = deriveDobFromAge(value);
    if (derivedDob) {
      setPatientData((prev) => ({ ...prev, dob: derivedDob }));
    }
  };

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

  const handleSave = async () => {
    if (!validateForm()) return;
    setSaving(true);

    try {
      const payload = {
        id: patientData.id,
        phone: patientData.phone,       // always comes from verified/lookup
        name: patientData.name,
        dob: patientData.dob,
        gender: patientData.gender,
        email: patientData.email,
        cregno: patientData.externalMrNo, // map UI field name to API's expected 'cregno'
        addresses,                        // send addresses array to API
      };

      const res = await fetch('/api/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const error = await res.json();
        toast({
          title: 'Save failed',
          description: error.error ?? 'Unknown error',
          status: 'error',
        });
        return;
      }

      const savedPatient = await res.json();
      const sharedPhoneWarning = Array.isArray(savedPatient?.warnings)
        ? savedPatient.warnings.find((item) => item?.code === 'SHARED_PHONE_DETECTED')
        : null;
      if (sharedPhoneWarning) {
        const related = Array.isArray(sharedPhoneWarning.related_patients)
          ? sharedPhoneWarning.related_patients
          : [];
        const preview = related
          .slice(0, 3)
          .map((p) => (p?.name || 'Unknown') + ' (' + (p?.phone || '-') + ')')
          .join(', ');
        const suffix = related.length > 3 ? " +" + (related.length - 3) + " more" : "";
        toast({
          title: 'Shared phone detected',
          description: 'Same phone is already linked to other patient records: ' + preview + suffix + '. Please verify family relation before continuing.',
          status: 'warning',
          duration: 10000,
          isClosable: true,
        });
      }
      toast({ title: 'Patient saved successfully', status: 'success' });
      onSubmit?.(savedPatient);
      onClose();
    } catch (err) {
      toast({
        title: 'Error saving patient',
        description: err.message || 'Check console',
        status: 'error',
      });
    } finally {
      setSaving(false);
    }
  };


  return (
    <Modal isOpen={isOpen} onClose={onClose} size="4xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent maxHeight="80vh" overflowY="auto">
        <ModalHeader>{patientData.id ? 'Edit Patient' : 'Add Patient'}</ModalHeader>
        <ModalCloseButton isDisabled={saving} />

        <ModalBody>
          <VStack spacing={3} align="stretch">
            {/* Name */}
            <FormControl isRequired>
              <HStack spacing={3}>
                <FormLabel flex="0 0 140px">Name</FormLabel>
                <Input value={patientData.name} onChange={updateField('name')} />
              </HStack>
            </FormControl>

            {/* DOB */}
            <FormControl isRequired>
              <HStack spacing={3} align="flex-start">
                <FormLabel flex="0 0 140px">DOB</FormLabel>
                <VStack align="stretch" spacing={2} flex="1">
                  <HStack spacing={2}>
                    <Input
                      type="date"
                      value={patientData.dob}
                      onChange={updateField('dob')}
                    />
                    <Input
                      maxW="120px"
                      type="number"
                      min="0"
                      max="130"
                      placeholder="Age"
                      value={ageInput}
                      onChange={updateAge}
                    />
                  </HStack>
                  <Text fontSize="xs" color="gray.500">
                    Enter either DOB or age. Age auto-fills an estimated DOB using January 1 of the birth year.
                  </Text>
                </VStack>
              </HStack>
            </FormControl>

            {/* Gender */}
            <FormControl>
              <HStack spacing={3}>
                <FormLabel flex="0 0 140px">Gender</FormLabel>
                <Select value={patientData.gender} onChange={updateField('gender')}>
                  <option value="">Select</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </Select>
              </HStack>
            </FormControl>

            {/* Email */}
            <FormControl>
              <HStack spacing={3}>
                <FormLabel flex="0 0 140px">Email</FormLabel>
                <Input type="email" value={patientData.email} onChange={updateField('email')} />
              </HStack>
            </FormControl>

            {/* Phone - always locked */}
            <FormControl isRequired>
              <HStack spacing={3}>
                <FormLabel flex="0 0 140px">Phone</FormLabel>
                <Input
                  value={patientData.phone}
                  maxLength={10}
                  onChange={updateField('phone')}
                  placeholder="10-digit phone number"
                  isDisabled={disablePhoneInput}
                  aria-readonly="true"
                />
              </HStack>
            </FormControl>

            {/* External MR No - always locked */}
            <FormControl>
              <HStack spacing={3}>
                <FormLabel flex="0 0 140px">External MR No.</FormLabel>
                <Input
                  value={patientData.externalMrNo}
                  onChange={updateField('externalMrNo')}
                  isDisabled
                  aria-readonly="true"
                />
              </HStack>
              {patientData.id && !patientData.externalMrNo && (
                <Text fontSize="sm" color="gray.500" ml="143px" mt={1}>
                  Save patient to enable External MR No. input.
                </Text>
              )}
            </FormControl>

            {/* Addresses */}
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
                  onClick={e => {
                    e.stopPropagation();
                    toggleAddresses();
                  }}
                />
              </Flex>
              <Collapse in={showAddresses} animateOpacity>
                <Box mt={3}>
                  {loadingAddresses ? (
                    <Text>Loading addresses...</Text>
                  ) : (
                    <AddressManager
                      patientId={patientData.id}
                      initialAddresses={addresses}
                      onChange={setAddresses}
                    />
                  )}
                </Box>
              </Collapse>
            </Box>
          </VStack>
        </ModalBody>

        <ModalFooter>
          <Button
            colorScheme="blue"
            onClick={handleSave}
            mr={3}
            isLoading={saving}
            loadingText="Saving..."
            isDisabled={saving}
          >
            Save
          </Button>
          <Button variant="ghost" onClick={onClose} isDisabled={saving}>
            Cancel
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
