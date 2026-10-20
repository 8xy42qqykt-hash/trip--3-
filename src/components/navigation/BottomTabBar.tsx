import React, { useEffect, useState } from 'react';
import {
  PaperPlaneTilt,
  ShoppingCart,
  CalendarBlank,
  MapTrifold,
  Gear,
} from '@phosphor-icons/react';
import { useLanguage } from '../../context/LanguageContext';

export type TabKey = 'trips' | 'messages' | 'groceries' | 'schedule' | 'my_trip' | 'settings';

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
  const { t } = useLanguage();
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
    { key: 'messages', label: t('Messages'), Icon: PaperPlaneTilt },
    { key: 'groceries', label: t('Groceries'), Icon: ShoppingCart },
    { key: 'schedule', label: t('Plans'), Icon: CalendarBlank },
    { key: 'my_trip', label: t('My Trip'), Icon: MapTrifold },
    { key: 'settings', label: t('Settings'), Icon: Gear },
  ];

  return (
    <nav
      role="navigation"
      aria-label={t('Bottom Navigation')}
      className="fixed bottom-0 left-0 right-0 z-40 isolate select-none pointer-events-auto"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-12 bottom-0"
        style={{
          backgroundImage: 'linear-gradient(to top, #000000 0%, rgba(0, 0, 0, 0.94) 42%, rgba(0, 0, 0, 0) 100%)',
        }}
      />
      {/* Completely flush bar with pure black bg and no empty space under nav buttons */}
      <div className="relative z-10 max-w-lg mx-auto grid grid-cols-5 items-center px-1 pt-1 pb-0">
        {tabs.map(({ key, label, Icon }) => {
          const isActive = activeTab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChangeTab(key)}
              className="flex flex-col items-center justify-center py-0 min-h-[44px] w-full cursor-pointer active-press group"
            >
              <span className="relative">
                <Icon
                  size={23}
                  weight={isActive ? 'fill' : 'regular'}
                  className={`transition-colors duration-150 ${
                    isActive ? 'text-[#0A84FF]' : 'text-slate-400'
                  }`}
                />
              </span>
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
