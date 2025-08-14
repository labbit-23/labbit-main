// app/components/Carousel.js
"use client";
import { Box } from "@chakra-ui/react";
import MultiCarousel from "react-multi-carousel";
import "react-multi-carousel/lib/styles.css";

export default function Carousel({ children }) {
  const responsive = {
    desktop: {
      breakpoint: { max: 3000, min: 1024 },
      items: 3,
      slidesToSlide: 1,
    },
    tablet: {
      breakpoint: { max: 1024, min: 640 },
      items: 2,
      slidesToSlide: 1,
    },
    mobile: {
      breakpoint: { max: 640, min: 0 },
      items: 1,
      slidesToSlide: 1,
    },
  };

  return (
    <Box w="100%">
      <MultiCarousel
        responsive={responsive}
        arrows
        infinite
        autoPlay={false}
        keyBoardControl
        draggable
        swipeable
        showDots={false}
        containerClass="carousel-container"
        itemClass="px-2"
        removeArrowOnDeviceType={["mobile"]}
      >
        {children}
      </MultiCarousel>
    </Box>
  );
}
