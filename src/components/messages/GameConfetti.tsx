import React, { useMemo } from 'react';
import { motion } from 'motion/react';

export const GameConfetti: React.FC = () => {
  const pieces = useMemo(() => Array.from({ length: 54 }, (_, index) => {
    const angle = (Math.random() * 140 - 70) * Math.PI / 180;
    const fallDistance = 90 + Math.random() * 35;
    const duration = 2.4 + Math.random() * 2.4;
    return {
      startX: Math.random() * 100,
      endX: Math.tan(angle) * fallDistance,
      fallDistance,
      duration,
      delay: Math.random() * 0.45,
      width: 4 + Math.round(Math.random() * 6),
      height: 7 + Math.round(Math.random() * 8),
      rotation: Math.round(Math.random() * 360),
      spin: (Math.random() > 0.5 ? 1 : -1) * (360 + Math.round(Math.random() * 1440)),
      color: index % 3 === 0 ? '#FFFFFF' : index % 3 === 1 ? '#0A84FF' : '#63B3FF',
    };
  }), []);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[12002] overflow-hidden">
      {pieces.map((piece, index) => (
        <motion.span
          key={index}
          initial={{ x: 0, y: -16, rotate: piece.rotation, opacity: 0 }}
          animate={{
            x: `${piece.endX}vw`,
            y: `${piece.fallDistance}vh`,
            rotate: piece.rotation + piece.spin,
            opacity: [0, 1, 1, 0],
          }}
          transition={{
            duration: piece.duration,
            delay: piece.delay,
            ease: 'linear',
            opacity: { duration: piece.duration, delay: piece.delay, times: [0, 0.08, 0.82, 1] },
          }}
          className="absolute top-0 rounded-sm will-change-transform"
          style={{
            left: `${piece.startX}vw`,
            width: piece.width,
            height: piece.height,
            backgroundColor: piece.color,
          }}
        />
      ))}
    </div>
  );
};
