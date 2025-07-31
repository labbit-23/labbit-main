// app/components/AddressPicker.js
'use client';

import React, { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import {
  VStack, HStack, Button, Input, Box, Select, Text, useToast,
} from '@chakra-ui/react';
import { SmallAddIcon } from '@chakra-ui/icons';

// Lazy load Leaflet map with SSR disabled (important)
const LeafletMap = dynamic(() => import('./LeafletMap'), { ssr: false });

// === AddressSearch Subcomponent ===
// Props: onSelect(item), at (lat,lng string)
function AddressSearch({ onSelect, at }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isFocused, setIsFocused] = useState(false);
  const abortCtrl = useRef(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }

    if (abortCtrl.current) abortCtrl.current.abort();
    abortCtrl.current = new AbortController();

    const signal = abortCtrl.current.signal;

    const fetchResults = async () => {
      try {
        const params = new URLSearchParams({ q, at: at || '17.385,78.486' });
        const res = await fetch(`/api/nextbillion/search?${params.toString()}`, { signal });
        if (!res.ok) {
          setResults([]);
          return;
        }
        const data = await res.json();
        setResults(data.items || []);
      } catch (err) {
        if (err.name !== 'AbortError') {
          setResults([]);
          console.error('Autocomplete fetch error', err);
        }
      }
    };

    const timeoutId = setTimeout(fetchResults, 300);
    return () => {
      clearTimeout(timeoutId);
      if (abortCtrl.current) {
        abortCtrl.current.abort();
      }
    };
  }, [query, at]);

  const handleSelect = (item) => {
    setQuery(item.title);
    setResults([]);
    onSelect(item);
    setIsFocused(false);
  };

  return (
    <Box position="relative" width="100%">
      <Input
        placeholder="Search address or landmark"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setTimeout(() => setIsFocused(false), 200)} // allow click on suggestion
        autoComplete="off"
      />
      {isFocused && results.length > 0 && (
        <Box
          as="ul"
          position="absolute"
          bg="white"
          borderWidth="1px"
          borderRadius="md"
          width="100%"
          maxH="200px"
          overflowY="auto"
          zIndex="1000"
          marginTop="2px"
          padding="0"
          style={{ listStyle: 'none' }}
        >
          {results.map((item) => (
            <Box
              as="li"
              key={item.id}
              px="3"
              py="2"
              cursor="pointer"
              _hover={{ bg: 'gray.100' }}
              onMouseDown={() => handleSelect(item)}
            >
              <Text fontWeight="medium">{item.title}</Text>
              {item.address?.label && <Text fontSize="sm" color="gray.600">{item.address.label}</Text>}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

// === Main AddressPicker Component ===
// Props:
//  patientId (string), optional
//  initialAddresses (array), optional - to prefill
//  onSaveComplete(address or addresses) - callback on successful save

export default function AddressPicker({ patientId, initialAddresses = [], onSaveComplete }) {
  const toast = useToast();

  // List of addresses { id?, label, index, lat, lng, address_line, pin_code }
  const [addresses, setAddresses] = useState([]);
  // Index of currently active / editing address
  const [activeIndex, setActiveIndex] = useState(0);
  // Labels fetched from backend or static list
  const [labelOptions, setLabelOptions] = useState(['Home', 'Work', 'Clinic', 'Other']);
  const [loading, setLoading] = useState(false);

  // Initialize from props or fetch from backend
  useEffect(() => {
    async function fetchAddresses() {
      if (!patientId) {
        setAddresses(initialAddresses.length ? initialAddresses : [{
          label: 'Home',
          index: 0,
          lat: 17.385,
          lng: 78.486,
          address_line: '',
          pin_code: '',
        }]);
        setActiveIndex(0);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`/api/patients/addresses?patient_id=${patientId}`);
        if (!res.ok) throw new Error('Failed to fetch addresses');
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setAddresses(data);
          setActiveIndex(0);
        } else {
          setAddresses([{
            label: 'Home',
            index: 0,
            lat: 17.385,
            lng: 78.486,
            address_line: '',
            pin_code: '',
          }]);
          setActiveIndex(0);
        }
      } catch (err) {
        toast({ title: 'Error loading addresses', description: err.message, status: 'error' });
        setAddresses([]);
      }
      setLoading(false);
    }

    fetchAddresses();
  }, [patientId, initialAddresses, toast]);

  // Fetch label options (could be backend call)
  useEffect(() => {
    async function fetchLabels() {
      try {
        const res = await fetch('/api/patients/address_labels');
        if (!res.ok) throw new Error('Failed to fetch labels');
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) setLabelOptions(data);
      } catch (err) {
        // fallback labels already set
        console.warn('Failed to load address labels:', err.message);
      }
    }
    fetchLabels();
  }, []);

  // Defensive defaulting for controlled inputs to avoid React warnings
  const activeAddress = addresses[activeIndex] || {
    label: '',
    index: 0,
    lat: 17.385,
    lng: 78.486,
    address_line: '',
    pin_code: '',
  };

  // Update currently edited address field
  const updateActiveField = (field) => (e) => {
    const val = e.target.value ?? '';
    const newAddresses = [...addresses];
    if (!newAddresses[activeIndex]) newAddresses[activeIndex] = {};
    newAddresses[activeIndex] = {
      ...newAddresses[activeIndex],
      [field]: val,
    };
    setAddresses(newAddresses);
  };

  // Called on map marker drag or map click
  const onLocationChange = (lat, lng) => {
    const newAddresses = [...addresses];
    if (!newAddresses[activeIndex]) newAddresses[activeIndex] = {};
    newAddresses[activeIndex] = {
      ...newAddresses[activeIndex],
      lat,
      lng,
    };
    setAddresses(newAddresses);
  };

  // Called when user selects from autocomplete list
  const onAutocompleteSelect = (item) => {
    if (!item?.position) return;
    const newAddresses = [...addresses];
    newAddresses[activeIndex] = {
      ...newAddresses[activeIndex],
      lat: item.position.lat,
      lng: item.position.lng,
      address_line: item.title ?? '',
      pin_code: item.address?.postalCode ?? '',
    };
    setAddresses(newAddresses);
  };

  // Add new blank address tab
  const addNewAddress = () => {
    const maxIndex = addresses.reduce((max, addr) => Math.max(max, addr.index ?? 0), -1);
    const newAddr = {
      label: '',
      index: maxIndex + 1,
      lat: 17.385,
      lng: 78.486,
      address_line: '',
      pin_code: '',
    };
    setAddresses([...addresses, newAddr]);
    setActiveIndex(addresses.length);
  };

  // Remove current address tab
  const removeAddress = () => {
    if (!addresses[activeIndex]) return;
    const newAddresses = addresses.filter((_, idx) => idx !== activeIndex);
    setAddresses(newAddresses);
    setActiveIndex(newAddresses.length ? 0 : -1);
  };

  // Save or update current address(es)
  const saveAddresses = async () => {
    if (!patientId) {
      toast({ title: 'Patient ID missing', status: 'error' });
      return;
    }
    setLoading(true);
    try {
      // Send all addresses in current state to serve as updated list
      const res = await fetch(`/api/patients/addresses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patient_id: patientId, addresses }),
      });
      if (!res.ok) throw new Error('Failed to save addresses');
      const saved = await res.json();
      setAddresses(saved);
      toast({ title: 'Addresses saved successfully', status: 'success' });
      if (onSaveComplete) onSaveComplete(saved);
    } catch (err) {
      toast({ title: 'Save failed', description: err.message, status: 'error' });
      console.error(err);
    }
    setLoading(false);
  };

  return (
    <VStack spacing="6" w="full" maxW="700px" mx="auto" p="4" borderWidth="1px" borderRadius="md">

      {/* Address Tabs Selector */}
      <HStack spacing="2" overflowX="auto" mb="4">
        {addresses.map((addr, idx) => (
          <Button
            key={addr.id ?? idx}
            size="sm"
            onClick={() => setActiveIndex(idx)}
            variant={idx === activeIndex ? 'solid' : 'outline'}
            flexShrink="0"
          >
            {addr.label || '(no label)'}
          </Button>
        ))}
        <Button size="sm" onClick={addNewAddress} leftIcon={<SmallAddIcon />} flexShrink="0">Add New</Button>
      </HStack>

      {/* Active Address Edit Section */}
      <VStack spacing="4" w="full" align="stretch">

        {/* Label combo + Add new label button */}
        <HStack spacing="4" maxW="sm">
          <Select
            placeholder="Select label"
            value={activeAddress.label ?? ''}
            onChange={updateActiveField('label')}
          >
            {labelOptions.map((lbl) => <option key={lbl} value={lbl}>{lbl}</option>)}
          </Select>
          <Button size="sm" onClick={() => {
            const newLabel = prompt('Enter new label:');
            if (newLabel && !labelOptions.includes(newLabel)) {
              setLabelOptions([...labelOptions, newLabel]);
              // Update active address label immediately with default input event
              updateActiveField('label')({ target: { value: newLabel } });
            }
          }}>
            + Add Label
          </Button>
        </HStack>

        {/* Address and Pin inputs */}
        <HStack>
          <Input
            placeholder="Address"
            value={activeAddress.address_line ?? ''}
            onChange={updateActiveField('address_line')}
            flex="3"
          />
          <Input
            placeholder="Pin Code"
            value={activeAddress.pin_code ?? ''}
            onChange={updateActiveField('pin_code')}
            flex="1"
          />
        </HStack>

        {/* Leaflet Map */}
        <Box height="300px" borderRadius="md" overflow="hidden">
          <LeafletMap
            markerPosition={[activeAddress.lat ?? 17.385, activeAddress.lng ?? 78.486]}
            onLocationChange={onLocationChange}
          />
        </Box>

        {/* Autocomplete */}
        <AddressSearch onSelect={onAutocompleteSelect} at={`${activeAddress.lat ?? 17.385},${activeAddress.lng ?? 78.486}`} />

        {/* Action Buttons */}
        <HStack justify="flex-end" spacing="4">
          {activeIndex >= 0 ? (
            <>
              <Button colorScheme="red" onClick={removeAddress}>Delete</Button>
              <Button colorScheme="green" onClick={saveAddresses} isLoading={loading}>Save</Button>
            </>
          ) : (
            <Button colorScheme="blue" onClick={saveAddresses} isLoading={loading}>Save Address</Button>
          )}
        </HStack>
      </VStack>
    </VStack>
  );
}
