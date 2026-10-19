import React from 'react';

interface CustomCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
  size?: number;
}

export const CustomCheckbox: React.FC<CustomCheckboxProps> = ({
  checked,
  onChange,
  className = '',
  size = 24,
}) => {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={`min-w-[48px] min-h-[48px] flex items-center justify-center active-press cursor-pointer bg-transparent select-none ${className}`}
    >
      <div
        className="flex items-center justify-center rounded-full transition-all duration-200"
        style={{
          width: `${size}px`,
          height: `${size}px`,
          backgroundColor: checked ? '#0A84FF' : 'transparent',
          boxShadow: checked ? 'none' : 'inset 0 0 0 2px rgba(150, 155, 165, 0.5)',
          transform: checked ? 'scale(1.05)' : 'scale(1)',
        }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-4 h-4 transition-all duration-200"
          style={{
            strokeDasharray: 24,
            strokeDashoffset: checked ? 0 : 24,
            opacity: checked ? 1 : 0,
            transform: checked ? 'scale(1)' : 'scale(0.6)',
          }}
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
    </button>
  );
};
