import React, { useMemo } from 'react';
import { motion } from 'motion/react';

export const GameConfetti: React.FC = () => {
  const pieces = useMemo(() => Array.from({ length: 54 }, (_, index) => {
    const fromLeft = index % 2 === 0;
    const rotation = Math.round(Math.random() * 360 - 180);
    const spread = 18 + Math.random() * 58;
    const startOffset = Math.random() * 14;
    return {
      fromLeft,
      delay: Math.random() * 0.55,
      duration: 3.1 + Math.random() * 2.1,
      size: 5 + Math.round(Math.random() * 6),
      rotation,
      spin: (Math.random() > 0.5 ? 1 : -1) * (220 + Math.round(Math.random() * 540)),
      startOffset,
      drift: (Math.random() - 0.5) * 16,
      destination: spread,
      fallDistance: 95 + Math.random() * 28,
      color: index % 3 === 0 ? '#FFFFFF' : index % 3 === 1 ? '#0A84FF' : '#63B3FF',
    };
  }), []);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[12002] overflow-hidden">
      {pieces.map((piece, index) => (
        <motion.span
          key={index}
          initial={{
            x: piece.fromLeft ? `${-piece.startOffset}vw` : `${piece.startOffset}vw`,
            y: -20,
            rotate: piece.rotation,
            opacity: 0,
          }}
          animate={{
            x: piece.fromLeft
              ? [`${-piece.startOffset}vw`, `${piece.destination * 0.38}vw`, `${piece.destination + piece.drift}vw`, `${piece.destination * 0.7 + piece.drift}vw`]
              : [`${piece.startOffset}vw`, `-${piece.destination * 0.38}vw`, `-${piece.destination - piece.drift}vw`, `-${piece.destination * 0.7 - piece.drift}vw`],
            y: [-20, '24vh', '61vh', `${piece.fallDistance}vh`],
            rotate: [piece.rotation, piece.rotation + piece.spin * 0.28, piece.rotation + piece.spin * 0.68, piece.rotation + piece.spin],
            opacity: [0, 1, 1, 0],
          }}
          transition={{
            duration: piece.duration,
            delay: piece.delay,
            ease: 'easeInOut',
            opacity: { duration: piece.duration, delay: piece.delay, times: [0, 0.12, 0.72, 1] },
            x: { duration: piece.duration, delay: piece.delay, times: [0, 0.28, 0.66, 1] },
            y: { duration: piece.duration, delay: piece.delay, times: [0, 0.24, 0.68, 1], ease: 'easeInOut' },
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
