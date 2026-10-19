import React, { useEffect, useRef, useState } from 'react';

interface CustomScrollAreaProps {
  children: React.ReactNode;
  className?: string;
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
}

export const CustomScrollArea: React.FC<CustomScrollAreaProps> = ({
  children,
  className = '',
  onScroll,
  scrollRef: externalRef,
}) => {
  const internalRef = useRef<HTMLDivElement>(null);
  const containerRef = externalRef || internalRef;
  const [thumbHeight, setThumbHeight] = useState(0);
  const [thumbTop, setThumbTop] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null);

  const updateThumb = () => {
    const el = containerRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight <= clientHeight) {
      setThumbHeight(0);
      return;
    }
    const calculatedHeight = Math.max((clientHeight / scrollHeight) * clientHeight, 28);
    const maxScrollTop = scrollHeight - clientHeight;
    const scrollRatio = maxScrollTop > 0 ? scrollTop / maxScrollTop : 0;
    const maxThumbTop = clientHeight - calculatedHeight;
    const calculatedTop = scrollRatio * maxThumbTop;

    setThumbHeight(calculatedHeight);
    setThumbTop(calculatedTop);
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    updateThumb();
    setIsScrolling(true);
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }
    hideTimerRef.current = setTimeout(() => {
      setIsScrolling(false);
    }, 800);
    if (onScroll) {
      onScroll(e);
    }
  };

  useEffect(() => {
    updateThumb();
    window.addEventListener('resize', updateThumb);
    return () => {
      window.removeEventListener('resize', updateThumb);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  return (
    <div className={`relative w-full h-full overflow-hidden ${className}`}>
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="w-full h-full overflow-y-auto overflow-x-hidden"
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        {children}
      </div>
      {thumbHeight > 0 && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-1 top-0 bottom-0 z-30"
          style={{ width: '3px' }}
        >
          <div
            className="w-full rounded-full transition-opacity duration-300"
            style={{
              height: `${thumbHeight}px`,
              transform: `translateY(${thumbTop}px)`,
              backgroundColor: 'rgba(150, 155, 165, 0.45)',
              opacity: isScrolling ? 1 : 0,
            }}
          />
        </div>
      )}
    </div>
  );
};
