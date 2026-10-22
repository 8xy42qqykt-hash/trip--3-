import React, { useMemo } from 'react';
import { motion } from 'motion/react';

export const GameConfetti: React.FC = () => {
  const pieces = useMemo(() => Array.from({ length: 42 }, (_, index) => ({
    left: `${(index * 37) % 100}%`,
    delay: (index % 9) * 0.11,
    duration: 2.5 + (index % 5) * 0.24,
    size: 5 + (index % 4) * 2,
    color: index % 3 === 0 ? '#FFFFFF' : index % 3 === 1 ? '#0A84FF' : '#63B3FF',
  })), []);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[12002] overflow-hidden">
      {pieces.map((piece, index) => (
        <motion.span
          key={index}
          initial={{ y: -20, rotate: 0, opacity: 0 }}
          animate={{ y: '110vh', rotate: 540, opacity: [0, 1, 1, 0] }}
          transition={{ duration: piece.duration, delay: piece.delay, ease: 'linear' }}
          className="absolute top-0 rounded-sm"
          style={{ left: piece.left, width: piece.size, height: piece.size * 1.6, backgroundColor: piece.color }}
        />
      ))}
    </div>
  );
};
