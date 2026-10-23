import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Heart,
  Check,
  ThumbsUp,
  ThumbsDown,
  Smiley,
  HandsClapping,
  Question,
  ArrowSquareOut,
  FacebookLogo,
  InstagramLogo,
  RedditLogo,
  SpotifyLogo,
  TiktokLogo,
  YoutubeLogo,
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
import { findFirstLink, removeFirstLink } from '../../utils/links';

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

type LinkPreviewData = {
  status: 'pending' | 'ready' | 'error';
  url: string;
  title?: string;
  description?: string | null;
  image?: string | null;
  siteName?: string;
  favicon?: string | null;
  video?: boolean;
};

const LINK_BRANDS = [
  { domains: ['tiktok.com'], name: 'TikTok', Icon: TiktokLogo, color: '#101013' },
  { domains: ['instagram.com'], name: 'Instagram', Icon: InstagramLogo, color: '#c13584' },
  { domains: ['facebook.com', 'fb.com'], name: 'Facebook', Icon: FacebookLogo, color: '#1877f2' },
  { domains: ['youtube.com', 'youtu.be', 'youtube-nocookie.com'], name: 'YouTube', Icon: YoutubeLogo, color: '#ff0033' },
  { domains: ['reddit.com', 'redd.it'], name: 'Reddit', Icon: RedditLogo, color: '#ff4500' },
  { domains: ['spotify.com'], name: 'Spotify', Icon: SpotifyLogo, color: '#1ed760' },
] as const;

const LinkPreview: React.FC<{
  preview: LinkPreviewData;
  fallbackLink: NonNullable<ReturnType<typeof findFirstLink>>;
  cardClassName: string;
  onPointerDown?: (event: React.PointerEvent<HTMLAnchorElement>) => void;
  onPointerMove?: (event: React.PointerEvent<HTMLAnchorElement>) => void;
  onPointerUp?: (event: React.PointerEvent<HTMLAnchorElement>) => void;
  onPointerCancel?: (event: React.PointerEvent<HTMLAnchorElement>) => void;
  onContextMenu?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  anchorRef?: React.Ref<HTMLAnchorElement>;
}> = ({
  preview,
  fallbackLink,
  cardClassName,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onContextMenu,
  onClick,
  anchorRef,
}) => {
  const { t } = useLanguage();
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [faviconFailed, setFaviconFailed] = useState(false);
  const host = (() => {
    try {
      return new URL(preview.url).hostname.replace(/^www\./i, '');
    } catch {
      return fallbackLink.host;
    }
  })();
  const title = preview.title || host;
  const siteName = preview.siteName || host;
  const image = preview.image && preview.image !== preview.favicon ? preview.image : null;
  const normalizedHost = host.toLowerCase();
  const brand = LINK_BRANDS.find(({ domains }) => domains.some((domain) => (
    normalizedHost === domain || normalizedHost.endsWith(`.${domain}`)
  )));

  useEffect(() => {
    setImageLoaded(false);
    setImageFailed(false);
    setFaviconFailed(false);
  }, [image, preview.favicon]);

  return (
    <a
      ref={anchorRef}
      href={preview.url || fallbackLink.href}
      target="_blank"
      rel="noopener noreferrer"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onContextMenu={onContextMenu}
      onClick={onClick}
      data-link-preview="true"
      className={`mt-1.5 block w-[min(72vw,340px)] max-w-full overflow-hidden border border-white/10 bg-[#202024] text-left shadow-[0_6px_18px_rgba(0,0,0,0.24)] transition-transform active:scale-[0.99] select-none ${cardClassName}`}
      style={{
        WebkitTouchCallout: 'none',
        WebkitUserSelect: 'none',
        userSelect: 'none',
      }}
      aria-label={`${t('Open link to')} ${host}`}
    >
      <div
        className="relative flex aspect-[1.91/1] items-center justify-center overflow-hidden bg-white/[0.06]"
        style={brand ? { backgroundColor: brand.color } : undefined}
      >
        {preview.status === 'pending' && (
          <div aria-hidden="true" className="absolute inset-0 animate-pulse bg-gradient-to-r from-white/[0.02] via-white/[0.11] to-white/[0.02]" />
        )}
        {image && !imageFailed ? (
          <>
            {!imageLoaded && (
              <div aria-hidden="true" className="absolute inset-0 animate-pulse bg-white/[0.08]" />
            )}
            <img
              src={image}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageFailed(true)}
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
            />
          </>
        ) : (
          <div className={`flex h-full w-full items-center justify-center ${
            brand ? '' : 'bg-[radial-gradient(ellipse_at_50%_120%,rgba(10,132,255,0.22),transparent_68%)]'
          }`}>
            {brand ? (
              <brand.Icon size={64} weight="fill" color="white" />
            ) : preview.favicon && !faviconFailed ? (
              <img
                src={preview.favicon}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={() => setFaviconFailed(true)}
                className="h-12 w-12 rounded-xl object-contain"
              />
            ) : (
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 text-white/80">
                <ArrowSquareOut size={22} weight="bold" />
              </span>
            )}
          </div>
        )}
        {brand && image && !imageFailed && (
          <span className="absolute left-2.5 top-2.5 flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white shadow-lg backdrop-blur-sm">
            <brand.Icon size={21} weight="fill" />
          </span>
        )}
        {preview.video && (
          <span className="absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/65 text-white shadow-lg">
            <span className="ml-1 h-0 w-0 border-y-[9px] border-y-transparent border-l-[14px] border-l-white" />
          </span>
        )}
        <span className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white/85">
          <ArrowSquareOut size={15} weight="bold" />
        </span>
      </div>
      <div className="min-w-0 px-3.5 py-3">
        <span className="line-clamp-2 text-sm font-bold leading-snug text-white">
          {preview.status === 'pending' ? t('Loading link preview…') : title}
        </span>
        {preview.status === 'ready' && preview.description && (
          <span className="mt-1 line-clamp-3 text-xs leading-relaxed text-white/65">
            {preview.description}
          </span>
        )}
        <span className="mt-2 flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-white/50">
          {preview.favicon && !faviconFailed && (
            <img src={preview.favicon} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFaviconFailed(true)} className="h-3.5 w-3.5 shrink-0 rounded-sm" />
          )}
          <span className="truncate">{siteName}</span>
        </span>
      </div>
    </a>
  );
};

const renderContentWithMentions = (
  content: string,
  isOwnBubble: boolean,
  members: TripMember[],
  preventLinkNavigation?: () => boolean,
) => {
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
      const link = findFirstLink(rawUrl);
      if (link) {
        parts.push(
          <a
            key={`link-${cursor}`}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            onContextMenu={(event) => event.preventDefault()}
            onClick={(event) => {
              if (preventLinkNavigation?.()) event.preventDefault();
              event.stopPropagation();
            }}
            data-chat-link="true"
            className="break-all underline decoration-current/50 underline-offset-2"
            style={{
              WebkitTouchCallout: 'none',
              WebkitUserSelect: 'none',
              userSelect: 'none',
            }}
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
          style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
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
  const [showReactionDetails, setShowReactionDetails] = useState(false);
  const [reactionDetailsPosition, setReactionDetailsPosition] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const [bubbleRect, setBubbleRect] = useState<DOMRect | null>(null);
  const [showHeartPop, setShowHeartPop] = useState(false);
  const [reactionBurst, setReactionBurst] = useState(0);
  const [replySwipeOffset, setReplySwipeOffset] = useState(0);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const reactionDetailsRef = useRef<HTMLDivElement>(null);
  const reactionBadgeRef = useRef<HTMLButtonElement>(null);
  const reactionPopupRef = useRef<HTMLDivElement>(null);
  const linkPreviewRef = useRef<HTMLAnchorElement>(null);
  const activeBubbleRef = useRef<HTMLElement | null>(null);

  const lastTapTimeRef = useRef<number>(0);
  const pressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const holdPointerIdRef = useRef<number | null>(null);

  const holdListenersCleanupRef = useRef<(() => void) | null>(null);
  const didLongPressRef = useRef(false);
  const didMoveDuringPressRef = useRef(false);
  const replySwipeTriggeredRef = useRef(false);

  const clearLongPress = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
    holdListenersCleanupRef.current?.();
    holdListenersCleanupRef.current = null;
    holdPointerIdRef.current = null;
  };

  const cancelLongPressTimer = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  useEffect(() => () => {
    if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
    holdListenersCleanupRef.current?.();
  }, []);

  useEffect(() => {
    if (!showReactionDetails) return;
    const handleOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node
        && !reactionDetailsRef.current?.contains(event.target)
        && !reactionPopupRef.current?.contains(event.target)) {
        setShowReactionDetails(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowReactionDetails(false);
    };
    document.addEventListener('pointerdown', handleOutsidePointer);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointer);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [showReactionDetails]);

  useLayoutEffect(() => {
    if (!showReactionDetails || !reactionDetailsPosition) return;
    const popup = reactionPopupRef.current;
    const badge = reactionBadgeRef.current?.getBoundingClientRect();
    if (!popup || !badge) return;

    const margin = 16;
    const gap = 8;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const popupRect = popup.getBoundingClientRect();
    const availableBelow = Math.max(0, viewportHeight - margin - badge.bottom - gap);
    const availableAbove = Math.max(0, badge.top - gap - margin);
    const fitsBelow = popupRect.height <= availableBelow;
    const fitsAbove = popupRect.height <= availableAbove;
    const openBelow = fitsBelow || (!fitsAbove && availableBelow >= availableAbove);
    const maxHeight = openBelow ? availableBelow : availableAbove;
    const top = openBelow
      ? badge.bottom + gap
      : Math.max(margin, badge.top - gap - Math.min(popupRect.height, maxHeight));
    const preferredLeft = isOwn ? badge.left : badge.right - popupRect.width;
    const left = Math.min(
      Math.max(margin, preferredLeft),
      Math.max(margin, viewportWidth - popupRect.width - margin),
    );

    if (
      reactionDetailsPosition.top !== top
      || reactionDetailsPosition.left !== left
      || reactionDetailsPosition.maxHeight !== maxHeight
    ) {
      setReactionDetailsPosition({ top, left, maxHeight });
    }
  }, [showReactionDetails, reactionDetailsPosition, isOwn]);

  const toggleReactionDetails = () => {
    if (showReactionDetails) {
      setShowReactionDetails(false);
      return;
    }
    const badge = reactionBadgeRef.current?.getBoundingClientRect();
    if (!badge) return;
    const margin = 12;
    const maxHeight = window.innerHeight - margin * 2;
    setReactionDetailsPosition({ top: badge.bottom + 8, left: badge.left, maxHeight });
    setShowReactionDetails(true);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    clearLongPress();
    didLongPressRef.current = false;
    didMoveDuringPressRef.current = false;
    replySwipeTriggeredRef.current = false;
    activeBubbleRef.current = e.currentTarget instanceof HTMLElement ? e.currentTarget : null;
    holdPointerIdRef.current = e.pointerId;
    startPosRef.current = { x: e.clientX, y: e.clientY };

    const cancelForMovement = (event: PointerEvent) => {
      if (event.pointerId !== holdPointerIdRef.current || !startPosRef.current) return;
      const signedDx = event.clientX - startPosRef.current.x;
      const dx = Math.abs(signedDx);
      const dy = Math.abs(event.clientY - startPosRef.current.y);
      const replySwipeDirection = isOwn ? signedDx < -52 : signedDx > 52;
      if (replySwipeDirection && dy < 38 && !replySwipeTriggeredRef.current) {
        replySwipeTriggeredRef.current = true;
        didLongPressRef.current = true;
        didMoveDuringPressRef.current = true;
        setReplySwipeOffset(isOwn ? -52 : 52);
        clearLongPress();
        startPosRef.current = null;
        onReply(message);
        return;
      }
      if (dx > 8 || dy > 8) {
        didMoveDuringPressRef.current = true;
        cancelLongPressTimer();
      }
    };
    const cancelForRelease = (event: PointerEvent) => {
      if (event.pointerId !== holdPointerIdRef.current) return;
      if (event.type === 'pointercancel') didMoveDuringPressRef.current = true;
      clearLongPress();
      startPosRef.current = null;
      setReplySwipeOffset(0);
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
      const bubbleElement = activeBubbleRef.current || bubbleRef.current || linkPreviewRef.current;
      if (bubbleElement) {
        setBubbleRect(bubbleElement.getBoundingClientRect());
      }
      setShowReactionPicker(true);
    }, 500);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (!startPosRef.current) return;
    const signedDx = e.clientX - startPosRef.current.x;
    const dx = Math.abs(signedDx);
    const dy = Math.abs(e.clientY - startPosRef.current.y);
    const replySwipeDirection = isOwn ? signedDx < -52 : signedDx > 52;
    if (replySwipeDirection && dy < 38) {
      setReplySwipeOffset(isOwn ? Math.max(-52, signedDx) : Math.min(52, signedDx));
    } else {
      setReplySwipeOffset(0);
    }
    if (replySwipeDirection && dy < 38 && !replySwipeTriggeredRef.current) {
      replySwipeTriggeredRef.current = true;
      didLongPressRef.current = true;
      didMoveDuringPressRef.current = true;
      setReplySwipeOffset(isOwn ? -52 : 52);
      clearLongPress();
      startPosRef.current = null;
      onReply(message);
      return;
    }
    if (dx > 8 || dy > 8) {
      didMoveDuringPressRef.current = true;
      cancelLongPressTimer();
    }
  };

  const handlePointerUp = (event?: React.PointerEvent) => {
    event?.stopPropagation();
    clearLongPress();
    startPosRef.current = null;
    setReplySwipeOffset(0);
    if (didLongPressRef.current) {
      return;
    }
    if (event?.target instanceof Element && event.target.closest('a')) {
      lastTapTimeRef.current = 0;
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
    setReplySwipeOffset(0);
  };

  const playReactionBurst = () => {
    setReactionBurst((burst) => burst + 1);
    window.setTimeout(() => setReactionBurst(0), 700);
  };

  const firstLink = findFirstLink(message.content);

  const copyContent = () => {
    navigator.clipboard.writeText(message.content || message.image_url || '');
  };

  const copyLink = () => {
    if (!firstLink) return;
    void navigator.clipboard.writeText(firstLink.href).catch((error) => {
      console.error('Could not copy the link:', error);
    });
  };

  const openLink = () => {
    if (!firstLink) return;
    window.open(firstLink.href, '_blank', 'noopener,noreferrer');
  };

  // Group reactions by kind
  const groupedReactions: {
    kind: Reaction['kind'];
    count: number;
    userHasReacted: boolean;
    userIds: string[];
  }[] = [];
  let userCurrentReaction: Reaction['kind'] | null = null;
  if (message.reactions && message.reactions.length > 0) {
    const map = new Map<Reaction['kind'], { count: number; userHasReacted: boolean; userIds: string[] }>();
    for (const r of message.reactions) {
      const existing = map.get(r.kind) || { count: 0, userHasReacted: false, userIds: [] };
      existing.count += 1;
      existing.userIds.push(r.user_id);
      if (r.user_id === currentUserId) {
        existing.userHasReacted = true;
        userCurrentReaction = r.kind;
      }
      map.set(r.kind, existing);
    }
    for (const [kind, data] of map.entries()) {
      groupedReactions.push({ kind, count: data.count, userHasReacted: data.userHasReacted, userIds: data.userIds });
    }
  }

  const isPollResult = message.type === 'poll_result' && message.metadata;
  const isGameSummary = message.type === 'text' && message.metadata?.gameSummary === true;
  const isImageOnly = message.type === 'image' && Boolean(message.image_url);
  const stickerId = typeof message.metadata?.stickerId === 'string' ? message.metadata.stickerId : null;
  const isSticker = message.type === 'text' && stickerId !== null;
  const callId = message.metadata?.callId;
  const linkPreview = message.metadata?.linkPreview as LinkPreviewData | undefined;
  const canShowLinkPreview = !isImageOnly
    && Boolean(firstLink)
    && (message.type === 'text' || message.type === 'grocery_list' || message.type === 'meal' || message.type === 'plan')
    && !isSticker;
  const visibleLinkPreview: LinkPreviewData | undefined = canShowLinkPreview && firstLink
    ? linkPreview?.status === 'ready' || linkPreview?.status === 'pending'
      ? linkPreview
      : {
          status: linkPreview?.status === 'error' ? 'error' : 'pending',
          url: firstLink.href,
          title: firstLink.host,
          siteName: firstLink.host,
        }
    : undefined;
  const displayContent = canShowLinkPreview && firstLink
    ? removeFirstLink(message.content, firstLink)
    : message.content;
  const hideLinkOnlyBubble = canShowLinkPreview
    && !displayContent
    && (message.type === 'text' || message.type === 'meal' || message.type === 'plan');

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
      <div
        className={`relative flex max-w-[85%] transition-transform duration-150 ease-out ${isOwn ? 'flex-row-reverse items-end' : 'flex-col items-start'}`}
        style={{ transform: `translateX(${replySwipeOffset}px)` }}
      >

        <div className={`relative flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
          {replyMessage && (
            <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
              <div
                className={`mb-0.5 max-w-[min(72vw,320px)] overflow-hidden rounded-[13px] border px-3 py-1.5 text-[11px] leading-snug ${
                  isOwn
                    ? 'border-white/20 bg-[#202024] text-slate-200'
                    : 'border-white/15 bg-[#202024] text-slate-200'
                }`}
              >
                <div className="truncate font-semibold text-white/80">
                  {replyMessage.sender?.display_name || t('Member')}
                </div>
                <div className="reply-preview-content line-clamp-2 break-words text-[11px] leading-snug text-white/65">
                  {replyMessage.content || t('Attachment')}
                </div>
              </div>
            </div>
          )}
          {/* Reaction Picker overlay */}
          {showReactionPicker && (
            <ReactionPicker
              message={message}
              isOwnMessage={isOwn}
              bubbleRect={bubbleRect}
              bubbleElement={activeBubbleRef.current || bubbleRef.current || linkPreviewRef.current}
              currentReaction={userCurrentReaction}
              onReact={(kind) => {
                onReact(message.id, kind);
                playReactionBurst();
              }}
              onReply={() => onReply(message)}
              onCopy={copyContent}
              linkUrl={firstLink?.href}
              onCopyLink={firstLink ? copyLink : undefined}
              onOpenLink={firstLink ? openLink : undefined}
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
                if (!didLongPressRef.current) onOpenImage?.(message.image_url!);
              }}
              className="chat-bubble-touch cursor-pointer relative bg-transparent p-0 transition-opacity active:opacity-90 flex flex-col gap-1.5 [touch-action:pan-y] select-none"
              style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
            >
              <img
                src={message.image_url!}
                alt="Attachment"
                className="rounded-[22px] max-h-80 w-auto object-cover select-none shadow-md block"
              />
              {message.content && (
                <p className="min-w-0 max-w-full px-1.5 text-base text-white whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                  {renderContentWithMentions(message.content, isOwn, members, () => didLongPressRef.current)}
                </p>
              )}
            </div>
          ) : (
            <div className="relative min-w-0 max-w-full [overflow-wrap:anywhere]">
              {!hideLinkOnlyBubble && (
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
                      : `px-4 py-2.5 text-[16px] leading-[1.4] border border-white/10 ${getBubbleRadiusClasses()} ${
                        isOwn
                          ? 'bg-[#0A84FF] text-white shadow-xs'
                          : 'bg-[#262629] text-white shadow-xs'
                        } ${canShowLinkPreview ? 'min-w-[min(72vw,340px)]' : ''}`
                  }`}
                >
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
                    <p className="whitespace-pre-wrap break-words">{renderContentWithMentions(displayContent, isOwn, members, () => didLongPressRef.current)}</p>
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
                    {renderContentWithMentions(displayContent, isOwn, members, () => didLongPressRef.current)}
                  </p>
                )}
                </div>
              )}
              {canShowLinkPreview && firstLink && visibleLinkPreview && (
                <LinkPreview
                  preview={visibleLinkPreview}
                  fallbackLink={firstLink}
                  cardClassName={getBubbleRadiusClasses()}
                  anchorRef={linkPreviewRef}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerCancel}
                  onContextMenu={handleContextMenu}
                  onClick={(event) => {
                    if (didLongPressRef.current) event.preventDefault();
                  }}
                />
              )}
            </div>
          )}

          {/* Circular Badge on top corner of bubble */}
          {groupedReactions.length > 0 && (
            <div
              ref={reactionDetailsRef}
              className={`absolute -top-3 z-30 ${
                isOwn ? '-left-2' : '-right-2'
              }`}
            >
              <button
                ref={reactionBadgeRef}
                type="button"
                aria-label={t('View message reactions')}
                aria-expanded={showReactionDetails}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleReactionDetails();
                }}
                className="flex items-center gap-1 rounded-full border border-white/15 px-2 py-0.5 shadow-[0_4px_12px_rgba(0,0,0,0.3)] select-none animate-calm-fade-in"
                style={{
                  background: 'rgba(30, 30, 35, 0.92)',
                  backdropFilter: 'blur(20px) saturate(180%)',
                  WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                }}
              >
                {groupedReactions.slice(0, 2).map(({ kind, count, userHasReacted }) => {
                  const Icon = REACTION_ICON_MAP[kind];
                  return (
                    <span key={kind} className="flex items-center gap-1 text-white">
                      <Icon
                        size={15}
                        weight={userHasReacted ? 'fill' : 'regular'}
                        className={userHasReacted ? 'text-[#0A84FF]' : 'text-white'}
                      />
                      {count > 1 && <span className="text-[11px] font-bold text-slate-200">{count}</span>}
                    </span>
                  );
                })}
              </button>
              {showReactionDetails && reactionDetailsPosition && createPortal(
                <div
                  ref={reactionPopupRef}
                  className="fixed z-[13000] box-border w-max max-w-[calc(100vw-2rem)] space-y-2 overflow-y-auto overscroll-contain rounded-[22px] border border-white/[0.14] bg-[#1c1c20]/95 p-3 shadow-[0_16px_40px_rgba(0,0,0,0.55)] backdrop-blur-2xl animate-spring-in"
                  style={{
                    top: reactionDetailsPosition.top,
                    left: reactionDetailsPosition.left,
                    maxHeight: reactionDetailsPosition.maxHeight,
                  }}
                >
                  {groupedReactions.map(({ kind, userIds }) => {
                    const Icon = REACTION_ICON_MAP[kind];
                    const profiles = userIds
                      .map((id) => members.find((member) => member.user_id === id)?.profile)
                      .filter((profile): profile is NonNullable<typeof profile> => Boolean(profile));
                    return (
                      <div key={kind} className="flex items-center gap-2.5">
                        <Icon size={17} weight="fill" className="shrink-0 text-[#0A84FF]" />
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                          {profiles.map((profile) => (
                            <button
                              key={profile.id}
                              type="button"
                              aria-label={`${t('View profile')}: ${profile.display_name}`}
                              onClick={() => {
                                setShowReactionDetails(false);
                                onProfileClick?.(profile.id);
                              }}
                              className="rounded-full"
                            >
                              <Avatar
                                name={profile.display_name}
                                avatarUrl={profile.avatar_url}
                                color={profile.color}
                                size={28}
                              />
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>,
                document.body,
              )}
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
            className="rounded-full"
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
