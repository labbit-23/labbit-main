"use client";

import React, { useEffect } from "react";
import { VStack, FormControl, FormLabel, Select, Input, Spinner } from "@chakra-ui/react";
import { supabase } from "../../lib/supabaseClient"; // <--- update the path if needed


export default function VisitScheduler({
  visitDate,
  setVisitDate,
  timeSlots,
  setTimeSlots,
  selectedSlotId,
  setSelectedSlotId,
  loading,
}) {
  useEffect(() => {
    async function fetchSlots() {
      const { data, error } = await supabase
        .from("visit_time_slots")
        .select("*")
        .order("start_time");
      if (!error) {
        setTimeSlots(data || []);
      }
    }
    fetchSlots();
  }, [setTimeSlots]);

  return (
    <VStack align="stretch" spacing={4}>
      <FormControl isRequired>
        <FormLabel>Visit Date</FormLabel>
        <Input
          type="date"
          value={visitDate}
          onChange={(e) => setVisitDate(e.target.value)}
          min={new Date().toISOString().slice(0, 10)}
          isDisabled={loading}
          aria-label="Visit date"
        />
      </FormControl>

      <FormControl isRequired>
        <FormLabel>Time Slot</FormLabel>
        {timeSlots.length === 0 ? (
          <Spinner size="sm" />
        ) : (
          <Select
            placeholder="Select a time slot"
            value={selectedSlotId}
            onChange={(e) => setSelectedSlotId(e.target.value)}
            isDisabled={loading}
            aria-label="Visit time slot"
          >
            {timeSlots.map(({ id, slot_name, start_time, end_time }) => (
              <option key={id} value={id}>
                {slot_name} ({start_time} - {end_time})
              </option>
            ))}
          </Select>
        )}
      </FormControl>
    </VStack>
  );
}
