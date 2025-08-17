// File: /app/components/DateSelector.js
"use client";

import React from "react";
import { Button, HStack, Input } from "@chakra-ui/react";
import dayjs from "dayjs";

export default function DateSelector({ date, setDate }) {
  const handlePrevDay = () => {
    const newDate = dayjs(date).subtract(1, "day").format("YYYY-MM-DD");
    setDate(newDate);
  };

  const handleNextDay = () => {
    const newDate = dayjs(date).add(1, "day").format("YYYY-MM-DD");
    setDate(newDate);
  };

  const handleDateChange = (e) => {
    setDate(e.target.value);
  };

  return (
    <HStack spacing={2} minW="180px" justify="center" px={1} py={0} width="100%">
      <Button size="sm" minWidth="60px" onClick={handlePrevDay} aria-label="Previous Day">
        &#8592;
      </Button>
      <Input
        type="date"
        value={date}
        onChange={handleDateChange}
        size="sm"
        max={dayjs().add(1, "year").format("YYYY-MM-DD")}
        min={dayjs().subtract(1, "year").format("YYYY-MM-DD")}
      />
      <Button size="sm" minWidth="60px" onClick={handleNextDay} aria-label="Next Day">
        &#8594;
      </Button>
    </HStack>
  );
}
