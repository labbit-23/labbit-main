// File: /app/components/DateSelector.js
"use client";

import React from "react";
import { Button, HStack, IconButton, Input } from "@chakra-ui/react";
import { FiCalendar } from "react-icons/fi";
import dayjs from "dayjs";

export default function DateSelector({ date, setDate }) {
  const inputRef = React.useRef(null);

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

  const openCalendar = () => {
    const el = inputRef.current;
    if (!el) return;
    try {
      if (typeof el.showPicker === "function") {
        el.showPicker();
        return;
      }
    } catch {}
    el.focus();
    el.click();
  };

  return (
    <HStack spacing={2} minW="250px" justify="center" px={1} py={0} width="100%">
      <Button size="sm" minWidth="60px" onClick={handlePrevDay} aria-label="Previous Day">
        &#8592;
      </Button>
      <Input
        ref={inputRef}
        type="date"
        value={date}
        onChange={handleDateChange}
        size="sm"
        minW="145px"
        max={dayjs().add(1, "year").format("YYYY-MM-DD")}
        min={dayjs().subtract(1, "year").format("YYYY-MM-DD")}
      />
      <IconButton
        size="sm"
        aria-label="Open date picker"
        icon={<FiCalendar />}
        onClick={openCalendar}
        variant="outline"
      />
      <Button size="sm" minWidth="60px" onClick={handleNextDay} aria-label="Next Day">
        &#8594;
      </Button>
    </HStack>
  );
}
