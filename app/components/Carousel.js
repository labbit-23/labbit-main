// app/components/Carousel.js
"use client";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";

import { useRef } from "react";
import Slider from "react-slick";
import { IconButton, Box } from "@chakra-ui/react";
import { ChevronLeftIcon, ChevronRightIcon } from "@chakra-ui/icons";

export default function Carousel({ children, settings, minHeight = "380px", showArrows = true }) {
  const sliderRef = useRef(null);

  return (
    <Box position="relative" width="100%">
      {showArrows && (
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
      )}

      <Slider ref={sliderRef} {...settings}>
        {Array.isArray(children)
          ? children.map((child, idx) => (
              <Box key={idx} minH={minHeight}>
                {child}
              </Box>
            ))
          : children}
      </Slider>

      {showArrows && (
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
      )}
    </Box>
  );
}
