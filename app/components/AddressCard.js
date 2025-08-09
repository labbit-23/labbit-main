// File: /app/components/AddressCard.js
'use client';

import React from 'react';
import {
  Box,
  HStack,
  VStack,
  Text,
  IconButton,
  Badge,
  Tooltip,
  Spacer,
  useToast,
} from '@chakra-ui/react';
import { EditIcon, CheckCircleIcon } from '@chakra-ui/icons';

export default function AddressCard({
  address = {},
  isSelected = false,
  isDefault = false,
  onSelect = () => {},
  onEdit = () => {},
  showEdit = true,
  showDefaultTick = true,
  refreshAddresses, // optional callback to reload after setting default
}) {
  const toast = useToast();

  const handleDoubleClick = async () => {
    if (!address.id || !address.patient_id) return;
    const confirmMsg = `Set "${address.label || ''}" as the default address?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await fetch(`/api/patients/addresses/set_default`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: address.patient_id,
          address_id: address.id,
        }),
      });
      if (!res.ok) throw new Error('Failed to set default');
      toast({ title: 'Default address updated.', status: 'success', duration: 3000 });
      refreshAddresses?.(); // reload list if provided
    } catch (err) {
      toast({ title: 'Error setting default', description: err.message, status: 'error' });
    }
  };

  return (
    <Box
      px={2.5}
      py={2}
      minW="260px"
      maxW="720px"
      width="100%"
      borderRadius="md"
      border={isSelected ? '2px solid teal' : '1px solid #E2E8F0'}
      bg="white"
      boxShadow="base"
      cursor="pointer"
      position="relative"
      _hover={{ boxShadow: 'md', borderColor: 'teal.500' }}
      onClick={onSelect}
      onDoubleClick={handleDoubleClick} // 📌 double click handler
      transition=".15s"
    >
      <VStack align="start" spacing={1} w="100%">
        {/* Top row: Label + Area + Default tick */}
        <HStack w="100%" spacing={2} align="center">
          <Text fontWeight="bold" fontSize="md" isTruncated>
            {address.label || ''}
          </Text>
          <Text fontSize="xs" fontWeight="bold" color="gray.500" isTruncated>
            {address.area || 'Area'}
          </Text>
          {isDefault && showDefaultTick && (
            <Tooltip label="Default">
              <CheckCircleIcon color="green.400" boxSize={4} />
            </Tooltip>
          )}
        </HStack>

        {/* Second row: Address line */}
        <Text
          fontSize="sm"
          fontWeight="semibold"
          color="gray.800"
          noOfLines={1}
          isTruncated
          w="full"
        >
          {address.address_line || 'No address line'}
        </Text>

        {/* Third row: City, State, Country + Pincode */}
        {(address.city || address.state || address.country || address.pincode) && (
          <HStack w="100%" align="center">
            <Text
              fontSize="xs"
              color="gray.500"
              noOfLines={1}
              isTruncated
              flex="1"
            >
              {[address.city, address.state, address.country].filter(Boolean).join(', ')}
            </Text>
            {address.pincode && (
              <Badge
                borderRadius="full"
                colorScheme="blue"
                fontSize="xs"
                variant="solid"
                px={2}
                py="1px"
              >
                {address.pincode}
              </Badge>
            )}
          </HStack>
        )}
      </VStack>

      {/* Edit button */}
      {showEdit && (
        <Tooltip label="Edit">
          <IconButton
            icon={<EditIcon />}
            aria-label="Edit address"
            size="xs"
            variant="ghost"
            position="absolute"
            top="6px"
            right="6px"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(address);
            }}
          />
        </Tooltip>
      )}
    </Box>
  );
}
