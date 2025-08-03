// File: /app/components/PatientVisitCard.js
import { Box, Button, Text, Badge, VStack, HStack } from "@chakra-ui/react";

export default function PatientVisitCard({
  visit,
  isPast = false,
  isSelected = false,
  onSelect,
  openVisitModal,
}) {
  const statusColor =
    visit.status === "unassigned"
      ? "orange"
      : visit.status === "cancelled"
      ? "gray"
      : "teal";

  return (
    <Box
      p={4}
      bg={isPast ? "gray.100" : "white"}
      borderRadius="lg"
      boxShadow="sm"
      opacity={isPast ? 0.7 : 1}
      cursor="pointer"
      border={isSelected ? "2px solid teal" : "1px solid transparent"}
      onClick={() => onSelect && onSelect()}
      _hover={{ boxShadow: "md" }}
    >
      <VStack align="flex-start" spacing={1}>
        <HStack>
          <Text fontWeight="bold">
            {new Date(visit.visit_date).toLocaleDateString()}
          </Text>
          <Badge colorScheme={statusColor}>{visit.status}</Badge>
          {isPast && <Badge colorScheme="gray">Past</Badge>}
        </HStack>
        {visit.executive && visit.executive.name && (
          <Text fontSize="sm" color="gray.600">
            Assigned To: {visit.executive.name}{" "}
            {visit.executive.phone && `(${visit.executive.phone})`}
          </Text>
        )}
        <Text fontSize="sm">Address: {visit.address}</Text>
        {visit.time_slot && (
          <Text fontSize="sm" color="gray.500">
            Slot: {visit.time_slot.slot_name}
          </Text>
        )}
        {/* Common action buttons */}
        <HStack pt={2} spacing={2}>
          {!isPast && visit.status === "unassigned" && (
            <>
              <Button
                size="sm"
                colorScheme="orange"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  openVisitModal && openVisitModal();
                }}
              >
                Reschedule
              </Button>
              <Button size="sm" colorScheme="red" variant="ghost" onClick={(e) => e.stopPropagation()}>
                Cancel
              </Button>
            </>
          )}
          {isPast && (
            <Button
              size="sm"
              colorScheme="teal"
              variant="solid"
              onClick={(e) => {
                e.stopPropagation();
                openVisitModal && openVisitModal();
              }}
            >
              Re-book
            </Button>
          )}
          {!isPast && visit.executive && (
            <Button size="sm" colorScheme="blue" variant="outline" onClick={(e) => e.stopPropagation()}>
              Contact Phlebo
            </Button>
          )}
        </HStack>
      </VStack>
    </Box>
  );
}
