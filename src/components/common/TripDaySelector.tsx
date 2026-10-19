import React, { useState } from 'react';
import { CaretDown, Check } from '@phosphor-icons/react';
import { formatDayShort, getDateLabel, getTripDaysList, isToday } from '../../utils/date';

interface TripDaySelectorProps {
  startDate: string;
  endDate: string;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  daysWithItems?: Set<string>;
}

export const TripDaySelector: React.FC<TripDaySelectorProps> = ({
  startDate,
  endDate,
  selectedDate,
  onSelectDate,
  daysWithItems = new Set(),
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const tripDays = getTripDaysList(startDate, endDate);
  const currentLabel = getDateLabel(selectedDate);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="min-h-[48px] px-3 -ml-2 rounded-[16px] hover:bg-white/5 flex items-center gap-2 text-lg font-bold text-white active-press cursor-pointer"
      >
        <span>{currentLabel}</span>
        <CaretDown
          size={16}
          weight="bold"
          className={`text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <>
          <div
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 z-40 bg-transparent"
          />
          <div
            style={{
              backdropFilter: 'blur(32px) saturate(190%)',
              WebkitBackdropFilter: 'blur(32px) saturate(190%)',
              backgroundColor: 'rgba(24, 24, 28, 0.92)',
            }}
            className="absolute left-0 top-full mt-1.5 z-50 w-64 max-h-80 overflow-y-auto border border-white/[0.12] rounded-[24px] p-2 shadow-[0_16px_40px_rgba(0,0,0,0.6)]"
          >
            {tripDays.map((day) => {
              const isSelected = day === selectedDate;
              const hasItems = daysWithItems.has(day);
              const label = isToday(day) ? `Today (${formatDayShort(day)})` : formatDayShort(day);

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => {
                    onSelectDate(day);
                    setIsOpen(false);
                  }}
                  className={`w-full min-h-[44px] px-3.5 rounded-[16px] flex items-center justify-between text-sm active-press cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-white/15 font-bold text-[#0A84FF]'
                      : 'text-slate-200 hover:bg-white/10'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span>{label}</span>
                    {hasItems && (
                      <span className="w-2 h-2 rounded-full bg-[#0A84FF]" />
                    )}
                  </div>
                  {isSelected && <Check size={16} weight="bold" className="text-[#0A84FF]" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
