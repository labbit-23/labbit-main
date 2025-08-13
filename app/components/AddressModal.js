// File: /app/components/AddressModal.js
'use client';
import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import {
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalCloseButton,
  ModalBody, ModalFooter, Button, FormControl, FormLabel, Input,
  VStack, HStack, Spinner, Text, IconButton, Switch, Tooltip
} from '@chakra-ui/react';
import { EditIcon } from '@chakra-ui/icons';
import { MdMyLocation } from 'react-icons/md';

// Leaflet map client-only import
const LeafletMap = dynamic(() => import('./LeafletMap'), { ssr: false });

export default function AddressModal({ isOpen, onClose, onSave, address }) {
  const [form, setForm] = useState({
    id: null,
    label: '',
    area: '',
    address_line: '',
    pincode: '',
    city: '',
    state: '',
    country: '',
    lat: 17.385,
    lng: 78.486,
    is_default: false
  });

  const [editingLabel, setEditingLabel] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // Initialize form values
  useEffect(() => {
    if (address) {
      setForm({
        id: address.id || null,
        label: address.label || '',
        area: address.area || '',
        address_line: address.address_line || '',
        pincode: address.pincode || '',
        city: address.city || '',
        state: address.state || '',
        country: address.country || '',
        lat: address.lat || 17.385,
        lng: address.lng || 78.486,
        is_default: !!address.is_default
      });
    } else {
      setForm({
        id: null,
        label: '',
        area: '',
        address_line: '',
        pincode: '',
        city: '',
        state: '',
        country: '',
        lat: 17.385,
        lng: 78.486,
        is_default: false
      });
    }
  }, [address]);

  // Autocomplete
  const handleSearchChange = async (e) => {
    const value = e.target.value;
    setSearchTerm(value);
    if (value.length < 3) return setSearchResults([]);
    setSearchLoading(true);
    try {
      const res = await fetch(`/api/location_autocomplete?query=${encodeURIComponent(value)}`);
      const data = await res.json();
      setSearchResults(data.features || []);
    } catch {
      setSearchResults([]);
    }
    setSearchLoading(false);
  };

  const handleSelectSuggestion = async (feature) => {
    const [lng, lat] = feature.center || feature.geometry?.coordinates || [];
    if (!lat || !lng) return;
    setForm(f => ({ ...f, lat, lng }));
    setSearchTerm('');
    setSearchResults([]);
    await performReverseGeocode(lat, lng);
  };

  // Reverse geocode — fill only empty form fields
  const performReverseGeocode = async (lat, lng) => {
    try {
      const res = await fetch(`/api/reverse_geocode?lat=${lat}&lng=${lng}`);
      const data = await res.json();
      setForm(f => ({
        ...f,
        address_line: f.address_line || data.address_line || '',
        area: f.area || data.area || '',
        city: f.city || data.city || '',
        state: f.state || data.state || '',
        country: f.country || data.country || '',
        pincode: f.pincode || data.pincode || ''
      }));
    } catch (err) {
      console.error(err);
    }
  };

  // Pincode lookup
  const handlePinLookup = async () => {
    if (!form.pincode) return;
    try {
      const res = await fetch(`/api/pincode_lookup?pincode=${form.pincode}`);
      const data = await res.json();
      setForm(f => ({
        ...f,
        city: f.city || data.city || '',
        state: f.state || data.state || '',
        country: f.country || data.country || '',
        area: f.area || data.area || ''
      }));
    } catch {}
  };

  // Use current geo
  const handleUseCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async (pos) => {
        const { latitude, longitude } = pos.coords;
        setForm(f => ({ ...f, lat: latitude, lng: longitude }));
        await performReverseGeocode(latitude, longitude);
      }, (err) => {
        console.error("Location error:", err);
      });
    }
  };

  const handleMapSelect = async (lat, lng) => {
    setForm(f => ({ ...f, lat, lng }));
    await performReverseGeocode(lat, lng);
  };

  // Local save click — defers actual POST/PUT to parent for now
  const handleSaveClick = () => {
    onSave?.(form);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>{address ? 'Edit' : 'Add'} Address</ModalHeader>
        <ModalCloseButton />
        {/* LIMIT HEIGHT + SCROLL for gestures */}
        <ModalBody maxH="70vh" overflowY="auto">
          <VStack spacing={4} align="stretch">

            {/* --- Top section: label + address line + area + pin --- */}
            <FormControl>
              <FormLabel>Label</FormLabel>
              <HStack>
                <Input
                  value={form.label}
                  readOnly={!editingLabel}
                  onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                />
                <IconButton
                  icon={<EditIcon />}
                  size="sm"
                  onClick={() => setEditingLabel(!editingLabel)}
                  aria-label="Edit label"
                />
              </HStack>
            </FormControl>

            <FormControl>
              <FormLabel>Address Line</FormLabel>
              <Input
                value={form.address_line}
                onChange={e => setForm(f => ({ ...f, address_line: e.target.value }))}
              />
            </FormControl>

            <FormControl>
              <FormLabel>Area</FormLabel>
              <Input
                value={form.area}
                onChange={e => setForm(f => ({ ...f, area: e.target.value }))}
              />
            </FormControl>

            <FormControl>
              <FormLabel>Pincode</FormLabel>
              <Input
                value={form.pincode}
                onBlur={handlePinLookup}
                onChange={e => setForm(f => ({ ...f, pincode: e.target.value }))}
              />
            </FormControl>

            {/* --- Map + search section --- */}
            <LeafletMap
              markerPosition={[form.lat, form.lng]}
              onLocationChange={handleMapSelect}
              style={{ height: "200px" }} // smaller map
            />

            <HStack>
              <Input
                value={searchTerm}
                onChange={handleSearchChange}
                placeholder="Search for a location..."
              />
              <Tooltip label="Use current location">
                <IconButton
                  icon={<MdMyLocation />}
                  onClick={handleUseCurrentLocation}
                  aria-label="Use current location"
                />
              </Tooltip>
            </HStack>
            {searchLoading && <Spinner size="sm" />}
            {searchResults.length > 0 && (
              <VStack mt={2} maxH="150px" overflowY="auto" p={2} border="1px solid #E2E8F0" borderRadius="md" bg="white">
                {searchResults.map(feature => (
                  <Text
                    key={feature.id}
                    cursor="pointer"
                    _hover={{ bg: "teal.50" }}
                    onClick={() => handleSelectSuggestion(feature)}
                  >
                    {feature.place_name || feature.properties?.name}
                  </Text>
                ))}
              </VStack>
            )}

            {/* --- Bottom section: City/State/Country --- */}
            <HStack>
              <FormControl>
                <FormLabel>City</FormLabel>
                <Input
                  value={form.city}
                  onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                />
              </FormControl>
              <FormControl>
                <FormLabel>State</FormLabel>
                <Input
                  value={form.state}
                  onChange={e => setForm(f => ({ ...f, state: e.target.value }))}
                />
              </FormControl>
              <FormControl>
                <FormLabel>Country</FormLabel>
                <Input
                  value={form.country}
                  onChange={e => setForm(f => ({ ...f, country: e.target.value }))}
                />
              </FormControl>
            </HStack>

            {/* Set default */}
            <FormControl display="flex" alignItems="center">
              <FormLabel mb="0">Set as default</FormLabel>
              <Switch
                isChecked={form.is_default}
                onChange={e => setForm(f => ({ ...f, is_default: e.target.checked }))}
              />
            </FormControl>
          </VStack>
        </ModalBody>
        <ModalFooter>
          <Button onClick={handleSaveClick} colorScheme="blue" mr={3}>Save</Button>
          <Button onClick={onClose}>Cancel</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
