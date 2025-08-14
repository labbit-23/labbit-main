// app/components/CompareModal.js
"use client";
import React from "react";
import {
  Modal, ModalOverlay, ModalContent, ModalHeader,
  ModalCloseButton, ModalBody, Table, Thead, Tbody,
  Tr, Th, Td, Box, Flex, Heading, Text
} from "@chakra-ui/react";
import { CheckIcon } from "@chakra-ui/icons";
import { testCategoryMap, categoryIconMap } from "@/lib/packages";

export default function CompareModal({ isOpen, onClose, compareMap }) {
  const variants = Object.values(compareMap);
  if (variants.length < 2) return null; // need at least two to compare

  // Build test list grouped by category
  const testsByCategory = {};
  variants.forEach(({ variant }) => {
    variant.tests.forEach(test => {
      const cat = testCategoryMap[test] || "Uncategorised";
      if (!testsByCategory[cat]) {
        testsByCategory[cat] = new Set();
      }
      testsByCategory[cat].add(test);
    });
  });

  // Convert Sets to sorted arrays
  Object.keys(testsByCategory).forEach(cat => {
    testsByCategory[cat] = Array.from(testsByCategory[cat]).sort();
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="6xl"
      scrollBehavior="inside"
      isCentered
    >
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Compare Packages</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Table size="sm"> {/* removed striped variant */}
            <Thead>
              <Tr>
                <Th>Test</Th>
                {variants.map(({ pkgName, variantName, variant }) => (
                  <Th key={`${pkgName}-${variantName}`} textAlign="center">
                    <Box>
                      <Text fontWeight="bold">
                        {pkgName} — {variantName}
                      </Text>
                      <Text color="#F46C3B" fontWeight="semibold" mt={1}>
                        ₹ {variant.price}
                      </Text>
                    </Box>
                  </Th>
                ))}
              </Tr>
            </Thead>

            <Tbody>
              {Object.entries(testsByCategory).map(([category, tests], groupIndex) => {
                // Alternate block shading per category
                const groupBg = groupIndex % 2 === 0 ? "white" : "gray.50";

                return (
                  <React.Fragment key={category}>
                    {/* Category header */}
                    <Tr bg={groupBg}>
                      <Td colSpan={variants.length + 1} fontWeight="bold">
                        <Flex align="center" gap={2}>
                          <Box fontSize="xl">
                            {categoryIconMap[category] || categoryIconMap["Uncategorised"]}
                          </Box>
                          <Heading size="sm">{category}</Heading>
                        </Flex>
                      </Td>
                    </Tr>

                    {/* Test rows */}
                    {tests.map(test => (
                      <Tr key={test} bg={groupBg}>
                        <Td>{test}</Td>
                        {variants.map(({ variant }) => (
                          <Td key={`${variant.name}-${test}`} textAlign="center">
                            {variant.tests.includes(test) && <CheckIcon color="teal.500" />}
                          </Td>
                        ))}
                      </Tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </Tbody>
          </Table>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
