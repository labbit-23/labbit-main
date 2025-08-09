// File: /app/components/AddressManager.js
'use client';

import React, { useEffect, useState } from 'react';
import { VStack, Text, useToast } from '@chakra-ui/react';
import AddressPicker from './AddressPicker';
import AddressModal from './AddressModal';

export default function AddressManager({ patientId, onChange }) {
  const [addresses, setAddresses] = useState([]);
  const [labels, setLabels] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState(null);
  const toast = useToast();

  // Fetch address labels
  const fetchLabels = async () => {
    try {
      const res = await fetch(`/api/patients/address_labels?patient_id=${patientId}`);
      const data = await res.json();
      setLabels(Array.isArray(data) ? data : []);
    } catch {
      setLabels([]);
    }
  };

  // Fetch addresses
  const fetchAddresses = async () => {
    try {
      const res = await fetch(`/api/patients/addresses?patient_id=${patientId}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setAddresses(data);
        onChange?.(data);
      } else {
        setAddresses([]);
        onChange?.([]);
      }
    } catch {
      setAddresses([]);
      onChange?.([]);
    }
  };

  useEffect(() => {
    if (!patientId) {
      setLabels([]);
      setAddresses([]);
      return;
    }
    fetchLabels();
    fetchAddresses();
  }, [patientId]);

  // Save / update address list in DB
  const persistAddresses = async (updated) => {
    try {
      const res = await fetch('/api/patients/addresses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: patientId,
          addresses: updated
        })
      });
      if (!res.ok) throw new Error(await res.text());
      const saved = await res.json();
      setAddresses(saved);
      onChange?.(saved);
      toast({ title: 'Addresses saved', status: 'success', duration: 3000 });
    } catch (err) {
      console.error('Error saving addresses:', err);
      toast({
        title: 'Error saving addresses',
        description: err.message,
        status: 'error',
        duration: 5000
      });
    }
  };

  const handleSave = (newAddr) => {
    let updated = [...addresses];

    if (newAddr.id) {
      // Editing an existing one → merge fields to avoid overwriting
      const idx = updated.findIndex(a => a.id === newAddr.id);
      if (idx > -1) {
        updated[idx] = { ...updated[idx], ...newAddr };
      } else {
        updated.push(newAddr);
      }
    } else {
      // New address → assign temp id
      updated.push({
        ...newAddr,
        id: `temp-${Date.now()}`
      });
    }

    setAddresses(updated);
    persistAddresses(updated); // persist right away
    setModalOpen(false);
  };

  return (
    <VStack spacing={4} maxH="440px" overflowY="auto" w="full">
      <AddressPicker
        addresses={addresses}
        setAddresses={setAddresses}
        labels={labels}
        onAdd={() => { setEditingAddress(null); setModalOpen(true); }}
        onEdit={(addr) => { setEditingAddress(addr); setModalOpen(true); }}
      />
      {addresses.length === 0 && (
        <Text color="gray.500" fontStyle="italic" textAlign="center">
          No addresses available.
        </Text>
      )}
      <AddressModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        address={editingAddress}
      />
    </VStack>
  );
}
