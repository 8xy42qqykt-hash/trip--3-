import React, { useState, useRef } from 'react';
import { CaretLeft } from '@phosphor-icons/react';
import { useTrip } from '../../context/TripContext';
import { useLanguage } from '../../context/LanguageContext';
import { TripMemberStack } from './TripMemberStack';

interface CollapsingHeaderLayoutProps {
  title: string;
  topBarLeft?: React.ReactNode;
  topBarRight?: React.ReactNode;
  headerSubContent?: React.ReactNode;
  children: React.ReactNode;
  showBackButton?: boolean;
  showScrolledBorder?: boolean;
}

export const CollapsingHeaderLayout: React.FC<CollapsingHeaderLayoutProps> = ({
  title,
  topBarLeft,
  topBarRight,
  headerSubContent,
  children,
  showBackButton = false,
  showScrolledBorder = true,
}) => {
  const { t } = useLanguage();
  const { exitTrip, tripMembers } = useTrip();
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
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
        className="absolute inset-x-0 top-0 isolate z-20"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -top-8 -bottom-16"
          style={{
            backgroundImage: 'linear-gradient(to bottom, rgba(0,0,0,0.98) 0%, rgba(0,0,0,0.94) 36%, rgba(0,0,0,0.72) 62%, rgba(0,0,0,0) 100%)',
          }}
        />
        <div className={`relative z-10 h-12 px-4 flex items-center justify-between transition-all duration-200 ${
          showScrolledBorder && isScrolled ? 'border-b border-white/[0.08]' : 'border-b border-transparent'
        }`}>
          <div className="w-24 flex items-center">
            {topBarLeft ? (
              topBarLeft
            ) : showBackButton ? (
              <button
                type="button"
                onClick={exitTrip}
                className="min-h-[44px] flex items-center gap-1 text-sm font-semibold text-[#0A84FF] active-press cursor-pointer py-1.5 pr-2 -ml-2"
                title={t('Exit to My Trips')}
              >
                <CaretLeft size={18} weight="bold" />
                <span>{t('Trips')}</span>
              </button>
            ) : null}
          </div>

          {/* Small Title on scroll */}
          <div
            className="absolute left-1/2 flex max-w-[calc(100%-12rem)] -translate-x-1/2 items-center gap-1"
          >
            <h2 className={`truncate text-center text-base font-bold text-white transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              isScrolled ? 'translate-y-0 opacity-100' : 'pointer-events-none absolute -translate-y-2 opacity-0'
            }`}>
              {title}
            </h2>
            <TripMemberStack members={tripMembers} />
          </div>

          <div className="w-24 flex items-center justify-end">
            {topBarRight}
          </div>
        </div>
      </header>

      {/* Main scroll area */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="absolute inset-0 w-full overflow-y-auto overflow-x-hidden"
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        <div aria-hidden="true" className="h-[calc(env(safe-area-inset-top,0px)+3rem)]" />
        {/* Large Title Section */}
        <div className="px-5 pt-3 pb-3">
          <h1 className={`origin-center text-center text-3xl font-extrabold tracking-tight text-white transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            isScrolled ? 'pointer-events-none -translate-y-3 scale-[0.96] opacity-0' : 'translate-y-0 scale-100 opacity-100'
          }`}>
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
