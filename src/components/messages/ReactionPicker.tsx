import React, { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import {
  Heart,
  ThumbsUp,
  ThumbsDown,
  Smiley,
  HandsClapping,
  Question,
  ArrowBendUpLeft,
  Copy,
  Trash,
  PencilSimple,
  CookingPot,
  HandHeart,
} from '@phosphor-icons/react';
import { Message, Reaction } from '../../types';
import { useLanguage } from '../../context/LanguageContext';

interface ReactionPickerProps {
  message: Message;
  isOwnMessage: boolean;
  bubbleRect: DOMRect | null;
  bubbleElement: HTMLElement | null;
  currentReaction?: Reaction['kind'] | null;
  onReact: (kind: Reaction['kind']) => void;
  onReply: () => void;
  onCopy: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  onAction?: (action: 'Cook' | 'Contribute') => void;
  onClose: () => void;
}

const REACTION_ICONS: { kind: Reaction['kind']; Icon: React.ComponentType<any> }[] = [
  { kind: 'Heart', Icon: Heart },
  { kind: 'ThumbsUp', Icon: ThumbsUp },
  { kind: 'ThumbsDown', Icon: ThumbsDown },
  { kind: 'Smiley', Icon: Smiley },
  { kind: 'HandsClapping', Icon: HandsClapping },
  { kind: 'Question', Icon: Question },
];

export const ReactionPicker: React.FC<ReactionPickerProps> = ({
  message,
  isOwnMessage,
  bubbleRect,
  bubbleElement,
  currentReaction,
  onReact,
  onReply,
  onCopy,
  onDelete,
  onEdit,
  onAction,
  onClose,
}) => {
  const { t } = useLanguage();
  const liftedBubbleRef = useRef<HTMLDivElement>(null);

  const windowH = typeof window !== 'undefined' ? window.innerHeight : 800;
  const windowW = typeof window !== 'undefined' ? window.innerWidth : 400;

  const reactionBarHeight = 52;
  const reactionBarWidth = 276;
  const gap = 12;
  const menuHeight = 104 + (onEdit ? 44 : 0) + (onAction ? 44 : 0) + (isOwnMessage && onDelete ? 44 : 0);
  const menuWidth = 216;

  // Top and bottom clearance from header and the live composer controls.
  const topMargin = 124;
  const bottomMargin = 96;

  // Find container boundaries (e.g. max-w-lg chat container) so elements NEVER open outside the screen on the right
  const chatContainer = typeof document !== 'undefined'
    ? (document.querySelector('main') || document.body)
    : null;
  const chatRect = chatContainer ? chatContainer.getBoundingClientRect() : null;
  const containerLeft = chatRect ? Math.max(12, chatRect.left + 12) : 12;
  const containerRight = chatRect ? Math.min(windowW - 12, chatRect.right - 12) : windowW - 12;
  const maxAvailableWidth = Math.max(220, containerRight - containerLeft);

  const bubbleHeight = bubbleRect ? bubbleRect.height : 56;
  // Use unscaled layout width, clamped to screen max
  const bubbleWidth = bubbleRect ? Math.min(maxAvailableWidth, Math.ceil(bubbleRect.width)) : 220;
  const originalBubbleTop = bubbleRect ? bubbleRect.top : (windowH - bubbleHeight) / 2;

  const clearanceElements = typeof document !== 'undefined'
    ? Array.from(document.querySelectorAll<HTMLElement>('[data-reaction-clearance]'))
    : [];
  const composerTop = clearanceElements.reduce((top, element) => {
    const rect = element.getBoundingClientRect();
    return rect.height > 0 ? Math.min(top, rect.top) : top;
  }, windowH - bottomMargin);
  const availableBottom = Math.max(0, Math.min(windowH - bottomMargin, composerTop - gap));

  const minBubbleTop = topMargin + reactionBarHeight + gap;
  const maxBubbleTop = Math.max(minBubbleTop, availableBottom - menuHeight - gap - bubbleHeight);

  let targetBubbleTop = originalBubbleTop;
  if (targetBubbleTop < minBubbleTop) {
    targetBubbleTop = minBubbleTop;
  }
  if (targetBubbleTop > maxBubbleTop) {
    targetBubbleTop = maxBubbleTop;
  }

  // Clamp bubble horizontally strictly within [containerLeft, containerRight - bubbleWidth]
  const originalBubbleLeft = bubbleRect ? bubbleRect.left : (containerLeft + containerRight - bubbleWidth) / 2;
  const targetBubbleLeft = Math.max(containerLeft, Math.min(containerRight - bubbleWidth, originalBubbleLeft));

  // Position reaction bar: aligned near the bubble, strictly clamped so it NEVER hangs outside screen on the right
  const actualBarWidth = Math.min(reactionBarWidth, maxAvailableWidth);
  let reactionBarLeft = isOwnMessage
    ? targetBubbleLeft + bubbleWidth - actualBarWidth
    : targetBubbleLeft;
  reactionBarLeft = Math.max(containerLeft, Math.min(containerRight - actualBarWidth, reactionBarLeft));
  const reactionBarTop = targetBubbleTop - reactionBarHeight - gap;

  // Position action menu: aligned near bubble, strictly clamped so it NEVER hangs outside screen on the right
  const actualMenuWidth = Math.min(menuWidth, maxAvailableWidth);
  let actionMenuLeft = isOwnMessage
    ? targetBubbleLeft + bubbleWidth - actualMenuWidth
    : targetBubbleLeft;
  actionMenuLeft = Math.max(containerLeft, Math.min(containerRight - actualMenuWidth, actionMenuLeft));
  const actionMenuTop = targetBubbleTop + bubbleHeight + gap;

  useLayoutEffect(() => {
    const container = liftedBubbleRef.current;
    if (!container || !bubbleElement) return;
    const clone = bubbleElement.cloneNode(true);
    if (!(clone instanceof HTMLElement)) return;
    clone.style.width = '100%';
    clone.style.maxWidth = 'none';
    clone.style.maxHeight = 'none';
    clone.style.overflow = 'visible';
    clone.style.pointerEvents = 'none';
    container.replaceChildren(clone);
  }, [bubbleElement, message.id]);

  const content = (
    <div className="fixed inset-0 z-[12010] select-none">
      {/* Blurred & dimmed backdrop */}
      <motion.div
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        style={{
          top: 0,
          backdropFilter: 'blur(28px) saturate(180%)',
          WebkitBackdropFilter: 'blur(28px) saturate(180%)',
          backgroundImage: 'linear-gradient(to bottom, rgba(0, 0, 0, 0.08) 0%, rgba(0, 0, 0, 0.08) 48%, rgba(0, 0, 0, 0.94) 100%)',
        }}
        className="fixed inset-0"
      />

      {/* Floating container with smooth slide */}
      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 360, damping: 30 }}
        style={{
          transform: 'translateY(0)',
          transition: 'transform 260ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        className="fixed inset-0 pointer-events-none z-[9999]"
      >
        {/* Reaction Bar: Clamped strictly within screen boundaries */}
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 360, damping: 30 }}
          style={{
            top: `${reactionBarTop}px`,
            left: `${reactionBarLeft}px`,
            width: `${actualBarWidth}px`,
            backdropFilter: 'blur(32px) saturate(190%)',
            WebkitBackdropFilter: 'blur(32px) saturate(190%)',
            backgroundColor: 'rgba(28, 28, 32, 0.94)',
          }}
          className="absolute h-13 px-3 flex items-center justify-between border border-white/[0.14] rounded-full shadow-[0_12px_40px_rgba(0,0,0,0.6)] pointer-events-auto animate-pop-in"
        >
          {REACTION_ICONS.map(({ kind, Icon }) => {
            const isSelected = currentReaction === kind;
            return (
              <button
                key={kind}
                type="button"
                onClick={() => {
                  onReact(kind);
                  onClose();
                }}
                className={`w-9 h-9 rounded-full flex items-center justify-center cursor-pointer transition-all duration-150 active:scale-125 ${
                  isSelected
                    ? 'bg-[#0A84FF] text-white scale-110 shadow-sm'
                    : 'text-slate-200 hover:scale-115 active:scale-90 hover:bg-white/10'
                }`}
              >
                <Icon size={20} weight={isSelected ? 'fill' : 'regular'} />
              </button>
            );
          })}
        </motion.div>

        {/* Clone the rendered bubble so every message type keeps its exact chat appearance. */}
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 360, damping: 30 }}
          style={{
            top: `${targetBubbleTop}px`,
            left: `${targetBubbleLeft}px`,
            width: `${bubbleWidth}px`,
            boxSizing: 'border-box',
          }}
          className="absolute pointer-events-none"
        >
          <div ref={liftedBubbleRef} className="w-full" />
        </motion.div>

        {/* Action Menu: Clamped strictly within screen boundaries */}
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 360, damping: 30, delay: 0.025 }}
          style={{
            top: `${actionMenuTop}px`,
            left: `${actionMenuLeft}px`,
            width: `${actualMenuWidth}px`,
            backdropFilter: 'blur(32px) saturate(190%)',
            WebkitBackdropFilter: 'blur(32px) saturate(190%)',
            backgroundColor: 'rgba(28, 28, 32, 0.94)',
          }}
          className="absolute border border-white/[0.14] rounded-[22px] p-2 shadow-[0_16px_48px_rgba(0,0,0,0.6)] flex flex-col pointer-events-auto"
        >
          <button
            type="button"
            onClick={() => {
              onReply();
              onClose();
            }}
            className="w-full h-11 px-4 flex items-center justify-between text-sm font-semibold text-slate-100 hover:bg-white/10 active:scale-98 cursor-pointer rounded-[16px] transition-colors"
          >
            <span>{t('Reply')}</span>
            <ArrowBendUpLeft size={18} weight="bold" className="text-slate-400" />
          </button>
          <div className="h-[1px] w-full bg-white/[0.10] my-0.5" />
          <button
            type="button"
            onClick={() => {
              onCopy();
              onClose();
            }}
            className="w-full h-11 px-4 flex items-center justify-between text-sm font-semibold text-slate-100 hover:bg-white/10 active:scale-98 cursor-pointer rounded-[16px] transition-colors"
          >
            <span>{t('Copy')}</span>
            <Copy size={18} weight="bold" className="text-slate-400" />
          </button>
          {onEdit && (
            <>
              <div className="h-[1px] w-full bg-white/[0.10] my-0.5" />
              <button
                type="button"
                onClick={() => {
                  onEdit();
                  onClose();
                }}
                className="w-full h-11 px-4 flex items-center justify-between text-sm font-semibold text-slate-100 hover:bg-white/10 active:scale-98 cursor-pointer rounded-[16px] transition-colors"
              >
                <span>{t('Edit')}</span>
                <PencilSimple size={18} weight="bold" className="text-slate-400" />
              </button>
            </>
          )}
          {onAction && (
            <>
              <div className="h-[1px] w-full bg-white/[0.10] my-0.5" />
              <button
                type="button"
                onClick={() => {
                  onAction(message.type === 'meal' ? 'Cook' : 'Contribute');
                  onClose();
                }}
                className="w-full h-11 px-4 flex items-center justify-between text-sm font-semibold text-slate-100 hover:bg-white/10 active:scale-98 cursor-pointer rounded-[16px] transition-colors"
              >
                <span>{t(message.type === 'meal' ? 'Cook' : 'Contribute')}</span>
                {message.type === 'meal'
                  ? <CookingPot size={18} weight="bold" className="text-slate-400" />
                  : <HandHeart size={18} weight="bold" className="text-slate-400" />}
              </button>
            </>
          )}
          {isOwnMessage && onDelete && (
            <>
              <div className="h-[1px] w-full bg-white/[0.10] my-0.5" />
              <button
                type="button"
                onClick={() => {
                  onDelete();
                  onClose();
                }}
                className="w-full h-11 px-4 flex items-center justify-between text-sm font-semibold text-red-400 hover:bg-red-500/15 active:scale-98 cursor-pointer rounded-[16px] transition-colors"
              >
                <span>{t('Delete')}</span>
                <Trash size={18} weight="bold" />
              </button>
            </>
          )}
        </motion.div>
      </motion.div>
    </div>
  );

  return createPortal(content, document.body);
};
