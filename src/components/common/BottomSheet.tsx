import React, { useEffect, useRef, useState } from 'react';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  children,
}) => {
  const [isMounted, setIsMounted] = useState(isOpen);
  const [isClosing, setIsClosing] = useState(false);
  const [dragY, setDragY] = useState(0);
  const startYRef = useRef<number>(0);
  const isDraggingRef = useRef<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setIsMounted(true);
      setIsClosing(false);
      setDragY(0);
    } else if (isMounted) {
      setIsClosing(true);
      const timer = setTimeout(() => {
        setIsMounted(false);
        setIsClosing(false);
      }, 240);
      return () => clearTimeout(timer);
    }
  }, [isOpen, isMounted]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isMounted) return null;

  const handlePointerDown = (e: React.PointerEvent) => {
    startYRef.current = e.clientY;
    isDraggingRef.current = true;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const delta = e.clientY - startYRef.current;
    if (delta > 0) {
      setDragY(delta);
    }
  };

  const handlePointerUp = () => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    if (dragY > 75) {
      onClose();
    } else {
      setDragY(0);
    }
  };

  const sheetAnimationClass = isDraggingRef.current
    ? ''
    : isClosing
    ? 'animate-sheet-down'
    : 'animate-sheet-up';

  const backdropAnimationClass = isClosing ? 'animate-backdrop-out' : 'animate-backdrop-in';

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end select-none">
      {/* Dimmed backdrop with guaranteed smooth animation on first mount */}
      <div
        onClick={onClose}
        className={`fixed inset-0 bg-black/65 backdrop-blur-xs ${backdropAnimationClass}`}
      />

      {/* Sheet Content: ALWAYS smoothly slides up from the bottom */}
      <div
        role="dialog"
        aria-modal="true"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          transform: isDraggingRef.current ? `translateY(${dragY}px)` : undefined,
          transition: isDraggingRef.current ? 'none' : undefined,
          backdropFilter: 'blur(36px) saturate(200%)',
          WebkitBackdropFilter: 'blur(36px) saturate(200%)',
          backgroundColor: 'rgba(24, 24, 28, 0.94)',
        }}
        className={`relative z-10 w-full max-w-lg mx-auto border-t border-white/[0.14] rounded-t-[32px] pt-3.5 px-6 pb-7 shadow-[0_-16px_48px_rgba(0,0,0,0.7)] ${sheetAnimationClass}`}
      >
        {/* Grabber */}
        <div className="w-12 h-1.5 bg-white/30 rounded-full mx-auto mb-4 cursor-grab active:cursor-grabbing" />
        <div onPointerDown={(e) => e.stopPropagation()} className="pb-1">
          {children}
        </div>
      </div>
    </div>
  );
};
