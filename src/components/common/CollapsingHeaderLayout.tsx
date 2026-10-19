import React, { useState, useRef } from 'react';
import { CaretLeft } from '@phosphor-icons/react';
import { useTrip } from '../../context/TripContext';

interface CollapsingHeaderLayoutProps {
  title: string;
  topBarLeft?: React.ReactNode;
  topBarRight?: React.ReactNode;
  headerSubContent?: React.ReactNode;
  children: React.ReactNode;
  showBackButton?: boolean;
}

export const CollapsingHeaderLayout: React.FC<CollapsingHeaderLayoutProps> = ({
  title,
  topBarLeft,
  topBarRight,
  headerSubContent,
  children,
  showBackButton = true,
}) => {
  const { exitTrip } = useTrip();
  const [isScrolled, setIsScrolled] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const st = e.currentTarget.scrollTop;
    if (st > 35 && !isScrolled) {
      setIsScrolled(true);
    } else if (st <= 35 && isScrolled) {
      setIsScrolled(false);
    }
  };

  return (
    <div className="relative flex flex-col h-full w-full max-w-lg mx-auto bg-black overflow-hidden select-none">
      {/* Sticky top bar */}
      <header
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          backgroundColor: '#000000',
          backdropFilter: isScrolled ? 'blur(28px) saturate(180%)' : 'none',
          WebkitBackdropFilter: isScrolled ? 'blur(28px) saturate(180%)' : 'none',
        }}
        className={`shrink-0 z-20 transition-all duration-200 ${
          isScrolled
            ? 'border-b border-white/[0.08]'
            : 'border-b border-transparent'
        }`}
      >
        <div className="h-12 px-4 flex items-center justify-between">
          <div className="w-24 flex items-center">
            {topBarLeft ? (
              topBarLeft
            ) : showBackButton ? (
              <button
                type="button"
                onClick={exitTrip}
                className="min-h-[44px] flex items-center gap-1 text-sm font-semibold text-[#0A84FF] active-press cursor-pointer py-1.5 pr-2 -ml-2"
                title="Exit to My Trips"
              >
                <CaretLeft size={18} weight="bold" />
                <span>Trips</span>
              </button>
            ) : null}
          </div>

          {/* Small Title on scroll */}
          <h2
            className={`text-base font-bold text-white transition-all duration-200 truncate ${
              isScrolled ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1.5 pointer-events-none'
            }`}
          >
            {title}
          </h2>

          <div className="w-24 flex items-center justify-end">
            {topBarRight}
          </div>
        </div>
      </header>

      {/* Main scroll area */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 w-full overflow-y-auto overflow-x-hidden"
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        {/* Large Title Section */}
        <div className="px-5 pt-3 pb-3">
          <h1 className="text-3xl font-extrabold tracking-tight text-white">
            {title}
          </h1>
          {headerSubContent && <div className="mt-2">{headerSubContent}</div>}
        </div>

        {/* Content with comfortable clearance above bottom nav bar */}
        <div className="px-5 pb-20">
          {children}
        </div>
      </div>
    </div>
  );
};
