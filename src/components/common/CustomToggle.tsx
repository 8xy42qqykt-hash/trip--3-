import React from 'react';

interface CustomToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
  label?: string;
}

export const CustomToggle: React.FC<CustomToggleProps> = ({
  checked,
  onChange,
  className = '',
  label,
}) => {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={`min-h-[48px] w-full flex items-center justify-between gap-4 cursor-pointer active-press bg-transparent select-none px-1 ${className}`}
    >
      {label && (
        <span className="text-[15px] font-medium text-white">
          {label}
        </span>
      )}
      <div
        className="w-13 h-7 rounded-full relative transition-colors duration-200 flex items-center px-0.5"
        style={{
          backgroundColor: checked ? '#0A84FF' : 'rgba(150, 155, 165, 0.3)',
        }}
      >
        <div
          className="w-6 h-6 rounded-full bg-white shadow-sm transition-transform duration-200"
          style={{
            transform: checked ? 'translateX(24px)' : 'translateX(0px)',
          }}
        />
      </div>
    </button>
  );
};
