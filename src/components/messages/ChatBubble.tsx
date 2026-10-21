import React, { useEffect, useRef, useState } from 'react';
import {
  Heart,
  Check,
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
import { formatMessageTime, formatTripDate } from '../../utils/date';
import { TripMember } from '../../types';
import { DrawGameInviteCard } from './DrawGameInviteCard';
import { useLanguage } from '../../context/LanguageContext';
import { PhotoLightbox } from '../common/PhotoLightbox';

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
  members?: TripMember[];
  onEdit?: (message: Message) => void;
  onToggleListItem?: (message: Message, itemIndex: number) => void;
  onToggleAction?: (message: Message, action: 'Cook' | 'Contribute') => void;
  onJoinCall?: (callId: string) => void;
  onProfileClick?: (userId: string) => void;
  onOpenDrawGame?: (gameId: string) => void;
}

const REACTION_ICON_MAP: Record<Reaction['kind'], React.ComponentType<any>> = {
  Heart,
  ThumbsUp,
  ThumbsDown,
  Smiley,
  HandsClapping,
  Question,
};

const renderContentWithMentions = (content: string, isOwnBubble: boolean, members: TripMember[]) => {
  if (!content) return null;
  const names = members
    .map((member) => member.profile?.display_name?.trim())
    .filter((name): name is string => Boolean(name))
    .sort((left, right) => right.length - left.length);
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  while (cursor < content.length) {
    const previous = cursor === 0 ? '' : content[cursor - 1];
    const isBoundary = cursor === 0 || /\s/.test(previous);
    let matchedText: string | null = null;
    let isStyled = false;
    if (isBoundary && content[cursor] === '@') {
      const candidate = names.find((name) => {
        const mention = `@${name}`;
        const match = content.slice(cursor, cursor + mention.length);
        const nextChar = content[cursor + mention.length] || '';
        return match.toLocaleLowerCase() === mention.toLocaleLowerCase()
          && (!nextChar || !/[\p{L}\p{N}_]/u.test(nextChar));
      });
      if (candidate) {
        matchedText = `@${candidate}`;
        isStyled = true;
      }
    }
    if (content[cursor] === '#') {
      const hashtag = content.slice(cursor).match(/^#(?:\s+)?[^\s#]+/)?.[0];
      if (hashtag) {
        matchedText = hashtag;
        isStyled = true;
      }
    }
    if (isStyled && matchedText) {
      parts.push(
        <span
          key={`styled-${cursor}`}
          className={`font-semibold inline-block rounded px-1 -mx-0.5 ${
            isOwnBubble
              ? 'bg-white/25 text-white underline decoration-white/40'
              : 'bg-[#0A84FF]/25 text-[#70baff] font-bold'
          }`}
        >
          {matchedText}
        </span>,
      );
      cursor += matchedText.length;
      continue;
    }
    let textEnd = cursor + 1;
    while (textEnd < content.length && content[textEnd] !== '@' && content[textEnd] !== '#') textEnd += 1;
    parts.push(content.slice(cursor, textEnd));
    cursor = textEnd;
  }
  return parts.map((part, index) => {
    if (typeof part === 'string') {
      return <React.Fragment key={`text-${index}`}>{part}</React.Fragment>;
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
  members = [],
  onEdit,
  onToggleListItem,
  onToggleAction,
  onJoinCall,
  onProfileClick,
  onOpenDrawGame,
}) => {
  const { t } = useLanguage();
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [bubbleRect, setBubbleRect] = useState<DOMRect | null>(null);
  const [showHeartPop, setShowHeartPop] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [reactionBurst, setReactionBurst] = useState(0);
  const bubbleRef = useRef<HTMLDivElement>(null);

  const lastTapTimeRef = useRef<number>(0);
  const pressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const holdPointerIdRef = useRef<number | null>(null);
  const holdListenersCleanupRef = useRef<(() => void) | null>(null);
  const didLongPressRef = useRef(false);
  const didMoveDuringPressRef = useRef(false);

  const clearLongPress = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
    holdListenersCleanupRef.current?.();
    holdListenersCleanupRef.current = null;
    holdPointerIdRef.current = null;
  };

  useEffect(() => () => {
    if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
    holdListenersCleanupRef.current?.();
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    clearLongPress();
    didLongPressRef.current = false;
    didMoveDuringPressRef.current = false;
    holdPointerIdRef.current = e.pointerId;
    startPosRef.current = { x: e.clientX, y: e.clientY };

    const cancelForMovement = (event: PointerEvent) => {
      if (event.pointerId !== holdPointerIdRef.current || !startPosRef.current) return;
      const dx = Math.abs(event.clientX - startPosRef.current.x);
      const dy = Math.abs(event.clientY - startPosRef.current.y);
      if (dx > 8 || dy > 8) {
        didMoveDuringPressRef.current = true;
        clearLongPress();
        startPosRef.current = null;
      }
    };
    const cancelForRelease = (event: PointerEvent) => {
      if (event.pointerId !== holdPointerIdRef.current) return;
      if (event.type === 'pointercancel') didMoveDuringPressRef.current = true;
      clearLongPress();
      startPosRef.current = null;
    };
    window.addEventListener('pointermove', cancelForMovement, true);
    window.addEventListener('pointerup', cancelForRelease, true);
    window.addEventListener('pointercancel', cancelForRelease, true);
    holdListenersCleanupRef.current = () => {
      window.removeEventListener('pointermove', cancelForMovement, true);
      window.removeEventListener('pointerup', cancelForRelease, true);
      window.removeEventListener('pointercancel', cancelForRelease, true);
    };

    pressTimerRef.current = setTimeout(() => {
      didLongPressRef.current = true;
      clearLongPress();
      if (bubbleRef.current) {
        setBubbleRect(bubbleRef.current.getBoundingClientRect());
      }
      setShowReactionPicker(true);
    }, 500);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!startPosRef.current) return;
    const dx = Math.abs(e.clientX - startPosRef.current.x);
    const dy = Math.abs(e.clientY - startPosRef.current.y);
    if (dx > 8 || dy > 8) {
      didMoveDuringPressRef.current = true;
      clearLongPress();
      startPosRef.current = null;
    }
  };

  const handlePointerUp = () => {
    clearLongPress();
    startPosRef.current = null;
    if (didLongPressRef.current) {
      return;
    }
    if (didMoveDuringPressRef.current) {
      didMoveDuringPressRef.current = false;
      return;
    }
    const now = Date.now();
    const timeDiff = now - lastTapTimeRef.current;
    if (timeDiff < 300) {
      onDoubleTapHeart(message.id);
      playReactionBurst();
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

  const handlePointerCancel = () => {
    didMoveDuringPressRef.current = true;
    clearLongPress();
    startPosRef.current = null;
  };

  const playReactionBurst = () => {
    setReactionBurst((burst) => burst + 1);
    window.setTimeout(() => setReactionBurst(0), 700);
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
  const callId = message.metadata?.callId;

  // Top corner has the exact same roundness as bottom corner when multiple messages from same sender
  const getBubbleRadiusClasses = () => {
    if (isImageOnly) return 'rounded-[22px]';
    if (isOwn) {
      return isFirstInGroup
        ? 'rounded-[22px] rounded-br-[6px]'
        : 'rounded-[22px] rounded-tr-[6px] rounded-br-[6px]';
    } else {
      return isFirstInGroup
        ? 'rounded-[22px] rounded-bl-[6px]'
        : 'rounded-[22px] rounded-tl-[6px] rounded-bl-[6px]';
    }
  };

  return (
    <div
      className={`relative flex flex-col ${isOwn ? 'items-end' : 'items-start'} ${
        isFirstInGroup ? 'mt-3' : 'mt-[3px]'
      } select-none`}
    >
      {/* Row containing avatar NEXT to bubble */}
      <div className={`relative flex items-end gap-2.5 max-w-[85%] ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
        {!isOwn && (
          <div className="w-8 h-8 shrink-0 flex items-end">
            {isLastInGroup ? (
              <button
                type="button"
                onClick={() => message.sender?.id && onProfileClick?.(message.sender.id)}
                aria-label={`View ${message.sender?.display_name || 'member'} profile`}
                className="rounded-full"
              >
                <Avatar
                  name={message.sender?.display_name}
                  avatarUrl={message.sender?.avatar_url}
                  color={message.sender?.color}
                  size={32}
                />
              </button>
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
              onReact={(kind) => {
                onReact(message.id, kind);
                playReactionBurst();
              }}
              onReply={() => onReply(message)}
              onCopy={copyContent}
              onDelete={isOwn && onDelete && message.type !== 'call' ? () => onDelete(message.id) : undefined}
              onEdit={['grocery_list', 'meal', 'plan'].includes(message.type) ? () => onEdit?.(message) : undefined}
              onAction={['meal', 'plan'].includes(message.type) ? (action) => onToggleAction?.(message, action) : undefined}
              onClose={() => setShowReactionPicker(false)}
            />
          )}

          {/* Double tap heart pop */}
          {showHeartPop && (
            <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none animate-ping">
              <Heart size={48} weight="fill" className="text-red-500 drop-shadow-lg" />
            </div>
          )}
          {reactionBurst > 0 && (
            <div key={reactionBurst} aria-hidden="true" className="pointer-events-none absolute inset-0 z-30 overflow-visible">
              {Array.from({ length: 10 }, (_, index) => {
                const angle = (Math.PI * 2 * index) / 10;
                return (
                  <span
                    key={index}
                    className="reaction-particle"
                    style={{
                      '--particle-x': `${Math.cos(angle) * 44}px`,
                      '--particle-y': `${Math.sin(angle) * 38}px`,
                      '--particle-delay': `${index * 12}ms`,
                    } as React.CSSProperties}
                  />
                );
              })}
            </div>
          )}

          {/* Image Bubble */}
          {isImageOnly ? (
            <div
              ref={bubbleRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
              onContextMenu={handleContextMenu}
              onClick={() => {
                if (!didLongPressRef.current) setSelectedImage(message.image_url!);
              }}
              className="chat-bubble-touch cursor-pointer relative bg-transparent p-0 transition-opacity active:opacity-90 flex flex-col gap-1.5 [touch-action:pan-y]"
            >
              {replyMessage && (
                <div className="mb-1 max-w-full min-w-0 px-3.5 py-1.5 rounded-[16px] text-xs bg-white/10 text-slate-200">
                  <div className="font-bold text-[11px] opacity-80">
                    {replyMessage.sender?.display_name || t('Member')}
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
                <p className="min-w-0 max-w-full px-1.5 text-base text-white whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                  {renderContentWithMentions(message.content, isOwn, members)}
                </p>
              )}
            </div>
          ) : (
            <div className="relative min-w-0 max-w-full [overflow-wrap:anywhere]">
              <div
                ref={bubbleRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerCancel}
                onContextMenu={handleContextMenu}
                className={`chat-bubble-touch cursor-pointer relative min-w-0 max-w-full px-4 py-2.5 text-[16px] leading-[1.4] transition-opacity active:opacity-90 [overflow-wrap:anywhere] [touch-action:pan-y] ${getBubbleRadiusClasses()} ${
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
                      {replyMessage.sender?.display_name || t('Member')}
                    </div>
                    <div className="reply-preview-content text-[11px] leading-snug">
                      {replyMessage.content}
                    </div>
                  </div>
                )}

                {/* Poll Result Message in Chat Log */}
                {isPollResult ? (
                  <PollResultMessage metadata={message.metadata} isOwn={isOwn} />
                ) : message.type === 'grocery_list' ? (
                  <div className="min-w-[190px] space-y-2">
                    <div className="text-xs font-semibold tracking-wide text-white/70">{t('Grocery list')}</div>
                    <div className="space-y-1.5">
                      {(message.metadata?.items || message.content.split(/\r?\n/).map((text: string) => ({ text, checked: false }))).map((item: { text: string; checked: boolean }, index: number) => (
                        <button
                          key={`${item.text}-${index}`}
                          type="button"
                          onPointerDown={(event) => event.stopPropagation()}
                          onPointerUp={(event) => event.stopPropagation()}
                          onPointerCancel={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            onToggleListItem?.(message, index);
                          }}
                          aria-checked={Boolean(item.checked)}
                          role="checkbox"
                          className="flex min-h-8 w-full items-center gap-2 text-left text-sm [touch-action:manipulation]"
                        >
                          <span
                            className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-[background-color,border-color,transform] duration-200 ease-out ${
                              item.checked
                                ? 'scale-100 border-white bg-white text-[#0A84FF]'
                                : 'scale-90 border-white/75 bg-transparent text-transparent'
                            }`}
                          >
                            {item.checked && <Check size={12} weight="bold" className="animate-check-pop" />}
                          </span>
                          <span className={`transition-colors duration-200 ${item.checked ? 'text-white/50 line-through' : ''}`}>{item.text}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : message.type === 'meal' || message.type === 'plan' ? (
                  <div className="min-w-0 max-w-full [overflow-wrap:anywhere]">
                    <p className="whitespace-pre-wrap break-words">{renderContentWithMentions(message.content, isOwn, members)}</p>
                  </div>
                ) : message.type === 'draw_game' ? (
                  <DrawGameInviteCard
                    gameId={message.metadata?.gameId}
                    onOpen={onOpenDrawGame}
                  />
                ) : message.type === 'call' ? (
                  <div className="min-w-[200px]">
                    <div className="mb-1 text-xs font-semibold tracking-wide text-white/70">
                      {t(message.metadata?.kind === 'video' ? 'Video call' : 'Voice call')}
                    </div>
                    <p className="font-semibold">
                      {t(message.metadata?.status === 'ended' ? 'Call ended' : 'Call in progress')}
                    </p>
                    {message.metadata?.status === 'ended' && Number.isFinite(message.metadata?.durationSeconds) && (
                      <p className="mt-0.5 text-xs text-white/70">
                        Duration {Math.floor(message.metadata.durationSeconds / 60)}:
                        {String(message.metadata.durationSeconds % 60).padStart(2, '0')}
                      </p>
                    )}
                    {message.metadata?.status !== 'ended'
                      && callId
                      && !message.metadata?.activeParticipantIds?.includes(currentUserId)
                      && onJoinCall && (
                        <button
                          type="button"
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            onJoinCall(callId);
                          }}
                          className="mt-2 min-h-10 rounded-full bg-white px-4 text-sm font-bold text-[#0A84FF]"
                        >
                          {t('Join call')}
                        </button>
                      )}
                  </div>
                ) : (
                  <p className="min-w-0 max-w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                    {renderContentWithMentions(message.content, isOwn, members)}
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

      {(isLastInGroup || message.type === 'meal' || message.type === 'plan' || message.type === 'call') && (
        <div className={`mt-1 flex flex-col gap-1 text-[11px] font-medium text-slate-500 ${
          isOwn ? 'mr-1 items-end text-right' : 'ml-10 items-start text-left'
        }`}>
          {(message.type === 'meal' || message.type === 'plan') ? (
            <>
              {(message.type === 'plan' && message.metadata?.date) || message.metadata?.time ? (
                <div className="flex min-h-5 items-center gap-2">
                  {message.type === 'plan' && message.metadata?.date && <span>{formatTripDate(message.metadata.date)}</span>}
                  {message.metadata?.time && <span>{message.metadata.time}</span>}
                </div>
              ) : null}
              {isLastInGroup && (
                <span className="flex min-h-5 items-center gap-1">
                  {!isOwn && (
                    <>
                      <span>{message.sender?.display_name || t('Member')}</span>
                      <span aria-hidden="true">•</span>
                    </>
                  )}
                  <span>{formatMessageTime(message.created_at)}</span>
                </span>
              )}
            </>
          ) : isLastInGroup && (
            <span className="flex min-h-5 items-center gap-1">
              {!isOwn && (
                <>
                  <span>{message.sender?.display_name || t('Member')}</span>
                  <span aria-hidden="true">•</span>
                </>
              )}
              <span>{formatMessageTime(message.created_at)}</span>
            </span>
          )}
          {message.type === 'meal' && (
            <ProfileRow label={t('Cook:')} ids={message.metadata?.cooks || []} members={members} onProfileClick={onProfileClick} />
          )}
          {message.type === 'plan' && (
            <ProfileRow label={t('Contributors:')} ids={message.metadata?.contributors || []} members={members} onProfileClick={onProfileClick} />
          )}
          {message.type === 'call' && (
            <ProfileRow label={t('Participants:')} ids={message.metadata?.participantIds || []} members={members} onProfileClick={onProfileClick} />
          )}
        </div>
      )}

      {selectedImage && (
        <PhotoLightbox imageUrl={selectedImage} onClose={() => setSelectedImage(null)} />
      )}
    </div>
  );
};

const ProfileRow: React.FC<{
  label: string;
  ids: string[];
  members: TripMember[];
  onProfileClick?: (userId: string) => void;
}> = ({ label, ids, members, onProfileClick }) => {
  const { t } = useLanguage();
  const profiles = ids
    .map((id) => members.find((member) => member.user_id === id)?.profile)
    .filter((profile): profile is NonNullable<typeof profile> => Boolean(profile));
  if (profiles.length === 0) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0 text-[11px] font-medium text-slate-500">{label}</span>
      <div className="flex items-center -space-x-2">
        {profiles.map((profile) => (
          <button
            key={profile.id}
            type="button"
            onClick={() => onProfileClick?.(profile.id)}
            aria-label={`${t('View profile')}: ${profile.display_name}`}
            className="rounded-full border-2 border-black"
          >
            <Avatar
              name={profile.display_name}
              avatarUrl={profile.avatar_url}
              color={profile.color}
              size={22}
            />
          </button>
        ))}
      </div>
    </div>
  );
};
