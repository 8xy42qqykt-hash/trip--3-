import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
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
} from '@phosphor-icons/react';
import { Message, Reaction } from '../../types';
import { PollResultMessage } from './PollResultMessage';

interface ReactionPickerProps {
  message: Message;
  isOwnMessage: boolean;
  bubbleRect: DOMRect | null;
  bubbleRadiusClasses?: string;
  currentReaction?: Reaction['kind'] | null;
  onReact: (kind: Reaction['kind']) => void;
  onReply: () => void;
  onCopy: () => void;
  onDelete?: () => void;
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
  bubbleRadiusClasses,
  currentReaction,
  onReact,
  onReply,
  onCopy,
  onDelete,
  onClose,
}) => {
  const isPollResult = message.type === 'poll_result' && message.metadata;
  const isImageOnly = message.type === 'image' && Boolean(message.image_url);

  const windowH = typeof window !== 'undefined' ? window.innerHeight : 800;
  const windowW = typeof window !== 'undefined' ? window.innerWidth : 400;

  const reactionBarHeight = 52;
  const reactionBarWidth = 276;
  const gap = 12;
  const menuHeight = isOwnMessage && onDelete ? 148 : 100;
  const menuWidth = 216;

  // Top and bottom clearance from header and input/nav bars
  const topMargin = 78;
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

  const minBubbleTop = topMargin + reactionBarHeight + gap;
  const maxBubbleTop = Math.max(minBubbleTop, windowH - bottomMargin - menuHeight - gap - bubbleHeight);

  let targetBubbleTop = originalBubbleTop;
  if (targetBubbleTop < minBubbleTop) {
    targetBubbleTop = minBubbleTop;
  }
  if (targetBubbleTop > maxBubbleTop) {
    targetBubbleTop = maxBubbleTop;
  }

  const verticalShift = targetBubbleTop - originalBubbleTop;

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

  const defaultRadius = bubbleRadiusClasses || (isOwnMessage ? 'rounded-[22px] rounded-br-[6px]' : 'rounded-[22px] rounded-bl-[6px]');

  const content = (
    <div className="fixed inset-0 z-[9998] select-none">
      {/* Blurred & dimmed backdrop */}
      <div
        onClick={onClose}
        style={{
          backdropFilter: 'blur(28px) saturate(180%)',
          WebkitBackdropFilter: 'blur(28px) saturate(180%)',
          backgroundColor: 'rgba(0, 0, 0, 0.72)',
        }}
        className="fixed inset-0 animate-backdrop-in"
      />

      {/* Floating container with smooth slide */}
      <div
        style={{
          transform: 'translateY(0)',
          transition: 'transform 260ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        className="fixed inset-0 pointer-events-none z-[9999]"
      >
        {/* Reaction Bar: Clamped strictly within screen boundaries */}
        <div
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
        </div>

        {/* Lifted Message Box: Unscaled max-content width so text NEVER wraps onto more lines */}
        <div
          style={{
            top: `${targetBubbleTop}px`,
            left: `${targetBubbleLeft}px`,
            width: `${bubbleWidth}px`,
            minWidth: `${bubbleWidth}px`,
            maxWidth: `${bubbleWidth}px`,
          }}
          className="absolute pointer-events-none"
        >
          {isImageOnly ? (
            <div className="flex flex-col items-center gap-2">
              <img
                src={message.image_url!}
                alt="Attachment"
                style={{
                  width: `${bubbleWidth}px`,
                  maxHeight: '75vh',
                }}
                className="rounded-[22px] object-cover shadow-2xl block"
              />
              {message.content && (
                <p className="text-base px-2 text-white whitespace-pre-wrap break-words">
                  {message.content}
                </p>
              )}
            </div>
          ) : isPollResult ? (
            <div
              className={`p-4 shadow-2xl text-white ${defaultRadius} ${
                isOwnMessage ? 'bg-[#0A84FF]' : 'bg-[#262629]'
              }`}
            >
              <PollResultMessage metadata={message.metadata} isOwn={isOwnMessage} />
            </div>
          ) : (
            <div
              className={`px-4 py-2.5 text-[16px] leading-[1.4] shadow-2xl whitespace-pre-wrap break-words ${defaultRadius} ${
                isOwnMessage
                  ? 'bg-[#0A84FF] text-white'
                  : 'bg-[#262629] text-white'
              }`}
              style={{
                width: 'max-content',
                minWidth: `${bubbleWidth}px`,
                maxWidth: `${bubbleWidth}px`,
                boxSizing: 'border-box',
              }}
            >
              {message.content}
            </div>
          )}
        </div>

        {/* Action Menu: Clamped strictly within screen boundaries */}
        <div
          style={{
            top: `${actionMenuTop}px`,
            left: `${actionMenuLeft}px`,
            width: `${actualMenuWidth}px`,
            backdropFilter: 'blur(32px) saturate(190%)',
            WebkitBackdropFilter: 'blur(32px) saturate(190%)',
            backgroundColor: 'rgba(28, 28, 32, 0.94)',
          }}
          className="absolute border border-white/[0.14] rounded-[22px] p-2 shadow-[0_16px_48px_rgba(0,0,0,0.6)] flex flex-col pointer-events-auto animate-pop-in"
        >
          <button
            type="button"
            onClick={() => {
              onReply();
              onClose();
            }}
            className="w-full h-11 px-4 flex items-center justify-between text-sm font-semibold text-slate-100 hover:bg-white/10 active:scale-98 cursor-pointer rounded-[16px] transition-colors"
          >
            <span>Reply</span>
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
            <span>Copy</span>
            <Copy size={18} weight="bold" className="text-slate-400" />
          </button>
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
                <span>Delete</span>
                <Trash size={18} weight="bold" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
};
