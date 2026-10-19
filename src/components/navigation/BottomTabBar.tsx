import React, { useEffect, useState } from 'react';
import {
  PaperPlaneTilt,
  ShoppingCart,
  ForkKnife,
  CalendarBlank,
  Gear,
} from '@phosphor-icons/react';

export type TabKey = 'messages' | 'groceries' | 'meals' | 'schedule' | 'settings';

interface BottomTabBarProps {
  activeTab: TabKey;
  onChangeTab: (tab: TabKey) => void;
  isHidden?: boolean;
  hidden?: boolean;
}

export const BottomTabBar: React.FC<BottomTabBarProps> = ({
  activeTab,
  onChangeTab,
  isHidden = false,
  hidden = false,
}) => {
  // Listen directly to keyboard/input-focus events to guarantee closing on every device immediately
  const [eventHidden, setEventHidden] = useState(false);

  useEffect(() => {
    const handleKbToggle = (e: any) => {
      const open = Boolean(e?.detail?.isOpen);
      setEventHidden(open);
    };

    window.addEventListener('trip:keyboard-toggle', handleKbToggle);
    return () => {
      window.removeEventListener('trip:keyboard-toggle', handleKbToggle);
    };
  }, []);

  if (isHidden || hidden || eventHidden) {
    return null;
  }

  const tabs: { key: TabKey; label: string; Icon: React.ComponentType<any> }[] = [
    { key: 'messages', label: 'Messages', Icon: PaperPlaneTilt },
    { key: 'groceries', label: 'Groceries', Icon: ShoppingCart },
    { key: 'meals', label: 'Meals', Icon: ForkKnife },
    { key: 'schedule', label: 'Schedule', Icon: CalendarBlank },
    { key: 'settings', label: 'Settings', Icon: Gear },
  ];

  return (
    <nav
      role="navigation"
      aria-label="Bottom Navigation"
      style={{
        backgroundColor: '#000000',
      }}
      className="fixed bottom-0 left-0 right-0 z-40 bg-black select-none pointer-events-auto"
    >
      {/* Completely flush bar with pure black bg and no empty space under nav buttons */}
      <div className="max-w-lg mx-auto grid grid-cols-5 items-center px-1 pt-1 pb-1.5">
        {tabs.map(({ key, label, Icon }) => {
          const isActive = activeTab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChangeTab(key)}
              className="flex flex-col items-center justify-center py-1 min-h-[44px] w-full cursor-pointer active-press group"
            >
              <Icon
                size={25}
                weight={isActive ? 'fill' : 'regular'}
                className={`transition-colors duration-150 ${
                  isActive ? 'text-[#0A84FF]' : 'text-slate-400'
                }`}
              />
              <span
                className={`text-[11px] tracking-tight mt-0.5 transition-colors duration-150 ${
                  isActive ? 'text-[#0A84FF] font-bold' : 'text-slate-400 font-medium'
                }`}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
