import React, { useRef, useState } from 'react';
import {
  Heart,
  ThumbsUp,
  ThumbsDown,
  Smiley,
  HandsClapping,
  Question,
} from '@phosphor-icons/react';
import { Message, Reaction } from '../../types';
import { Avatar } from '../common/Avatar';
import { ReactionPicker } from './ReactionPicker';
import { PollResultMessage } from './PollResultMessage';
import { formatMessageTime } from '../../utils/date';

interface ChatBubbleProps {
  message: Message;
  isOwn: boolean;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
  currentUserId?: string;
  onDoubleTapHeart: (messageId: string) => void;
  onReact: (messageId: string, kind: Reaction['kind']) => void;
  onReply: (message: Message) => void;
  onDelete?: (messageId: string) => void;
  replyMessage?: Message | null;
}

const REACTION_ICON_MAP: Record<Reaction['kind'], React.ComponentType<any>> = {
  Heart,
  ThumbsUp,
  ThumbsDown,
  Smiley,
  HandsClapping,
  Question,
};

const renderContentWithMentions = (content: string, isOwnBubble: boolean) => {
  if (!content) return null;
  const parts = content.split(/(@[^\s@]+)/g);
  return parts.map((part, index) => {
    if (part.startsWith('@')) {
      return (
        <span
          key={index}
          className={`font-semibold inline-block rounded px-1 -mx-0.5 ${
            isOwnBubble
              ? 'bg-white/25 text-white underline decoration-white/40'
              : 'bg-[#0A84FF]/25 text-[#70baff] font-bold'
          }`}
        >
          {part}
        </span>
      );
    }
    return part;
  });
};

export const ChatBubble: React.FC<ChatBubbleProps> = ({
  message,
  isOwn,
  isFirstInGroup,
  isLastInGroup,
  currentUserId,
  onDoubleTapHeart,
  onReact,
  onReply,
  onDelete,
  replyMessage,
}) => {
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [bubbleRect, setBubbleRect] = useState<DOMRect | null>(null);
  const [showHeartPop, setShowHeartPop] = useState(false);
  const bubbleRef = useRef<HTMLDivElement>(null);

  const lastTapTimeRef = useRef<number>(0);
  const pressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const didLongPressRef = useRef(false);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    didLongPressRef.current = false;
    startPosRef.current = { x: e.clientX, y: e.clientY };
    pressTimerRef.current = setTimeout(() => {
      didLongPressRef.current = true;
      if (bubbleRef.current) {
        const rect = bubbleRef.current.getBoundingClientRect();
        const unscaledWidth = Math.ceil(bubbleRef.current.offsetWidth || rect.width);
        const unscaledHeight = Math.ceil(bubbleRef.current.offsetHeight || rect.height);
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        setBubbleRect({
          left: centerX - unscaledWidth / 2,
          top: centerY - unscaledHeight / 2,
          width: unscaledWidth,
          height: unscaledHeight,
          right: centerX + unscaledWidth / 2,
          bottom: centerY + unscaledHeight / 2,
        } as DOMRect);
      }
      setShowReactionPicker(true);
    }, 320);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!startPosRef.current) return;
    const dx = Math.abs(e.clientX - startPosRef.current.x);
    const dy = Math.abs(e.clientY - startPosRef.current.y);
    if (dx > 8 || dy > 8) {
      if (pressTimerRef.current) {
        clearTimeout(pressTimerRef.current);
        pressTimerRef.current = null;
      }
    }
  };

  const handlePointerUp = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
    if (didLongPressRef.current) {
      return;
    }
    const now = Date.now();
    const timeDiff = now - lastTapTimeRef.current;
    if (timeDiff < 300) {
      onDoubleTapHeart(message.id);
      setShowHeartPop(true);
      setTimeout(() => setShowHeartPop(false), 900);
      lastTapTimeRef.current = 0;
    } else {
      lastTapTimeRef.current = now;
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  const copyContent = () => {
    navigator.clipboard.writeText(message.content || message.image_url || '');
  };

  // Group reactions by kind
  const groupedReactions: { kind: Reaction['kind']; count: number; userHasReacted: boolean }[] = [];
  let userCurrentReaction: Reaction['kind'] | null = null;
  if (message.reactions && message.reactions.length > 0) {
    const map = new Map<Reaction['kind'], { count: number; userHasReacted: boolean }>();
    for (const r of message.reactions) {
      const existing = map.get(r.kind) || { count: 0, userHasReacted: false };
      existing.count += 1;
      if (r.user_id === currentUserId) {
        existing.userHasReacted = true;
        userCurrentReaction = r.kind;
      }
      map.set(r.kind, existing);
    }
    for (const [kind, data] of map.entries()) {
      groupedReactions.push({ kind, count: data.count, userHasReacted: data.userHasReacted });
    }
  }

  const isPollResult = message.type === 'poll_result' && message.metadata;
  const isImageOnly = message.type === 'image' && Boolean(message.image_url);

  // Top corner has the exact same roundness as bottom corner when multiple messages from same sender
  const getBubbleRadiusClasses = () => {
    if (isImageOnly) return 'rounded-[22px]';
    const hasMultipleFromSamePerson = !isFirstInGroup || !isLastInGroup;
    if (isOwn) {
      if (hasMultipleFromSamePerson) {
        // Both top-right and bottom-right corners share identical tight roundness (6px)
        return 'rounded-[22px] rounded-tr-[6px] rounded-br-[6px]';
      }
      return 'rounded-[22px] rounded-br-[6px]';
    } else {
      if (hasMultipleFromSamePerson) {
        // Both top-left and bottom-left corners share identical tight roundness (6px)
        return 'rounded-[22px] rounded-tl-[6px] rounded-bl-[6px]';
      }
      return 'rounded-[22px] rounded-bl-[6px]';
    }
  };

  return (
    <div
      className={`relative flex flex-col ${isOwn ? 'items-end' : 'items-start'} ${
        isFirstInGroup ? 'mt-3' : 'mt-[3px]'
      } select-none`}
    >
      {/* Sender name for others */}
      {!isOwn && isFirstInGroup && (
        <span className="text-xs font-semibold text-slate-400 ml-10 mb-1">
          {message.sender?.display_name || 'Member'}
        </span>
      )}

      {/* Row containing avatar NEXT to bubble */}
      <div className={`relative flex items-end gap-2.5 max-w-[85%] ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
        {!isOwn && (
          <div className="w-8 h-8 shrink-0 flex items-end">
            {isLastInGroup ? (
              <Avatar
                name={message.sender?.display_name}
                avatarUrl={message.sender?.avatar_url}
                color={message.sender?.color}
                size={32}
              />
            ) : (
              <div className="w-8 h-8" />
            )}
          </div>
        )}

        <div className={`relative flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
          {/* Reaction Picker overlay */}
          {showReactionPicker && (
            <ReactionPicker
              message={message}
              isOwnMessage={isOwn}
              bubbleRect={bubbleRect}
              bubbleRadiusClasses={getBubbleRadiusClasses()}
              currentReaction={userCurrentReaction}
              onReact={(kind) => onReact(message.id, kind)}
              onReply={() => onReply(message)}
              onCopy={copyContent}
              onDelete={isOwn && onDelete ? () => onDelete(message.id) : undefined}
              onClose={() => setShowReactionPicker(false)}
            />
          )}

          {/* Double tap heart pop */}
          {showHeartPop && (
            <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none animate-ping">
              <Heart size={48} weight="fill" className="text-red-500 drop-shadow-lg" />
            </div>
          )}

          {/* Image Bubble */}
          {isImageOnly ? (
            <div
              ref={bubbleRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onContextMenu={handleContextMenu}
              className="chat-bubble-touch cursor-pointer relative bg-transparent p-0 transition-opacity active:opacity-90 flex flex-col gap-1.5"
            >
              {replyMessage && (
                <div className="mb-1 max-w-full min-w-0 px-3.5 py-1.5 rounded-[16px] text-xs bg-white/10 text-slate-200">
                  <div className="font-bold text-[11px] opacity-80">
                    {replyMessage.sender?.display_name || 'Member'}
                  </div>
                  <div className="reply-preview-content text-[11px] leading-snug">
                    {replyMessage.content}
                  </div>
                </div>
              )}
              <img
                src={message.image_url!}
                alt="Attachment"
                className="rounded-[22px] max-h-80 w-auto object-cover select-none shadow-md block"
              />
              {message.content && (
                <p className="text-base px-1.5 text-white whitespace-pre-wrap break-words">
                  {renderContentWithMentions(message.content, isOwn)}
                </p>
              )}
            </div>
          ) : (
            <div className="relative">
              <div
                ref={bubbleRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onContextMenu={handleContextMenu}
                className={`chat-bubble-touch cursor-pointer relative px-4 py-2.5 text-[16px] leading-[1.4] transition-opacity active:opacity-90 ${getBubbleRadiusClasses()} ${
                  isOwn
                    ? 'bg-[#0A84FF] text-white shadow-xs'
                    : 'bg-[#262629] text-white shadow-xs'
                }`}
              >
                {/* Reply Preview */}
                {replyMessage && (
                  <div
                    className={`mb-2 max-w-full min-w-0 px-3 py-1.5 rounded-[14px] text-xs ${
                      isOwn
                        ? 'bg-black/20 text-white/90'
                        : 'bg-white/10 text-slate-200'
                    }`}
                  >
                    <div className="font-bold text-[11px] opacity-80">
                      {replyMessage.sender?.display_name || 'Member'}
                    </div>
                    <div className="reply-preview-content text-[11px] leading-snug">
                      {replyMessage.content}
                    </div>
                  </div>
                )}

                {/* Poll Result Message in Chat Log */}
                {isPollResult ? (
                  <PollResultMessage metadata={message.metadata} isOwn={isOwn} />
                ) : (
                  <p className="whitespace-pre-wrap break-words">
                    {renderContentWithMentions(message.content, isOwn)}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Circular Badge on top corner of bubble */}
          {groupedReactions.length > 0 && (
            <div
              className={`absolute -top-3 z-20 flex items-center gap-1 px-2 py-0.5 rounded-full shadow-[0_4px_12px_rgba(0,0,0,0.3)] border border-white/15 select-none animate-calm-fade-in ${
                isOwn ? '-left-2' : '-right-2'
              }`}
              style={{
                background: 'rgba(30, 30, 35, 0.92)',
                backdropFilter: 'blur(20px) saturate(180%)',
                WebkitBackdropFilter: 'blur(20px) saturate(180%)',
              }}
            >
              {groupedReactions.slice(0, 2).map(({ kind, count, userHasReacted }) => {
                const Icon = REACTION_ICON_MAP[kind];
                return (
                  <span
                    key={kind}
                    className="flex items-center gap-1 text-white"
                  >
                    <Icon
                      size={15}
                      weight={userHasReacted ? 'fill' : 'regular'}
                      className={userHasReacted ? 'text-[#0A84FF]' : 'text-white'}
                    />
                    {count > 1 && (
                      <span className="text-[11px] font-bold text-slate-200">
                        {count}
                      </span>
                    )}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Sent time outside bubble */}
      {isLastInGroup && (
        <span
          className={`text-[11px] text-slate-500 mt-1 font-medium ${
            isOwn ? 'mr-1' : 'ml-10'
          }`}
        >
          {formatMessageTime(message.created_at)}
        </span>
      )}
    </div>
  );
};
