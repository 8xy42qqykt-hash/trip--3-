import React, { useEffect, useRef, useState } from 'react';
import {
  Heart,
  Check,
  ThumbsUp,
  ThumbsDown,
  Smiley,
  HandsClapping,
  Question,
  ArrowSquareOut,
} from '@phosphor-icons/react';
import { Message, Reaction } from '../../types';
import { Avatar } from '../common/Avatar';
import { ReactionPicker } from './ReactionPicker';
import { PollResultMessage } from './PollResultMessage';
import { formatMessageTime, formatTripDate } from '../../utils/date';
import { TripMember } from '../../types';
import { DrawGameInviteCard } from './DrawGameInviteCard';
import { GameSessionInviteCard } from './GameSessionInviteCard';
import { useLanguage } from '../../context/LanguageContext';
import { StickerArtwork } from './StickerArtwork';

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
  onOpenGameSession?: (gameId: string) => void;
  onOpenImage?: (imageUrl: string) => void;
}

const REACTION_ICON_MAP: Record<Reaction['kind'], React.ComponentType<any>> = {
  Heart,
  ThumbsUp,
  ThumbsDown,
  Smiley,
  HandsClapping,
  Question,
};

const LINK_PATTERN = /(?:https?:\/\/|www\.)[^\s<>"']+/i;
const TRAILING_LINK_PUNCTUATION = /[),.!?;:]+$/;

const parseLink = (rawUrl: string) => {
  const displayUrl = rawUrl.replace(TRAILING_LINK_PUNCTUATION, '');
  if (!displayUrl) return null;
  const href = displayUrl.startsWith('www.') ? `https://${displayUrl}` : displayUrl;
  try {
    const parsed = new URL(href);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return { href: parsed.href, displayUrl, host: parsed.hostname.replace(/^www\./i, ''), path: `${parsed.pathname}${parsed.search}${parsed.hash}` };
  } catch {
    return null;
  }
};

const findFirstLink = (content: string) => {
  const match = content.match(LINK_PATTERN);
  return match ? parseLink(match[0]) : null;
};

const LinkPreview: React.FC<{ content: string }> = ({ content }) => {
  const link = findFirstLink(content);
  if (!link) return null;
  const host = link.host.toLowerCase();
  const isSpotify = host === 'spotify.com' || host.endsWith('.spotify.com');
  const isYouTube = host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be';
  const isInstagram = host === 'instagram.com' || host.endsWith('.instagram.com');
  const isTikTok = host === 'tiktok.com' || host.endsWith('.tiktok.com');
  return (
    <a
      href={link.href}
      target="_blank"
      rel="noopener noreferrer"
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      className="mb-1.5 block w-[min(72vw,260px)] max-w-full overflow-hidden rounded-[18px] border border-white/10 bg-[#202024] text-left shadow-[0_6px_18px_rgba(0,0,0,0.24)]"
      aria-label={`Open link to ${link.host}`}
    >
      <div
        className={`relative flex h-28 items-center justify-center overflow-hidden ${
          isSpotify
            ? 'bg-[radial-gradient(ellipse_at_50%_110%,rgba(35,215,96,0.52),transparent_62%),linear-gradient(135deg,#182922,#101312)]'
            : isYouTube
              ? 'bg-[radial-gradient(ellipse_at_50%_110%,rgba(255,30,30,0.42),transparent_60%),linear-gradient(135deg,#2a1719,#111113)]'
              : isInstagram
                ? 'bg-[linear-gradient(125deg,#612bc2,#d12c84,#f2a13b)]'
                : isTikTok
                  ? 'bg-[radial-gradient(ellipse_at_25%_70%,rgba(37,244,238,0.32),transparent_52%),radial-gradient(ellipse_at_78%_25%,rgba(254,44,85,0.35),transparent_52%),#111113]'
                  : 'bg-[radial-gradient(ellipse_at_20%_25%,rgba(130,190,255,0.6),transparent_52%),radial-gradient(ellipse_at_80%_75%,rgba(10,132,255,0.55),transparent_55%),linear-gradient(135deg,#20232c,#111318)]'
        }`}
      >
        {isSpotify ? (
          <svg aria-label="Spotify" role="img" viewBox="0 0 64 64" className="relative h-[66px] w-[66px] drop-shadow-xl">
            <circle cx="32" cy="32" r="31" fill="#1ED760" />
            <path d="M15 25c11-3 24-2 34 4" fill="none" stroke="#102117" strokeWidth="5" strokeLinecap="round" />
            <path d="M18 33c9-2 20-1 28 4" fill="none" stroke="#102117" strokeWidth="4.5" strokeLinecap="round" />
            <path d="M21 41c7-1 14 0 21 4" fill="none" stroke="#102117" strokeWidth="4" strokeLinecap="round" />
          </svg>
        ) : isYouTube ? (
          <span className="relative flex h-[52px] w-[74px] items-center justify-center rounded-[17px] bg-[#FF0033] shadow-xl">
            <span className="ml-1 h-0 w-0 border-y-[12px] border-y-transparent border-l-[18px] border-l-white" />
          </span>
        ) : isInstagram ? (
          <span className="relative flex h-[66px] w-[66px] items-center justify-center rounded-[21px] border-[5px] border-white shadow-xl">
            <span className="h-7 w-7 rounded-full border-[4px] border-white" />
            <span className="absolute right-[9px] top-[9px] h-2 w-2 rounded-full bg-white" />
          </span>
        ) : isTikTok ? (
          <span className="relative text-[76px] font-black leading-none text-white drop-shadow-[3px_3px_0_#25F4EE] [text-shadow:-3px_-3px_0_#FE2C55]">♪</span>
        ) : (
          <>
            <span className="absolute -right-3 -top-8 h-28 w-28 rounded-full border border-white/15 bg-white/[0.05]" />
            <span className="absolute -bottom-10 -left-5 h-28 w-28 rounded-full border border-white/15 bg-white/[0.05]" />
            <span className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-white/20 bg-black/20 text-white shadow-lg backdrop-blur-sm">
              <span className="text-2xl font-black">{link.host.charAt(0).toUpperCase()}</span>
            </span>
          </>
        )}
        <span className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/35 text-white/80">
          <ArrowSquareOut size={15} weight="bold" />
        </span>
      </div>
      <div className="min-w-0 px-3.5 py-2.5">
        <span className="block truncate text-sm font-bold text-white">
          {isSpotify ? 'Spotify' : isYouTube ? 'YouTube' : isInstagram ? 'Instagram' : isTikTok ? 'TikTok' : link.host}
        </span>
        <span className="mt-0.5 block truncate text-xs text-white/65">{link.path || link.displayUrl}</span>
      </div>
    </a>
  );
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
    const linkMatch = content.slice(cursor).match(/^(?:https?:\/\/|www\.)[^\s<>"']+/i);
    if (linkMatch?.index === 0) {
      const rawUrl = linkMatch[0];
      const link = parseLink(rawUrl);
      if (link) {
        parts.push(
          <a
            key={`link-${cursor}`}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            onPointerDown={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            className="break-all underline decoration-current/50 underline-offset-2"
          >
            {link.displayUrl}
          </a>,
        );
        cursor += link.displayUrl.length;
        continue;
      }
    }
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
    while (
      textEnd < content.length
      && content[textEnd] !== '@'
      && content[textEnd] !== '#'
      && !content.slice(textEnd).match(/^(?:https?:\/\/|www\.)[^\s<>"']+/i)
    ) textEnd += 1;
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
  onOpenGameSession,
  onOpenImage,
}) => {
  const { t } = useLanguage();
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [bubbleRect, setBubbleRect] = useState<DOMRect | null>(null);
  const [showHeartPop, setShowHeartPop] = useState(false);
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
  const isGameSummary = message.type === 'text' && message.metadata?.gameSummary === true;
  const isImageOnly = message.type === 'image' && Boolean(message.image_url);
  const stickerId = typeof message.metadata?.stickerId === 'string' ? message.metadata.stickerId : null;
  const isSticker = message.type === 'text' && stickerId !== null;
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
      <div className={`relative flex max-w-[85%] ${isOwn ? 'flex-row-reverse items-end' : 'flex-col items-start'}`}>

        <div className={`relative flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
          {/* Reaction Picker overlay */}
          {showReactionPicker && (
            <ReactionPicker
              message={message}
              isOwnMessage={isOwn}
              bubbleRect={bubbleRect}
              bubbleElement={bubbleRef.current}
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
          {!isImageOnly && (message.type === 'text' || message.type === 'meal' || message.type === 'plan') && (
            <LinkPreview content={message.content} />
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
                if (!didLongPressRef.current) onOpenImage?.(message.image_url!);
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
                className={`chat-bubble-touch cursor-pointer relative min-w-0 max-w-full transition-opacity active:opacity-90 [overflow-wrap:anywhere] [touch-action:pan-y] ${
                  isSticker
                    ? 'bg-transparent p-0 shadow-none'
                    : `px-4 py-2.5 text-[16px] leading-[1.4] ${getBubbleRadiusClasses()} ${
                      isOwn
                        ? 'bg-[#0A84FF] text-white shadow-xs'
                        : 'bg-[#262629] text-white shadow-xs'
                    }`
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
                {isSticker ? (
                  <StickerArtwork
                    stickerId={stickerId}
                    size={136}
                    className="max-w-full drop-shadow-[0_8px_18px_rgba(0,0,0,0.22)]"
                  />
                ) : isPollResult ? (
                  <PollResultMessage metadata={message.metadata} isOwn={isOwn} />
                ) : isGameSummary ? (
                  <div className="min-w-[190px] space-y-2">
                    <p className="text-xs font-semibold tracking-wide text-white/70">
                      {t(typeof message.metadata?.gameName === 'string' ? message.metadata.gameName : 'Game results')}
                    </p>
                    {typeof message.metadata?.winnerId === 'string' ? (
                      <p className="text-sm font-bold">
                        {members?.find((member) => member.user_id === message.metadata?.winnerId)?.profile?.display_name || t('Member')} {t('wins!')}
                      </p>
                    ) : (
                      <p className="text-sm font-bold">{t('It’s a draw')}</p>
                    )}
                    {Array.isArray(message.metadata?.participants) && message.metadata.participants.map((id: string) => (
                      <p key={id} className="flex justify-between gap-5 text-xs text-white/75">
                        <span>{members?.find((member) => member.user_id === id)?.profile?.display_name || t('Member')}</span>
                        {typeof message.metadata?.scores?.[id] === 'number' && <strong>{message.metadata.scores[id]}</strong>}
                      </p>
                    ))}
                  </div>
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
                    members={members}
                    onOpen={onOpenDrawGame}
                  />
                ) : message.type === 'game_session' ? (
                  <GameSessionInviteCard
                    gameId={message.metadata?.gameSessionId}
                    members={members}
                    currentUserId={currentUserId}
                    onOpen={onOpenGameSession}
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
          isOwn ? 'mr-1 items-end text-right' : 'items-start text-left'
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
                <span className="flex min-h-6 items-center gap-1.5">
                  {!isOwn && (
                    <button
                      type="button"
                      onClick={() => message.sender?.id && onProfileClick?.(message.sender.id)}
                      aria-label={`View ${message.sender?.display_name || 'member'} profile`}
                      className="shrink-0 rounded-full"
                    >
                      <Avatar
                        name={message.sender?.display_name}
                        avatarUrl={message.sender?.avatar_url}
                        color={message.sender?.color}
                        size={24}
                      />
                    </button>
                  )}
                  <span className="flex items-center gap-1">
                    {!isOwn && (
                      <>
                        <span>{message.sender?.display_name || t('Member')}</span>
                        <span aria-hidden="true">•</span>
                      </>
                    )}
                    <span>{formatMessageTime(message.created_at)}</span>
                  </span>
                </span>
              )}
            </>
          ) : isLastInGroup && (
            <span className="flex min-h-6 items-center gap-1.5">
              {!isOwn && (
                <button
                  type="button"
                  onClick={() => message.sender?.id && onProfileClick?.(message.sender.id)}
                  aria-label={`View ${message.sender?.display_name || 'member'} profile`}
                  className="shrink-0 rounded-full"
                >
                  <Avatar
                    name={message.sender?.display_name}
                    avatarUrl={message.sender?.avatar_url}
                    color={message.sender?.color}
                    size={24}
                  />
                </button>
              )}
              <span className="flex items-center gap-1">
                {!isOwn && (
                  <>
                    <span>{message.sender?.display_name || t('Member')}</span>
                    <span aria-hidden="true">•</span>
                  </>
                )}
                <span>{formatMessageTime(message.created_at)}</span>
              </span>
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
