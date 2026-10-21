import React from 'react';

export interface ChatSticker {
  id: string;
  name: string;
  face: string;
  mouth: string;
  accent?: string;
}

export const CHAT_STICKERS: ChatSticker[] = [
  { id: 'happy', name: 'Happy', face: '#FFD45E', mouth: 'M38 59 Q50 73 62 59', accent: 'heart' },
  { id: 'laughing', name: 'Laughing', face: '#FFC857', mouth: 'M36 57 Q50 76 64 57', accent: 'laugh' },
  { id: 'love', name: 'In love', face: '#FF91A4', mouth: 'M41 62 Q50 69 59 62', accent: 'hearts' },
  { id: 'surprised', name: 'Surprised', face: '#8ED8FF', mouth: 'M50 57 C41 57 41 73 50 73 C59 73 59 57 50 57Z', accent: 'surprise' },
  { id: 'silly', name: 'Silly', face: '#B5E986', mouth: 'M38 59 Q50 65 62 59 Q58 73 46 70 Q40 68 38 59Z', accent: 'silly' },
  { id: 'sleepy', name: 'Sleepy', face: '#C6B5FF', mouth: 'M43 64 Q50 68 57 64', accent: 'sleep' },
  { id: 'crying', name: 'Crying', face: '#91C9FF', mouth: 'M40 70 Q50 58 60 70', accent: 'tears' },
  { id: 'cool', name: 'Cool', face: '#FFB86B', mouth: 'M42 63 Q50 69 58 63', accent: 'cool' },
];

interface StickerArtworkProps {
  stickerId: string;
  size?: number;
  className?: string;
}

export const StickerArtwork: React.FC<StickerArtworkProps> = ({
  stickerId,
  size = 112,
  className = '',
}) => {
  const sticker = CHAT_STICKERS.find((item) => item.id === stickerId) || CHAT_STICKERS[0];
  const isSleepy = sticker.id === 'sleepy';
  const isCool = sticker.id === 'cool';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={sticker.name}
      className={`chat-sticker-art ${className}`}
    >
      {sticker.accent === 'hearts' && (
        <>
          <path className="sticker-float sticker-heart-one" d="M18 24 C12 18 4 27 18 37 C32 27 24 18 18 24Z" fill="#FF5C83" />
          <path className="sticker-float sticker-heart-two" d="M83 27 C78 22 72 29 83 37 C94 29 88 22 83 27Z" fill="#FF5C83" />
        </>
      )}
      {sticker.accent === 'heart' && (
        <path className="sticker-float sticker-heart-one" d="M82 24 C76 18 68 27 82 37 C96 27 88 18 82 24Z" fill="#FF5C83" />
      )}

      <circle cx="50" cy="50" r="39" fill={sticker.face} />

      {isCool ? (
        <g className="sticker-sunglasses">
          <rect x="23" y="34" width="23" height="15" rx="6" fill="#242333" />
          <rect x="54" y="34" width="23" height="15" rx="6" fill="#242333" />
          <path d="M46 40 Q50 36 54 40" fill="none" stroke="#242333" strokeWidth="4" strokeLinecap="round" />
          <path d="M27 37 L37 37 M58 37 L68 37" stroke="#fff" strokeOpacity=".7" strokeWidth="2" strokeLinecap="round" />
        </g>
      ) : isSleepy ? (
        <>
          <path d="M29 42 Q37 48 45 42" fill="none" stroke="#382F4D" strokeWidth="4" strokeLinecap="round" />
          <path d="M55 42 Q63 48 71 42" fill="none" stroke="#382F4D" strokeWidth="4" strokeLinecap="round" />
        </>
      ) : (
        <>
          <ellipse cx="37" cy="40" rx="7" ry="9" fill="#fff" />
          <ellipse cx="63" cy="40" rx="7" ry="9" fill="#fff" />
          <g className={`sticker-pupils ${sticker.id === 'surprised' ? 'sticker-pupils-wide' : ''}`}>
            <ellipse cx="38" cy="42" rx="3.5" ry="5" fill="#29263A" />
            <ellipse cx="64" cy="42" rx="3.5" ry="5" fill="#29263A" />
            <circle cx="39.5" cy="39.5" r="1.4" fill="#fff" />
            <circle cx="65.5" cy="39.5" r="1.4" fill="#fff" />
          </g>
        </>
      )}

      {sticker.id === 'surprised' && (
        <path d="M50 25 L50 20 M76 32 L80 28 M24 32 L20 28" stroke="#382F4D" strokeWidth="3" strokeLinecap="round" />
      )}
      {sticker.id === 'happy' && (
        <path d="M28 54 Q32 59 36 54 M64 54 Q68 59 72 54" fill="none" stroke="#F28B82" strokeWidth="3" strokeLinecap="round" />
      )}
      {sticker.id === 'love' && (
        <path d="M34 53 Q38 49 42 53 M58 53 Q62 49 66 53" fill="none" stroke="#F05D78" strokeWidth="3" strokeLinecap="round" />
      )}
      {sticker.accent === 'tears' && (
        <>
          <path className="sticker-tear" d="M29 53 C25 61 26 67 31 67 C36 67 36 61 29 53Z" fill="#258FE5" />
          <path className="sticker-tear sticker-tear-late" d="M71 53 C67 61 68 67 73 67 C78 67 78 61 71 53Z" fill="#258FE5" />
        </>
      )}

      {sticker.id === 'laughing' ? (
        <>
          <path d="M36 57 L64 57 Q62 76 50 76 Q38 76 36 57Z" fill="#382F4D" />
          <path d="M43 65 Q50 61 57 65 L55 71 Q50 75 45 71Z" fill="#FF7185" />
        </>
      ) : (
        <path
          d={sticker.mouth}
          fill={sticker.id === 'surprised' || sticker.id === 'silly' ? '#382F4D' : 'none'}
          stroke="#382F4D"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {sticker.id === 'silly' && <path d="M51 64 Q62 60 61 69 Q57 75 51 69Z" fill="#FF7FA2" />}
      {sticker.accent === 'sleep' && (
        <g className="sticker-z">
          <text x="75" y="30" fill="#fff" fontSize="12" fontWeight="800">z</text>
          <text x="84" y="19" fill="#fff" fontSize="9" fontWeight="800">z</text>
        </g>
      )}
    </svg>
  );
};
