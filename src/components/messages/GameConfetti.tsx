import React, { useMemo } from 'react';
import { motion } from 'motion/react';

export const GameConfetti: React.FC = () => {
  const pieces = useMemo(() => Array.from({ length: 48 }, (_, index) => {
    const fromLeft = index % 2 === 0;
    const rotation = Math.round(Math.random() * 720 - 360);
    return {
      fromLeft,
      delay: Math.random() * 0.18,
      duration: 1.35 + Math.random() * 0.5,
      size: 5 + Math.round(Math.random() * 6),
      rotation,
      spin: (Math.random() > 0.5 ? 1 : -1) * (360 + Math.round(Math.random() * 540)),
      destination: 40 + Math.random() * 20,
      color: index % 3 === 0 ? '#FFFFFF' : index % 3 === 1 ? '#0A84FF' : '#63B3FF',
    };
  }), []);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[12002] overflow-hidden">
      {pieces.map((piece, index) => (
        <motion.span
          key={index}
          initial={{
            x: piece.fromLeft ? '-8vw' : '8vw',
            y: -20,
            rotate: piece.rotation,
            opacity: 0,
          }}
          animate={{
            x: piece.fromLeft ? `${piece.destination}vw` : `-${piece.destination}vw`,
            y: '72vh',
            rotate: piece.rotation + piece.spin,
            opacity: [0, 1, 1, 0],
          }}
          transition={{
            duration: piece.duration,
            delay: piece.delay,
            ease: [0.16, 1, 0.3, 1],
            opacity: { duration: piece.duration, delay: piece.delay, times: [0, 0.12, 0.72, 1] },
          }}
          className="absolute top-0 rounded-sm will-change-transform"
          style={{
            left: piece.fromLeft ? 0 : '100%',
            width: piece.size,
            height: piece.size * 1.6,
            backgroundColor: piece.color,
          }}
        />
      ))}
    </div>
  );
};
