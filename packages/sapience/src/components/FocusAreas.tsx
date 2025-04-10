'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { FOCUS_AREAS } from '~/lib/constants/focusAreas';

// Create a component to render the SVG icon from the iconSvg string
const FocusAreaIcon = ({
  iconSvg,
  color,
}: {
  iconSvg: string;
  color: string;
}) => (
  <div
    className="rounded-full p-2.5 w-10 h-10 flex items-center justify-center"
    style={{ backgroundColor: `${color}25` }} // Using 25% opacity version of the color
  >
    <div
      className="w-5 h-5 flex items-center justify-center"
      style={{ color }}
      dangerouslySetInnerHTML={{ __html: iconSvg }}
    />
  </div>
);

// Duplicate the array to create a seamless loop
const extendedFocusAreas = [...FOCUS_AREAS, ...FOCUS_AREAS];

export default function TopicsOfInterest() {
  const carouselRef = useRef<HTMLDivElement>(null);
  const [isManualScrolling, setIsManualScrolling] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [position, setPosition] = useState(0);
  const animationRef = useRef<number | null>(null);

  const startAutoScroll = () => {
    const carousel = carouselRef.current;
    if (!carousel || isManualScrolling) return;

    const animate = () => {
      setPosition((prev) => {
        const newPosition = prev - 0.2; // Slow scroll speed

        // Reset position when first set of cards is out of view
        if (carousel && newPosition <= -carousel.scrollWidth / 2) {
          return 0;
        }

        return newPosition;
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);
  };

  const stopAutoScroll = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
  };

  // Handle mouse down event
  const handleMouseDown = (e: React.MouseEvent) => {
    stopAutoScroll();
    setIsManualScrolling(true);
    setStartX(e.pageX - (carouselRef.current?.offsetLeft || 0));
    setScrollLeft(position);
  };

  // Handle mouse leave event
  const handleMouseLeave = () => {
    if (isManualScrolling) {
      setIsManualScrolling(false);
      startAutoScroll();
    }
  };

  // Handle mouse up event
  const handleMouseUp = () => {
    setIsManualScrolling(false);
    startAutoScroll();
  };

  // Handle mouse move event
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isManualScrolling) return;
    e.preventDefault();

    const carousel = carouselRef.current;
    if (!carousel) return;

    const x = e.pageX - carousel.offsetLeft;
    const walk = (x - startX) * 1; // Scroll speed multiplier
    const newPosition = scrollLeft + walk;

    setPosition(newPosition);
  };

  // Apply position to carousel
  useEffect(() => {
    if (carouselRef.current) {
      carouselRef.current.style.transform = `translateX(${position}px)`;
    }
  }, [position]);

  // Start auto-scrolling on component mount
  useEffect(() => {
    startAutoScroll();

    return () => {
      stopAutoScroll();
    };
  }, [isManualScrolling]);

  return (
    <section className="pt-40 pb-24 px-8 overflow-hidden relative">
      <div className="container mx-auto">
        <div className="relative">
          {/* Gradient overlays for fade effect */}
          <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-background to-transparent z-10" />
          <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-background to-transparent z-10" />

          {/* Carousel container */}
          <div className="overflow-hidden">
            <div
              ref={carouselRef}
              className="flex gap-6 py-4 cursor-grab active:cursor-grabbing"
              style={{ width: 'fit-content' }}
              role="button"
              tabIndex={0}
              onMouseDown={handleMouseDown}
              onMouseLeave={handleMouseLeave}
              onMouseUp={handleMouseUp}
              onMouseMove={handleMouseMove}
            >
              {extendedFocusAreas.map((area, index) => (
                <Link
                  key={index}
                  href={`/forecasting?category=${area.id}`}
                  className="bg-background rounded-lg overflow-hidden shadow-sm border border-muted border-t-0 flex flex-col w-auto flex-shrink-0 hover:bg-muted/30 transition-colors"
                >
                  <div
                    className="h-1.5 w-full"
                    style={{ backgroundColor: area.color }}
                  />
                  <div className="flex items-center gap-4 px-6 py-4">
                    <FocusAreaIcon iconSvg={area.iconSvg} color={area.color} />
                    <h3 className="text-xl font-medium whitespace-nowrap">
                      {area.name}
                    </h3>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
