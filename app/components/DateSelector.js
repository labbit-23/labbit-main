"use client";

import React, { useRef } from "react";
import { Box, Flex, Text, IconButton } from "@chakra-ui/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import dayjs from "dayjs";

const ACCENT = "rgba(138,107,163,";

/* compact=true  → inline desktop style, no gradients, tight sizing
   compact=false → full-width mobile style with purple gradient fades */
export default function DateSelector({ date, setDate, compact = false }) {
  const inputRef = useRef(null);

  const prev = () => setDate(dayjs(date).subtract(1, "day").format("YYYY-MM-DD"));
  const next = () => setDate(dayjs(date).add(1, "day").format("YYYY-MM-DD"));

  const d          = dayjs(date);
  const isToday    = date === dayjs().format("YYYY-MM-DD");
  const isTomorrow = date === dayjs().add(1, "day").format("YYYY-MM-DD");
  const label      = isToday ? "Today" : isTomorrow ? "Tomorrow" : d.format("D MMM");
  const sub        = isToday || isTomorrow ? d.format("ddd, D MMM") : d.format("dddd");

  if (compact) {
    return (
      <Flex align="center" gap={1} justify="center">
        <IconButton
          icon={<ChevronLeft size={16} />}
          onClick={prev}
          variant="ghost"
          size="sm"
          aria-label="Previous day"
          borderRadius="md"
        />

        <Box position="relative" textAlign="center" cursor="pointer" px={2} minW="90px">
          <Text fontWeight="600" fontSize="13px" lineHeight="1.3" color="inherit">
            {label}
          </Text>
          <Text fontSize="11px" opacity={0.55} lineHeight="1.2" color="inherit">
            {sub}
          </Text>
          <input
            ref={inputRef}
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            max={dayjs().add(1, "year").format("YYYY-MM-DD")}
            min={dayjs().subtract(1, "year").format("YYYY-MM-DD")}
            style={{
              position: "absolute", top: 0, left: 0,
              width: "100%", height: "100%",
              opacity: 0, cursor: "pointer",
            }}
          />
        </Box>

        <IconButton
          icon={<ChevronRight size={16} />}
          onClick={next}
          variant="ghost"
          size="sm"
          aria-label="Next day"
          borderRadius="md"
        />
      </Flex>
    );
  }

  return (
    <Flex align="center" w="100%">

      {/* ← Previous */}
      <Flex
        as="button"
        flex={1} h="44px"
        align="center" justify="flex-start"
        pl={4}
        bg={`linear-gradient(to right, ${ACCENT}0.22) 0%, ${ACCENT}0) 100%)`}
        borderWidth={0}
        cursor="pointer"
        userSelect="none"
        outline="none"
        transition="background 0.15s"
        onClick={prev}
        _active={{ bg: `linear-gradient(to right, ${ACCENT}0.38) 0%, ${ACCENT}0) 100%)` }}
        aria-label="Previous day"
      >
        <Text fontSize="26px" lineHeight="1" color={`${ACCENT}0.85)`} fontWeight="300">
          ‹
        </Text>
      </Flex>

      {/* Centre — tapping opens native date picker */}
      <Box position="relative" textAlign="center" cursor="pointer" px={3} flexShrink={0} minW="110px">
        <Text fontWeight="700" fontSize="15px" lineHeight="1.25" color="inherit">
          {label}
        </Text>
        <Text fontSize="11px" opacity={0.50} lineHeight="1.3" color="inherit">
          {sub}
        </Text>
        <input
          ref={inputRef}
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          max={dayjs().add(1, "year").format("YYYY-MM-DD")}
          min={dayjs().subtract(1, "year").format("YYYY-MM-DD")}
          style={{
            position: "absolute", top: 0, left: 0,
            width: "100%", height: "100%",
            opacity: 0, cursor: "pointer",
          }}
        />
      </Box>

      {/* → Next */}
      <Flex
        as="button"
        flex={1} h="44px"
        align="center" justify="flex-end"
        pr={4}
        bg={`linear-gradient(to left, ${ACCENT}0.22) 0%, ${ACCENT}0) 100%)`}
        borderWidth={0}
        cursor="pointer"
        userSelect="none"
        outline="none"
        transition="background 0.15s"
        onClick={next}
        _active={{ bg: `linear-gradient(to left, ${ACCENT}0.38) 0%, ${ACCENT}0) 100%)` }}
        aria-label="Next day"
      >
        <Text fontSize="26px" lineHeight="1" color={`${ACCENT}0.85)`} fontWeight="300">
          ›
        </Text>
      </Flex>

    </Flex>
  );
}
