import React, { useMemo } from 'react';
import { motion } from 'motion/react';

export const GameConfetti: React.FC = () => {
  const pieces = useMemo(() => Array.from({ length: 54 }, (_, index) => {
    const fromLeft = index % 2 === 0;
    return {
      fromLeft,
      target: 5 + Math.random() * 90,
      sway: (Math.random() - 0.5) * 18,
      delay: Math.random() * 0.65,
      duration: 3.6 + Math.random() * 2.2,
      width: 4 + Math.round(Math.random() * 6),
      height: 7 + Math.round(Math.random() * 8),
      rotation: Math.round(Math.random() * 180 - 90),
      spin: (Math.random() > 0.5 ? 1 : -1) * (360 + Math.round(Math.random() * 720)),
      fallDistance: 105 + Math.random() * 18,
      shape: Math.random() > 0.72 ? 'rounded-full' : 'rounded-[1px]',
      color: index % 3 === 0 ? '#FFFFFF' : index % 3 === 1 ? '#0A84FF' : '#63B3FF',
    };
  }), []);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[12002] overflow-hidden">
      {pieces.map((piece, index) => (
        <motion.span
          key={index}
          initial={{ x: 0, y: -24, rotate: piece.rotation, opacity: 0 }}
          animate={{
            x: piece.fromLeft
              ? [`${piece.target * 0.3}vw`, `${piece.target * 0.62 + piece.sway}vw`, `${piece.target - piece.sway * 0.4}vw`, `${piece.target + piece.sway}vw`]
              : [`-${(100 - piece.target) * 0.3}vw`, `-${(100 - piece.target) * 0.62 - piece.sway}vw`, `-${100 - piece.target + piece.sway * 0.4}vw`, `-${100 - piece.target - piece.sway}vw`],
            y: [-24, '28vh', '66vh', `${piece.fallDistance}vh`],
            rotate: [piece.rotation, piece.rotation + piece.spin * 0.25, piece.rotation + piece.spin * 0.65, piece.rotation + piece.spin],
            opacity: [0, 1, 1, 0],
          }}
          transition={{
            duration: piece.duration,
            delay: piece.delay,
            ease: [0.22, 0.68, 0.32, 1],
            opacity: { duration: piece.duration, delay: piece.delay, times: [0, 0.1, 0.78, 1] },
            x: { duration: piece.duration, delay: piece.delay, times: [0, 0.24, 0.62, 1], ease: 'easeInOut' },
            y: { duration: piece.duration, delay: piece.delay, times: [0, 0.22, 0.67, 1], ease: 'easeInOut' },
          }}
          className={`absolute top-0 ${piece.shape} will-change-transform`}
          style={{
            left: piece.fromLeft ? 0 : '100%',
            width: piece.width,
            height: piece.height,
            backgroundColor: piece.color,
          }}
        />
      ))}
    </div>
  );
};
