// File: /app/components/DateSelector.js
"use client";

import React from "react";
import { Button, HStack, Text } from "@chakra-ui/react";

export default function DateSelector({ date, setDate }) {
  const dateObj = new Date(date);

  const formatDate = (d) => d.toISOString().slice(0, 10);

  const goPrevDay = () => {
    const prev = new Date(dateObj);
    prev.setDate(prev.getDate() - 1);
    setDate(formatDate(prev));
  };

  const goNextDay = () => {
    const next = new Date(dateObj);
    next.setDate(next.getDate() + 1);
    setDate(formatDate(next));
  };

  return (
    <HStack
      spacing={2}
      minW="152px"
      maxW="290px"
      justify="center"
      px={1}
      py={0}
      width="100%"
    >
      <Button
        size={{ base: "sm", md: "md" }}
        minW="34px"
        px={0}
        onClick={goPrevDay}
        aria-label="Previous Day"
      >
        &#8592;
      </Button>
      <Text
        minW="80px"
        maxW="120px"
        px={1}
        textAlign="center"
        fontWeight="medium"
        fontSize={{ base: "sm", md: "md" }}
        whiteSpace="nowrap"
        overflow="hidden"
        textOverflow="ellipsis"
      >
        {date}
      </Text>
      <Button
        size={{ base: "sm", md: "md" }}
        minW="34px"
        px={0}
        onClick={goNextDay}
        aria-label="Next Day"
      >
        &#8594;
      </Button>
    </HStack>
  );
}
