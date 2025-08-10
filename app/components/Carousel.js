// app/components/Carousel.js
"use client";

import { useRef } from "react";
import Slider from "react-slick";
import { IconButton, Box } from "@chakra-ui/react";
import { ChevronLeftIcon, ChevronRightIcon } from "@chakra-ui/icons";

export default function Carousel({ children, settings }) {
  const sliderRef = useRef(null);

  return (
    <Box position="relative" height="100%" width="100%">
      {/* Previous Button */}
      <IconButton
        aria-label="Previous Slide"
        icon={<ChevronLeftIcon />}
        position="absolute"
        left="-40px"
        top="50%"
        transform="translateY(-50%)"
        zIndex="docked"
        onClick={() => sliderRef.current?.slickPrev?.()}
        size="sm"
        colorScheme="teal"
        isRound
      />

      {/* Slick Slider */}
      <Slider ref={sliderRef} {...settings} style={{ height: "100%" }}>
        {children}
      </Slider>

      {/* Next Button */}
      <IconButton
        aria-label="Next Slide"
        icon={<ChevronRightIcon />}
        position="absolute"
        right="-40px"
        top="50%"
        transform="translateY(-50%)"
        zIndex="docked"
        onClick={() => sliderRef.current?.slickNext?.()}
        size="sm"
        colorScheme="teal"
        isRound
      />
    </Box>
  );
}