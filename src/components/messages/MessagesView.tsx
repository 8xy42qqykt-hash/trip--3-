import React, { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowUp,
  Plus,
  Image as ImageIcon,
  ChartBar,
  X,
  CaretLeft,
  Phone,
  PhoneCall,
  VideoCamera,
  ShoppingCart,
  ForkKnife,
  CalendarBlank,
  GameController,
  CircleNotch,
  Trophy,
  At,
  Hash,
  Smiley,
} from '@phosphor-icons/react';
import { useTrip } from '../../context/TripContext';
import { useAuth } from '../../context/AuthContext';
import { Message, TripMember } from '../../types';
import { ChatBubble } from './ChatBubble';
import { PinnedPolls } from './PinnedPolls';
import { PollSheet } from './PollSheet';
import { Avatar } from '../common/Avatar';
import { TripMemberStack } from '../common/TripMemberStack';
import { MemberProfileSheet } from '../common/MemberProfileSheet';
import { BottomSheet } from '../common/BottomSheet';
import { PhotoLightbox } from '../common/PhotoLightbox';
import { CustomScrollArea } from '../common/CustomScrollArea';
import { formatMessageDaySeparator, formatTripDate } from '../../utils/date';
import { supabase, uploadAsset } from '../../lib/supabase';
import { OnlineTripMember } from './useTripPresence';
import { GroupCallManager } from './useGroupCall';
import { useTripLocations } from '../trip/useTripLocations';
import { DrawGuessGame } from './DrawGuessGame';
import { TripGameSession } from './TripGameSession';
import { useLanguage } from '../../context/LanguageContext';
import { CHAT_STICKERS, StickerArtwork } from './StickerArtwork';
import tripLogo from '../../../trip-logo.png';
import { findFirstLink } from '../../utils/links';

interface MessagesViewProps {
  viewMode?: 'messages' | 'grocery_list' | 'plan' | 'games';
  gameOpenRequest?: { id: string; type: 'draw_game' | 'game_session'; requestId: number } | null;
  onGameOpenRequestHandled?: () => void;
  onKeyboardStateChange?: (isOpen: boolean) => void;
  onPhotoViewerChange?: (isOpen: boolean) => void;
  initialMention?: string;
  onClearInitialMention?: () => void;
  onlineMembers: OnlineTripMember[];
  call: GroupCallManager;
}

const AnimatedScore: React.FC<{ score: number }> = ({ score }) => {
  const [displayedScore, setDisplayedScore] = useState(0);

  useEffect(() => {
    let frame = 0;
    const startedAt = performance.now();
    const duration = 850;
    const animate = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      setDisplayedScore(Math.floor(score * progress));
      if (progress < 1) frame = window.requestAnimationFrame(animate);
    };
    frame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frame);
  }, [score]);

  return (
    <motion.span
      initial={{ scale: 0.86, opacity: 0.55 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 360, damping: 24 }}
      className="tabular-nums"
    >
      {displayedScore}
    </motion.span>
  );
};

export const MessagesView: React.FC<MessagesViewProps> = ({
  viewMode = 'messages',
  gameOpenRequest,
  onGameOpenRequestHandled,
  onKeyboardStateChange,
  onPhotoViewerChange,
  initialMention,
  onClearInitialMention,
  onlineMembers,
  call,
}) => {
  const { t } = useLanguage();
  const {
    currentTrip,
    tripMembers,
    messages,
    isLoadingMessages,
    polls,
    sendMessage,
    updateMessage,
    deleteMessage,
    toggleReaction,
    createPoll,
    votePoll,
    endPoll,
    exitTrip,
  } = useTrip();
  const { user } = useAuth();
  const sharedLocations = useTripLocations(currentTrip?.id);

  const [inputText, setInputText] = useState('');
  const [resolvedLinkPreviews, setResolvedLinkPreviews] = useState<Record<string, Record<string, unknown>>>({});
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [isPlusMenuOpen, setIsPlusMenuOpen] = useState(false);
  const plusButtonRef = useRef<HTMLButtonElement>(null);
  const [composerMode, setComposerMode] = useState<'message' | 'grocery_list' | 'meal' | 'plan'>(
    viewMode === 'messages' || viewMode === 'games' ? 'message' : viewMode,
  );
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [mealTime, setMealTime] = useState('');
  const [planDate, setPlanDate] = useState('');
  const [planTime, setPlanTime] = useState('');
  const [draftCheckedItems, setDraftCheckedItems] = useState<number[]>([]);
  const [isPollSheetOpen, setIsPollSheetOpen] = useState(false);
  const [isStickerPickerOpen, setIsStickerPickerOpen] = useState(false);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [isCallMenuOpen, setIsCallMenuOpen] = useState(false);
  const callButtonRef = useRef<HTMLButtonElement>(null);
  const [callMenuPosition, setCallMenuPosition] = useState<{ top: number; right: number } | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const uploadInProgressRef = useRef(false);
  const sendInProgressRef = useRef(false);
  const [isSending, setIsSending] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState<{ id: string; previewUrl: string; file: File } | null>(null);
  const [composerError, setComposerError] = useState('');
  const [activeDrawGameId, setActiveDrawGameId] = useState<string | null>(null);
  const [activeGameSessionId, setActiveGameSessionId] = useState<string | null>(null);
  const [isGamesMenuOpen, setIsGamesMenuOpen] = useState(false);
  const gamesButtonRef = useRef<HTMLButtonElement>(null);
  const [isGameScoreboardOpen, setIsGameScoreboardOpen] = useState(false);
  const [isLoadingGameScores, setIsLoadingGameScores] = useState(false);
  const [gameScoreError, setGameScoreError] = useState('');
  const [gameScores, setGameScores] = useState<Array<{ userId: string; name: string; avatarUrl: string | null; color: string; score: number }>>([]);
  const [isTitleCollapsed, setIsTitleCollapsed] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [isComposerFocused, setIsComposerFocused] = useState(false);
  const [isTextareaMultiline, setIsTextareaMultiline] = useState(false);
  const [messageRevealPhase, setMessageRevealPhase] = useState<'waiting' | 'loading' | 'revealing' | 'shown'>('waiting');
  const [showMessageLoader, setShowMessageLoader] = useState(false);
  const scrollContentRef = useRef<HTMLDivElement>(null);
  const keepScrollAtBottomRef = useRef(false);
  const latestMessagesRef = useRef(messages);
  const pendingLinkPreviewRequestsRef = useRef(new Set<string>());
  latestMessagesRef.current = messages;

  // Virtual keyboard tracking for mobile (using accurate visualViewport bottom offset)
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const isInputFocusedRef = useRef(false);
  const blurTimerRef = useRef<number | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerFormRef = useRef<HTMLFormElement>(null);
  const [mentionListPosition, setMentionListPosition] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
    composerTop: number;
    composerBottom: number;
  } | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const mealTimeInputRef = useRef<HTMLInputElement>(null);
  const planDateInputRef = useRef<HTMLInputElement>(null);
  const planTimeInputRef = useRef<HTMLInputElement>(null);
  const isFilteredView = viewMode !== 'messages' && viewMode !== 'games';
  const isGamesView = viewMode === 'games';
  const pageTitle = isFilteredView
    ? viewMode === 'grocery_list' ? t('Groceries') : t('Plans')
    : isGamesView ? t('Games') : currentTrip?.name || '';
  const seenCallIdsRef = useRef(new Set<string>());
  const trackedCallRef = useRef<{ callId: string; startedAt: number } | null>(null);

  useEffect(() => {
    if (!isGamesView || !currentTrip) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('trip') !== currentTrip.id || url.searchParams.get('view') !== 'games') return;
    const sessionId = url.searchParams.get('gameSessionId');
    const drawId = url.searchParams.get('drawGameId');
    if (sessionId) setActiveGameSessionId(sessionId);
    if (drawId) setActiveDrawGameId(drawId);
    if (sessionId || drawId) {
      url.searchParams.delete('gameSessionId');
      url.searchParams.delete('drawGameId');
      window.history.replaceState(window.history.state, '', url);
    }
  }, [currentTrip?.id, isGamesView]);

  useEffect(() => {
    if (!isGamesView || !gameOpenRequest) return;
    if (gameOpenRequest.type === 'draw_game') setActiveDrawGameId(gameOpenRequest.id);
    else setActiveGameSessionId(gameOpenRequest.id);
    onGameOpenRequestHandled?.();
  }, [gameOpenRequest, isGamesView, onGameOpenRequestHandled]);

  useEffect(() => {
    if (isFilteredView || isGamesView) return;
    const activeCall = call.activeCall;
    if (activeCall) {
      trackedCallRef.current = { callId: activeCall.callId, startedAt: activeCall.startedAt };
      const callMessage = messages.find((message) => (
        message.type === 'call' && message.metadata?.callId === activeCall.callId
      ));
      const participantIds = call.participants.map((participant) => participant.userId);
      if (!callMessage) {
        if (!seenCallIdsRef.current.has(activeCall.callId)) {
          seenCallIdsRef.current.add(activeCall.callId);
          void sendMessage(
            activeCall.kind === 'video' ? 'Video call started' : 'Voice call started',
            undefined,
            undefined,
            'call',
            {
              callId: activeCall.callId,
              kind: activeCall.kind,
              status: 'active',
              startedAt: new Date(activeCall.startedAt).toISOString(),
              participantIds,
              activeParticipantIds: participantIds,
            },
          ).catch((error: unknown) => {
            console.error('Could not save call message:', error);
            setComposerError(error instanceof Error ? error.message : t('Could not save the call in chat.'));
          });
        }
        return;
      }
      const participantHistory = Array.from(new Set([
        ...(callMessage.metadata?.participantIds || []),
        ...participantIds,
      ]));
      if (
        JSON.stringify(callMessage.metadata?.participantIds || []) !== JSON.stringify(participantHistory)
        || JSON.stringify(callMessage.metadata?.activeParticipantIds || []) !== JSON.stringify(participantIds)
      ) {
        void updateMessage(callMessage.id, {
          content: callMessage.content,
          type: 'call',
          metadata: {
            ...callMessage.metadata,
            participantIds: participantHistory,
            activeParticipantIds: participantIds,
            status: 'active',
          },
        }).catch((error: unknown) => {
          console.error('Could not update call participant history:', error);
          setComposerError(error instanceof Error ? error.message : t('Could not update call participants.'));
        });
      }
      return;
    }

    const trackedCall = trackedCallRef.current;
    const lastCallState = call.lastCallState;
    if (!trackedCall && !lastCallState?.ended) return;
    const callId = trackedCall?.callId || lastCallState!.callId;
    const callMessage = messages.find((message) => (
      message.type === 'call' && message.metadata?.callId === callId
    ));
    if (!callMessage) return;
    if (trackedCall) {
      trackedCallRef.current = null;
      seenCallIdsRef.current.delete(trackedCall.callId);
    }
    const matchingCallState = lastCallState?.callId === callId ? lastCallState : null;
    if (!matchingCallState) return;
    const participantHistory = Array.from(new Set([
      ...(callMessage.metadata?.participantIds || []),
      ...matchingCallState.participantIds,
    ]));
    if (!matchingCallState.ended) {
      if (
        callMessage.metadata?.status === 'active'
        && JSON.stringify(callMessage.metadata?.participantIds || []) === JSON.stringify(participantHistory)
        && JSON.stringify(callMessage.metadata?.activeParticipantIds || []) === JSON.stringify(matchingCallState.activeParticipantIds)
      ) return;
      void updateMessage(callMessage.id, {
        content: callMessage.content,
        type: 'call',
        metadata: {
          ...callMessage.metadata,
          status: 'active',
          participantIds: participantHistory,
          activeParticipantIds: matchingCallState.activeParticipantIds,
        },
      }).catch((error: unknown) => {
        console.error('Could not update call status:', error);
        setComposerError(error instanceof Error ? error.message : t('Could not update the call card.'));
      });
      return;
    }
    if (callMessage.metadata?.status === 'ended') return;
    void updateMessage(callMessage.id, {
      content: callMessage.content,
      type: 'call',
      metadata: {
        ...callMessage.metadata,
        status: 'ended',
        endedAt: new Date().toISOString(),
        durationSeconds: Math.max(0, Math.floor((Date.now() - (trackedCall?.startedAt || matchingCallState.startedAt)) / 1000)),
        participantIds: participantHistory,
        activeParticipantIds: [],
      },
    }).catch((error: unknown) => {
      console.error('Could not update call status:', error);
      setComposerError(error instanceof Error ? error.message : t('Could not update the call card.'));
    });
  }, [call.activeCall, call.lastCallState, call.participants, isFilteredView, isGamesView, messages, sendMessage, t, updateMessage]);

  // Auto-mention if passed from members list or settings
  useEffect(() => {
    if (initialMention) {
      const mentionStr = `@${initialMention} `;
      setInputText(mentionStr);
      if (onClearInitialMention) {
        onClearInitialMention();
      }
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus({ preventScroll: true });
          const len = mentionStr.length;
          textareaRef.current.setSelectionRange(len, len);
          textareaRef.current.style.height = 'auto';
          const scrollH = textareaRef.current.scrollHeight;
          textareaRef.current.style.height = `${Math.max(40, scrollH)}px`;
        }
        isInputFocusedRef.current = true;
        setIsComposerFocused(true);
        notifyKeyboard(true);
      }, 80);
    }
  }, [initialMention, onClearInitialMention]);

  const notifyKeyboard = (open: boolean) => {
    setIsKeyboardOpen(open);
    if (onKeyboardStateChange) {
      onKeyboardStateChange(open);
    }
    window.dispatchEvent(new CustomEvent('trip:keyboard-toggle', { detail: { isOpen: open } }));
  };

  const calcKeyboardOffset = () => {
    if (typeof window === 'undefined') return 0;
    const vv = window.visualViewport;
    if (!vv) return 0;
    // Difference between window layout bottom and visual viewport bottom
    const offset = window.innerHeight - (vv.offsetTop + vv.height);
    return Math.max(0, Math.round(offset));
  };

  const handleFocus = () => {
    if (blurTimerRef.current !== null) {
      window.clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
    isInputFocusedRef.current = true;
    setIsComposerFocused(true);
    notifyKeyboard(true);
    const offset = calcKeyboardOffset();
    setKeyboardOffset(offset);
    window.setTimeout(() => {
      setKeyboardOffset(calcKeyboardOffset());
    }, 60);
  };

  const handleBlur = () => {
    if (blurTimerRef.current !== null) window.clearTimeout(blurTimerRef.current);
    blurTimerRef.current = window.setTimeout(() => {
      blurTimerRef.current = null;
      const offset = calcKeyboardOffset();
      if (document.activeElement === textareaRef.current || offset > 20) {
        return;
      }
      isInputFocusedRef.current = false;
      setIsComposerFocused(false);
      setMentionQuery(null);
      notifyKeyboard(false);
      setKeyboardOffset(0);
    }, 260);
  };

  useEffect(() => () => {
    if (blurTimerRef.current !== null) window.clearTimeout(blurTimerRef.current);
  }, []);

  // Track visualViewport for iOS and mobile keyboard changes
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleViewportChange = () => {
      const offset = calcKeyboardOffset();
      const isFocused = document.activeElement === textareaRef.current || isInputFocusedRef.current;
      const isOpen = isFocused || offset > 30;

      setIsKeyboardOpen(isOpen);
      if (onKeyboardStateChange) {
        onKeyboardStateChange(isOpen);
      }
      window.dispatchEvent(new CustomEvent('trip:keyboard-toggle', { detail: { isOpen } }));

      if (isOpen) {
        setKeyboardOffset(offset);
      } else {
        setKeyboardOffset(0);
      }
    };

    window.visualViewport?.addEventListener('resize', handleViewportChange);
    window.visualViewport?.addEventListener('scroll', handleViewportChange);
    window.addEventListener('resize', handleViewportChange);

    return () => {
      window.visualViewport?.removeEventListener('resize', handleViewportChange);
      window.visualViewport?.removeEventListener('scroll', handleViewportChange);
      window.removeEventListener('resize', handleViewportChange);
    };
  }, [onKeyboardStateChange]);

  // Auto-scroll on new messages
  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      setIsAtBottom(true);
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages.length]);

  useEffect(() => {
    if (isLoadingMessages) return;
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      scrollToBottom();
      secondFrame = window.requestAnimationFrame(scrollToBottom);
    });
    const settleTimer = window.setTimeout(scrollToBottom, 180);
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      window.clearTimeout(settleTimer);
    };
  }, [viewMode, messages.length, isLoadingMessages]);

  useEffect(() => {
    if (!isGamesView || isLoadingMessages || !scrollRef.current || !scrollContentRef.current) return;
    keepScrollAtBottomRef.current = true;
    const scrollAfterLayout = () => {
      if (keepScrollAtBottomRef.current) scrollToBottom();
    };
    const observer = new ResizeObserver(scrollAfterLayout);
    observer.observe(scrollRef.current);
    observer.observe(scrollContentRef.current);
    const firstFrame = window.requestAnimationFrame(scrollAfterLayout);
    const secondFrame = window.requestAnimationFrame(scrollAfterLayout);
    const settleTimer = window.setTimeout(() => {
      scrollAfterLayout();
      keepScrollAtBottomRef.current = false;
    }, 1800);
    return () => {
      keepScrollAtBottomRef.current = false;
      observer.disconnect();
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      window.clearTimeout(settleTimer);
    };
  }, [isGamesView, isLoadingMessages, messages.length]);

  useEffect(() => {
    if (isLoadingMessages) {
      const loaderDelay = window.setTimeout(() => {
        setShowMessageLoader(true);
        setMessageRevealPhase('loading');
      }, 250);
      return () => window.clearTimeout(loaderDelay);
    }
    setMessageRevealPhase('revealing');
  }, [isLoadingMessages]);

  useEffect(() => {
    if (messageRevealPhase !== 'revealing') return;
    const revealDuration = Math.min(messages.length, 5) * 140 + 1000;
    const timer = window.setTimeout(() => {
      setMessageRevealPhase('shown');
      setShowMessageLoader(false);
    }, revealDuration);
    return () => window.clearTimeout(timer);
  }, [messageRevealPhase, messages.length]);

  useEffect(() => {
    const previewableMessages = messages.filter((message) => (
      ['text', 'grocery_list', 'meal', 'plan'].includes(message.type)
      && Boolean(findFirstLink(message.content))
    ));

    for (const message of previewableMessages) {
      const firstLink = findFirstLink(message.content);
      if (!firstLink) continue;
      const existingPreview = message.metadata?.linkPreview;
      if (
        existingPreview?.status === 'ready'
        && typeof existingPreview.title === 'string'
        && typeof existingPreview.siteName === 'string'
      ) continue;
      if (existingPreview?.status === 'pending' && message.user_id !== user?.id) continue;

      const requestKey = `${message.id}:${firstLink.href}`;
      if (pendingLinkPreviewRequestsRef.current.has(requestKey)) continue;
      pendingLinkPreviewRequestsRef.current.add(requestKey);

      const resolvePreview = async () => {
        let linkPreview: Record<string, unknown>;
        if (!supabase) {
          linkPreview = {
            status: 'error',
            url: firstLink.href,
            title: firstLink.host,
            siteName: firstLink.host,
          };
        } else {
          try {
            const { data, error } = await supabase.functions.invoke('link-preview', {
              body: { url: firstLink.href },
            });
            if (
              error
              || !data
              || typeof data.title !== 'string'
              || typeof data.siteName !== 'string'
            ) {
              if (error) console.warn('Could not load link preview:', error.message);
              linkPreview = {
                status: 'error',
                url: firstLink.href,
                title: firstLink.host,
                siteName: firstLink.host,
              };
            } else {
              linkPreview = { ...data, status: 'ready' };
            }
          } catch (error) {
            console.warn('Could not load link preview:', error);
            linkPreview = {
              status: 'error',
              url: firstLink.href,
              title: firstLink.host,
              siteName: firstLink.host,
            };
          }
        }

        setResolvedLinkPreviews((previous) => ({
          ...previous,
          [message.id]: linkPreview,
        }));

        const latestMessage = latestMessagesRef.current.find((candidate) => candidate.id === message.id);
        if (
          !user
          || message.user_id !== user.id
          || !latestMessage
          || findFirstLink(latestMessage.content)?.href !== firstLink.href
        ) return;
        const latestPreview = latestMessage.metadata?.linkPreview;
        if (
          latestPreview?.status === 'ready'
          && typeof latestPreview.title === 'string'
          && typeof latestPreview.siteName === 'string'
        ) return;

        try {
          await updateMessage(latestMessage.id, {
            content: latestMessage.content,
            type: latestMessage.type,
            metadata: { ...latestMessage.metadata, linkPreview },
          });
        } catch (error) {
          console.error('Could not save link preview metadata:', error);
        }
      };

      void resolvePreview();
    }
  }, [messages, updateMessage, user]);

  useEffect(() => {
    if (!isKeyboardOpen || !isInputFocusedRef.current) return;

    let frame = window.requestAnimationFrame(() => {
      scrollToBottom();
      frame = window.requestAnimationFrame(scrollToBottom);
    });
    const settleTimer = window.setTimeout(scrollToBottom, 180);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(settleTimer);
    };
  }, [isKeyboardOpen, keyboardOffset]);

  useEffect(() => () => {
    if (pendingPhoto) URL.revokeObjectURL(pendingPhoto.previewUrl);
  }, [pendingPhoto]);

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputText(val);

    // Check for @mention query at cursor position
    const cursorPos = e.target.selectionStart ?? val.length;
    const textBeforeCursor = val.slice(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf('@');
    const textBeforeAt = atIndex >= 0 ? textBeforeCursor.slice(0, atIndex) : '';
    const mentionQueryText = atIndex >= 0 ? textBeforeCursor.slice(atIndex + 1) : '';
    if (
      atIndex >= 0
      && (!textBeforeAt || /\s$/.test(textBeforeAt))
      && !/[\n@]/.test(mentionQueryText)
      && !/^photo$/i.test(mentionQueryText)
      && !/\s$/.test(mentionQueryText)
    ) {
      setMentionQuery(mentionQueryText);
    } else {
      setMentionQuery(null);
    }

    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const scrollH = textarea.scrollHeight;
      const height = Math.max(40, scrollH);
      textarea.style.height = `${height}px`;
      setIsTextareaMultiline(height > 42);
    }
  };

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const height = Math.max(40, textarea.scrollHeight);
    textarea.style.height = `${height}px`;
    setIsTextareaMultiline(height > 42);
  }, [inputText, composerMode]);

  const handleSelectMention = (member: TripMember) => {
    const name = member.profile?.display_name || t('Member');
    const textarea = textareaRef.current;
    const cursorPos = textarea ? textarea.selectionStart : inputText.length;
    const textBeforeCursor = inputText.slice(0, cursorPos);
    const textAfterCursor = inputText.slice(cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf('@');
    const textBeforeAt = atIndex >= 0 ? textBeforeCursor.slice(0, atIndex) : textBeforeCursor;
    if (atIndex >= 0 && textBeforeAt && !/\s$/.test(textBeforeAt)) return;
    const replacedBefore = `${textBeforeAt}@${name} `;

    const newText = replacedBefore + textAfterCursor;
    setInputText(newText);
    setMentionQuery(null);
    textarea?.focus({ preventScroll: true });

    window.setTimeout(() => {
      if (textareaRef.current) {
        const newPos = replacedBefore.length;
        textareaRef.current.setSelectionRange(newPos, newPos);
        textareaRef.current.style.height = 'auto';
        const scrollH = textareaRef.current.scrollHeight;
        textareaRef.current.style.height = `${Math.max(40, scrollH)}px`;
      }
    }, 20);
  };

  const insertComposerToken = (token: '@' | '#') => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const nextText = `${inputText.slice(0, start)}${token}${inputText.slice(end)}`;
    const nextCursor = start + token.length;
    setInputText(nextText);
    const hasMentionBoundary = start === 0 || /\s/.test(inputText[start - 1]);
    setMentionQuery(token === '@' && hasMentionBoundary ? '' : null);
    textarea.focus({ preventScroll: true });
    window.requestAnimationFrame(() => {
      textarea.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const openStickerPicker = () => {
    textareaRef.current?.blur();
    isInputFocusedRef.current = false;
    setIsComposerFocused(false);
    notifyKeyboard(false);
    setIsKeyboardOpen(false);
    setKeyboardOffset(0);
    setMentionQuery(null);
    setIsStickerPickerOpen(true);
  };

  const handleSendSticker = async (stickerId: string) => {
    try {
      await sendMessage('sticker', undefined, undefined, 'text', { stickerId });
      setIsStickerPickerOpen(false);
    } catch (error) {
      console.error('Could not send sticker:', error);
      setComposerError(error instanceof Error ? error.message : 'Could not send the sticker. Try again.');
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (sendInProgressRef.current || uploadingImage || uploadInProgressRef.current) return;
    const typedText = inputText.trim();
    const clean = pendingPhoto
      ? typedText.replace(/(?:^|\s)@photo(?=\s|$)/gi, ' ').trim()
      : typedText;
    if ((!clean && !pendingPhoto) || (composerMode === 'plan' && !planDate)) return;
    setComposerError('');
    const replyId = replyingTo?.id;
    const type = pendingPhoto ? 'text' : composerMode === 'message' ? 'text' : composerMode;
    const editing = !pendingPhoto && editingMessageId ? messages.find((message) => message.id === editingMessageId) : undefined;
    const previousMetadata = { ...(editing?.metadata || {}) };
    delete previousMetadata.linkPreview;
    const firstLink = findFirstLink(clean);
    const previousCheckedByText = new Map<string, boolean[]>();
    for (const item of previousMetadata.items || []) {
      const matchingItems = previousCheckedByText.get(item.text) || [];
      matchingItems.push(Boolean(item.checked));
      previousCheckedByText.set(item.text, matchingItems);
    }
    const baseMetadata = pendingPhoto
      ? undefined
      : composerMode === 'grocery_list'
        ? {
            items: clean.split(/\r?\n/).map((text) => text.trim()).filter(Boolean).map((text, index) => ({
              text,
              checked: draftCheckedItems.includes(index) || previousCheckedByText.get(text)?.shift() || false,
            })),
          }
        : composerMode === 'meal'
          ? { ...previousMetadata, time: mealTime || null, cooks: previousMetadata.cooks || [] }
          : composerMode === 'plan'
            ? { ...previousMetadata, date: planDate, time: planTime || null, contributors: previousMetadata.contributors || [] }
            : undefined;
    const metadata = pendingPhoto
      ? undefined
      : firstLink
        ? {
            ...(baseMetadata || {}),
            linkPreview: {
              status: 'pending',
              url: firstLink.href,
              requestId: crypto.randomUUID(),
            },
          }
        : baseMetadata;
    if (pendingPhoto) uploadInProgressRef.current = true;
    sendInProgressRef.current = true;
    setUploadingImage(Boolean(pendingPhoto));
    setIsSending(Boolean(pendingPhoto));
    const sendingIndicatorTimer = pendingPhoto
      ? null
      : window.setTimeout(() => setIsSending(true), 250);
    try {
      if (pendingPhoto) {
        const imageUrl = await uploadAsset(pendingPhoto.file, 'chat');
        await sendMessage('', imageUrl, replyId);
        URL.revokeObjectURL(pendingPhoto.previewUrl);
        setPendingPhoto(null);
        if (clean) {
          setInputText(clean);
          await sendMessage(
            clean,
            undefined,
            undefined,
            'text',
            firstLink
              ? {
                  linkPreview: {
                    status: 'pending',
                    url: firstLink.href,
                    requestId: crypto.randomUUID(),
                  },
                }
              : undefined,
          );
        }
      } else if (editingMessageId) {
        await updateMessage(editingMessageId, { content: clean, type, metadata });
        setEditingMessageId(null);
      } else {
        await sendMessage(clean, undefined, replyId, type, metadata);
      }
      setInputText('');
      setMentionQuery(null);
      setReplyingTo(null);
      if (textareaRef.current) {
        textareaRef.current.style.height = '40px';
        textareaRef.current.focus({ preventScroll: true });
      }
      isInputFocusedRef.current = true;
      setIsComposerFocused(true);
      notifyKeyboard(true);
    } catch (error) {
      console.error('Could not send or update the chat message:', error);
      setComposerError(error instanceof Error ? error.message : 'Could not send the message. Try again.');
      return;
    } finally {
      if (sendingIndicatorTimer !== null) window.clearTimeout(sendingIndicatorTimer);
      sendInProgressRef.current = false;
      uploadInProgressRef.current = false;
      setUploadingImage(false);
      setIsSending(false);
    }
    setComposerMode(isFilteredView ? viewMode : 'message');
    setDraftCheckedItems([]);
    setMealTime('');
    setPlanDate('');
    setPlanTime('');
    setTimeout(scrollToBottom, 50);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      setMentionQuery(null);
      return;
    }
    if (e.key === 'Backspace' && pendingPhoto) {
      const cursor = e.currentTarget.selectionStart;
      const beforeCursor = inputText.slice(0, cursor);
      const photoToken = /(?:^|\s)@photo\s?$/i.exec(beforeCursor);
      if (photoToken) {
        e.preventDefault();
        const tokenStart = photoToken.index + (photoToken[0].startsWith(' ') ? 1 : 0);
        const nextText = `${inputText.slice(0, tokenStart)}${inputText.slice(cursor)}`.trimEnd();
        URL.revokeObjectURL(pendingPhoto.previewUrl);
        setPendingPhoto(null);
        setInputText(nextText);
        window.requestAnimationFrame(() => textareaRef.current?.focus({ preventScroll: true }));
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && composerMode !== 'grocery_list') {
      e.preventDefault();
      handleSend();
      // Ensure focus remains on textarea without scrolling page
      textareaRef.current?.focus({ preventScroll: true });
    }
  };

  // Only dismiss keyboard if user taps empty space on the message view
  const handleEmptySpaceTap = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (
      target.closest('button') ||
      target.closest('textarea') ||
      target.closest('input') ||
      target.closest('.chat-bubble-touch') ||
      target.closest('.reaction-bar') ||
      target.closest('.action-menu') ||
      target.closest('.mention-autocomplete-item')
    ) {
      return;
    }
    if (isInputFocusedRef.current || document.activeElement === textareaRef.current) {
      isInputFocusedRef.current = false;
      setIsComposerFocused(false);
      textareaRef.current?.blur();
      notifyKeyboard(false);
      setKeyboardOffset(0);
      setMentionQuery(null);
    }
  };

  const handleImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (pendingPhoto) URL.revokeObjectURL(pendingPhoto.previewUrl);
    const previewUrl = URL.createObjectURL(file);
    setPendingPhoto({ id: `pending-photo-${Date.now()}`, previewUrl, file });
    setIsPlusMenuOpen(false);
    const currentText = (pendingPhoto
      ? inputText.replace(/(?:^|\s)@photo(?=\s|$)/gi, ' ')
      : inputText).trimEnd();
    const nextText = currentText ? `${currentText} @photo ` : '@photo ';
    setInputText(nextText);
    window.setTimeout(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(nextText.length, nextText.length);
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.max(40, textarea.scrollHeight)}px`;
    }, 20);
    if (photoInputRef.current) photoInputRef.current.value = '';
  };

  const handleDoubleTapHeart = (messageId: string) => {
    toggleReaction(messageId, 'Heart');
  };

  const handleEditMessage = (message: Message) => {
    if (!['grocery_list', 'meal', 'plan'].includes(message.type)) return;
    setEditingMessageId(message.id);
    setInputText(message.content);
    setDraftCheckedItems((message.metadata?.items || [])
      .flatMap((item: { checked?: boolean }, index: number) => item.checked ? [index] : []));
    setComposerMode(message.type === 'grocery_list' || message.type === 'meal' || message.type === 'plan'
      ? message.type
      : 'message');
    setMealTime(message.metadata?.time || '');
    setPlanDate(message.metadata?.date || '');
    setPlanTime(message.metadata?.time || '');
    textareaRef.current?.focus({ preventScroll: true });
  };

  const handleToggleListItem = (message: Message, itemIndex: number) => {
    const items = message.metadata?.items
      || message.content.split(/\r?\n/).map((text) => ({ text, checked: false }));
    const updatedItems = items.map((item: { text: string; checked?: boolean }, index: number) => (
      index === itemIndex ? { ...item, checked: !item.checked } : item
    ));
    void updateMessage(message.id, {
      content: updatedItems.map((item: { text: string }) => item.text).join('\n'),
      type: message.type,
      metadata: { ...message.metadata, items: updatedItems },
    }).catch((error: unknown) => {
      console.error('Could not update grocery checklist:', error);
      setComposerError(error instanceof Error ? error.message : t('Could not update the grocery list.'));
    });
  };

  const handleToggleMessageAction = (message: Message, action: 'Cook' | 'Contribute') => {
    if (!user) return;
    const field = action === 'Cook' ? 'cooks' : 'contributors';
    const participants: string[] = message.metadata?.[field] || [];
    const updated = participants.includes(user.id)
      ? participants.filter((id) => id !== user.id)
      : [...participants, user.id];
    void updateMessage(message.id, {
      content: message.content,
      type: message.type,
      metadata: { ...message.metadata, [field]: updated },
    }).catch((error: unknown) => {
      console.error(`Could not update ${action.toLowerCase()} participants:`, error);
      setComposerError(error instanceof Error ? error.message : t(action === 'Cook' ? 'Could not update cook participants.' : 'Could not update contributor participants.'));
    });
  };

  const createDrawGame = async () => {
    if (!currentTrip || !user || !supabase) {
      setComposerError(t('Draw and Guess needs an online connection.'));
      return;
    }
    setIsPlusMenuOpen(false);
    setComposerError('');
    const { data: gameId, error } = await supabase.rpc('create_trip_draw_game', {
      p_trip_id: currentTrip.id,
    });
    if (error || !gameId) {
      console.error('Could not create Draw and Guess game:', error);
      setComposerError(t('Could not start a game. Please try again.'));
      return;
    }
    try {
      await sendMessage(
        t('Draw and Guess — join the game!'),
        undefined,
        undefined,
        'draw_game',
        { gameId },
      );
      setActiveDrawGameId(gameId);
    } catch (sendError) {
      console.error('Could not post Draw and Guess invitation:', sendError);
      setComposerError(t('The game was created, but its chat invitation could not be sent.'));
    }
  };

  const createTripGame = async (gameType: 'connect_four' | 'tic_tac_toe') => {
    if (!currentTrip || !user || !supabase) {
      setComposerError(t('Games require an online connection.'));
      return;
    }
    setIsGamesMenuOpen(false);
    setComposerError('');
    const config = gameType === 'tic_tac_toe' ? { bestOf: 1 } : {};
    const { data: gameId, error } = await supabase.rpc('create_trip_game_session', {
      p_trip_id: currentTrip.id,
      p_game_type: gameType,
      p_config: config,
    });
    if (error || !gameId) {
      console.error('Could not create game session:', error);
      setComposerError(error?.message.includes('already in another active game')
        ? t('You are already in another active game')
        : t('Could not start a game. Please try again.'));
      return;
    }
    try {
      await sendMessage(
        `${t(gameType === 'connect_four' ? 'Connect Four' : 'Tic-Tac-Toe')} — ${t('join the game!')}`,
        undefined,
        undefined,
        'game_session',
        { gameSessionId: gameId, gameType },
      );
      setActiveGameSessionId(gameId);
    } catch (sendError) {
      console.error('Could not post game invitation:', sendError);
      setComposerError(t('The game was created, but its chat invitation could not be sent.'));
    }
  };

  const openGameScoreboard = async () => {
    setIsGameScoreboardOpen(true);
    setIsLoadingGameScores(true);
    setGameScoreError('');
    try {
      if (!currentTrip || !supabase) {
        setGameScoreError(t('Games require an online connection.'));
        return;
      }
      const [sessionResults, drawResults] = await Promise.all([
        supabase
          .from('trip_game_sessions')
          .select('winner_id')
          .eq('trip_id', currentTrip.id)
          .eq('status', 'finished'),
        supabase
          .from('draw_games')
          .select('scores')
          .eq('trip_id', currentTrip.id)
          .eq('status', 'finished'),
      ]);
      const loadError = sessionResults.error || drawResults.error;
      if (loadError) {
        console.error('Could not load game leaderboard:', loadError);
        setGameScoreError(t('Could not load the game leaderboard.'));
        return;
      }

      const totals = new Map(tripMembers.map((member) => [member.user_id, 0]));
      (sessionResults.data || []).forEach((result) => {
        if (result.winner_id && totals.has(result.winner_id)) {
          totals.set(result.winner_id, (totals.get(result.winner_id) || 0) + 1);
        }
      });
      (drawResults.data || []).forEach((result) => {
        const scores = result.scores as Record<string, number> | null;
        Object.entries(scores || {}).forEach(([userId, score]) => {
          if (totals.has(userId) && Number.isFinite(score)) {
            totals.set(userId, (totals.get(userId) || 0) + Math.floor(score));
          }
        });
      });
      setGameScores(tripMembers.map((member) => ({
        userId: member.user_id,
        name: member.profile?.display_name || t('Member'),
        avatarUrl: member.profile?.avatar_url || null,
        color: member.profile?.color || '#0A84FF',
        score: totals.get(member.user_id) || 0,
      })).sort((left, right) => right.score - left.score || left.name.localeCompare(right.name)));
    } catch (loadError) {
      console.error('Could not load game leaderboard:', loadError);
      setGameScoreError(t('Could not load the game leaderboard.'));
    } finally {
      setIsLoadingGameScores(false);
    }
  };

  const filteredMessages = isGamesView
    ? messages.filter((message) => message.type === 'draw_game' || message.type === 'game_session')
    : isFilteredView
    ? messages.filter((message) => message.type === viewMode)
    : messages.filter((message) => message.type !== 'grocery_list' && message.type !== 'plan'
      && message.type !== 'draw_game' && message.type !== 'game_session'
      && message.metadata?.gameSummary !== true);
  const visibleMessages = filteredMessages.map((message) => {
    const resolvedPreview = resolvedLinkPreviews[message.id];
    if (!resolvedPreview || !findFirstLink(message.content)) return message;
    const resolvedUrl = resolvedPreview.url;
    const messageUrl = findFirstLink(message.content)?.href;
    if (resolvedUrl !== messageUrl) return message;
    return {
      ...message,
      metadata: {
        ...message.metadata,
        linkPreview: resolvedPreview,
      },
    };
  });

  // Calculate day separators & consecutive grouping
  const messageGroups: Array<{
    message: Message;
    isFirstInGroup: boolean;
    isLastInGroup: boolean;
    showDaySeparator: boolean;
    dayLabel: string;
  }> = [];

  for (let i = 0; i < visibleMessages.length; i++) {
    const curr = visibleMessages[i];
    const prev = i > 0 ? visibleMessages[i - 1] : null;
    const next = i < visibleMessages.length - 1 ? visibleMessages[i + 1] : null;

    let showDaySeparator = false;
    let dayLabel = '';

    if (!prev) {
      showDaySeparator = true;
      dayLabel = formatMessageDaySeparator(curr.created_at);
    } else {
      const prevDate = new Date(prev.created_at).toDateString();
      const currDate = new Date(curr.created_at).toDateString();
      if (prevDate !== currDate) {
        showDaySeparator = true;
        dayLabel = formatMessageDaySeparator(curr.created_at);
      }
    }

    const sameSenderPrev = prev && prev.user_id === curr.user_id && !showDaySeparator;
    const sameSenderNext =
      next &&
      next.user_id === curr.user_id &&
      new Date(next.created_at).toDateString() === new Date(curr.created_at).toDateString();

    const isFirstInGroup = !sameSenderPrev;
    const isLastInGroup = !sameSenderNext;

    messageGroups.push({
      message: curr,
      isFirstInGroup,
      isLastInGroup,
      showDaySeparator,
      dayLabel,
    });
  }

  const hasOpenPolls = polls.some((p) => !p.is_closed);
  const handleChatScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    setIsTitleCollapsed(element.scrollTop > 40);
    setIsAtBottom(element.scrollHeight - element.clientHeight - element.scrollTop <= 72);
  };

  // Filter mention candidate members
  const mentionCandidates =
    mentionQuery !== null
      ? tripMembers
          .filter((m) => {
            const name = m.profile?.display_name || '';
            if (!name) return false;
            if (!mentionQuery.trim()) return true;
            return name.toLowerCase().includes(mentionQuery.toLowerCase());
          })
      : [];
  const isMentionListVisible = mentionQuery !== null && mentionCandidates.length > 0;
  const tripPhotos = messages
    .filter((message) => message.type === 'image' && message.image_url)
    .map((message) => ({ id: message.id, url: message.image_url! }));
  const selectedPhoto = tripPhotos.find((photo) => photo.id === selectedPhotoId) || null;

  useEffect(() => {
    onPhotoViewerChange?.(Boolean(selectedPhoto));
  }, [onPhotoViewerChange, selectedPhotoId]);

  useEffect(() => () => {
    onPhotoViewerChange?.(false);
  }, [onPhotoViewerChange]);

  useEffect(() => {
    if (!isMentionListVisible) {
      setMentionListPosition(null);
      return;
    }
    let frame = 0;
    let settleTimer = 0;
    const updatePosition = () => {
      const form = composerFormRef.current;
      if (!form) return;
      const rect = form.getBoundingClientRect();
      const composerRect = form.parentElement?.getBoundingClientRect() || rect;
      const viewport = window.visualViewport;
      const viewportTop = viewport?.offsetTop ?? 0;
      const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight);
      const visibleHeight = mentionCandidates.length * 44;
      const availableHeight = Math.max(44, rect.top - viewportTop - 72);
      const height = Math.min(visibleHeight, 224, availableHeight);
      const top = Math.max(viewportTop + 64, rect.top - height - 8);
      setMentionListPosition({
        top: Math.min(top, viewportBottom - height - 8),
        left: rect.left,
        width: rect.width,
        maxHeight: height,
        composerTop: composerRect.top,
        composerBottom: composerRect.bottom,
      });
    };
    const schedulePositionUpdate = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(updatePosition);
    };
    updatePosition();
    schedulePositionUpdate();
    frame = window.requestAnimationFrame(() => {
      frame = window.requestAnimationFrame(updatePosition);
    });
    settleTimer = window.setTimeout(updatePosition, 350);
    const resizeObserver = new ResizeObserver(schedulePositionUpdate);
    if (composerFormRef.current) resizeObserver.observe(composerFormRef.current);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    window.visualViewport?.addEventListener('resize', updatePosition);
    window.visualViewport?.addEventListener('scroll', updatePosition);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(settleTimer);
      resizeObserver.disconnect();
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      window.visualViewport?.removeEventListener('resize', updatePosition);
      window.visualViewport?.removeEventListener('scroll', updatePosition);
    };
  }, [isMentionListVisible, mentionCandidates.length, isKeyboardOpen, keyboardOffset, mentionQuery, inputText]);

  if (!currentTrip) {
    return null;
  }

  return (
    <div className="h-full w-full flex flex-col bg-black text-white overflow-hidden relative select-none">
      <div
        aria-hidden="true"
        className="w-full shrink-0"
        style={{ height: 'calc(3.5rem + env(safe-area-inset-top, 0px))' }}
      />
      {/* Top Header - Trip Title & Exit Button (Extended cleanly through top danger zone) */}
      <div
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
        className={`fixed inset-x-0 top-0 isolate w-full ${selectedPhoto ? 'z-[11010]' : 'z-20'}`}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -top-8 -bottom-16"
          style={{
            backgroundImage: 'linear-gradient(to bottom, rgba(0,0,0,0.98) 0%, rgba(0,0,0,0.94) 36%, rgba(0,0,0,0.72) 62%, rgba(0,0,0,0) 100%)',
          }}
        />
        <div className="relative z-10 h-14 w-full flex items-center justify-between px-3.5">
          {!isFilteredView && !isGamesView ? (
            <button
              type="button"
              onClick={exitTrip}
              className="flex items-center gap-1 text-[#0A84FF] text-sm font-semibold active:opacity-70 cursor-pointer -ml-1 py-1 px-2 rounded-lg"
              title={t('Return to Trips')}
            >
              <CaretLeft size={20} weight="bold" />
              <span>{t('Trips')}</span>
            </button>
          ) : <div className="w-14" />}

          <div className="flex max-w-[220px] flex-col items-center truncate text-center">
            <span className={`truncate text-base font-bold tracking-tight text-white transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              isTitleCollapsed ? 'translate-y-0 scale-100 opacity-100' : 'pointer-events-none translate-y-2 scale-95 opacity-0'
            }`}>
              {pageTitle}
            </span>
            <TripMemberStack members={tripMembers} />
          </div>

          {!isFilteredView && !isGamesView ? (
            <div className="w-14 flex justify-end">
              <button
                ref={callButtonRef}
                type="button"
                aria-label={selectedPhoto ? t('Close photo') : t('Start a call')}
                aria-expanded={selectedPhoto ? undefined : isCallMenuOpen}
                onClick={() => {
                  if (selectedPhoto) {
                    setSelectedPhotoId(null);
                    return;
                  }
                  if (isCallMenuOpen) {
                    setIsCallMenuOpen(false);
                    return;
                  }
                  const rect = callButtonRef.current?.getBoundingClientRect();
                  if (rect) setCallMenuPosition({
                    top: rect.bottom + 8,
                    right: Math.max(12, window.innerWidth - rect.right),
                  });
                  setIsCallMenuOpen(true);
                }}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-[#0A84FF] text-white shadow-lg active:scale-95"
              >
                {selectedPhoto ? <X size={20} weight="bold" /> : <Phone size={20} weight="fill" />}
              </button>
            </div>
          ) : <div className="w-14" />}
        </div>
      </div>

      {/* Pinned Polls Banner */}
      {!isFilteredView && !isGamesView && !call.activeCall && !call.incomingCall && call.callError && (
        <div role="alert" className="mx-3 mt-3 flex shrink-0 items-center justify-between gap-3 rounded-2xl border border-red-400/20 bg-[#202024]/95 px-4 py-3 text-sm text-red-200">
          <span>{call.callError}</span>
          <button
            type="button"
            onClick={call.clearCallError}
            className="shrink-0 font-semibold text-white"
            aria-label={t('Dismiss call error')}
          >
            Dismiss
          </button>
        </div>
      )}

      {!isFilteredView && !isGamesView && <PinnedPolls
        polls={polls}
        onVote={votePoll}
        onEndPoll={endPoll}
      />}

      {/* Chat Messages List */}
      <CustomScrollArea
        className="relative z-0 isolate -mt-[calc(3.5rem+env(safe-area-inset-top,0px))] flex-1 overflow-hidden"
        scrollRef={scrollRef}
        onScroll={handleChatScroll}
      >
        <div
          ref={scrollContentRef}
          onClick={handleEmptySpaceTap}
          onTouchStart={() => { keepScrollAtBottomRef.current = false; }}
          onWheel={() => { keepScrollAtBottomRef.current = false; }}
          className="flex min-h-full flex-col justify-start px-4"
          style={{
            paddingTop: `calc(3.5rem + env(safe-area-inset-top, 0px) + ${hasOpenPolls ? '6rem' : '0.75rem'})`,
            paddingBottom: isKeyboardOpen
              ? `${Math.max(156, keyboardOffset + 146)}px`
              : '194px',
          }}
        >
          <h1 className={`mb-4 origin-center text-center text-3xl font-extrabold tracking-tight text-white transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            isTitleCollapsed ? 'pointer-events-none -translate-y-3 scale-[0.96] opacity-0' : 'translate-y-0 scale-100 opacity-100'
          }`}>
            {pageTitle}
          </h1>
          {messageGroups.map(({ message, isFirstInGroup, isLastInGroup, showDaySeparator, dayLabel }, index) => {
            const replyMsg = message.reply_to
              ? visibleMessages.find((m) => m.id === message.reply_to)
              : null;
            const firstAnimatedIndex = Math.max(0, messageGroups.length - 5);
            const isRecentMessage = index >= firstAnimatedIndex;
            const revealDelay = isRecentMessage ? (index - firstAnimatedIndex) * 0.14 : 0.15;

            return (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 5 }}
                animate={messageRevealPhase === 'loading'
                  ? { opacity: 0, y: 5 }
                  : { opacity: 1, y: 0 }}
                transition={{
                  duration: 0.55,
                  delay: revealDelay,
                  ease: 'easeOut',
                }}
              >
                {showDaySeparator && (
                  <div className="flex justify-center my-4 animate-calm-fade-in">
                    <span className="text-xs font-medium text-slate-500 select-none">
                      {dayLabel}
                    </span>
                  </div>
                )}
                <ChatBubble
                  message={message}
                  isOwn={user ? message.user_id === user.id : false}
                  isFirstInGroup={isFirstInGroup}
                  isLastInGroup={isLastInGroup}
                  currentUserId={user?.id}
                  onDoubleTapHeart={handleDoubleTapHeart}
                  onReact={(mId, kind) => toggleReaction(mId, kind)}
                  onReply={(m) => setReplyingTo(m)}
                  onDelete={deleteMessage}
                  replyMessage={replyMsg}
                  members={tripMembers}
                  onEdit={handleEditMessage}
                  onToggleListItem={handleToggleListItem}
                  onToggleAction={handleToggleMessageAction}
                  onJoinCall={(callId) => void call.joinCall(callId)}
                  onProfileClick={setSelectedProfileId}
                  onOpenDrawGame={setActiveDrawGameId}
                  onOpenGameSession={setActiveGameSessionId}
                  onOpenImage={(url) => {
                    const photo = tripPhotos.find((item) => item.url === url);
                    setSelectedPhotoId(photo?.id || null);
                  }}
                />
              </motion.div>
            );
          })}
        </div>
      </CustomScrollArea>

      {showMessageLoader && messageRevealPhase !== 'shown' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: messageRevealPhase === 'loading' ? 1 : 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="pointer-events-none absolute inset-0 z-[25] flex items-center justify-center bg-black"
        >
          <motion.img
            src={tripLogo}
            alt={t('Trip')}
            initial={{ scale: 0.92, opacity: 1 }}
            animate={messageRevealPhase === 'loading'
              ? { scale: [0.92, 1.04, 0.96, 1.04], opacity: 1 }
              : { scale: 3.6, opacity: 0 }}
            transition={messageRevealPhase === 'loading'
              ? { duration: 0.9, repeat: Infinity, ease: 'easeInOut' }
              : { duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="h-16 w-16 object-contain"
          />
        </motion.div>
      )}

      {/* Reply Banner */}
      {replyingTo && !isFilteredView && !isGamesView && (
        <div
          style={{
            backdropFilter: 'blur(24px) saturate(180%)',
            WebkitBackdropFilter: 'blur(24px) saturate(180%)',
            bottom: isKeyboardOpen
              ? `${Math.max(8, keyboardOffset + 6) + 96}px`
              : 'calc(132px + env(safe-area-inset-bottom, 0px))',
          }}
          data-reaction-clearance
          className="absolute left-3.5 right-3.5 z-30 px-4 py-2.5 flex items-center gap-2 bg-[#202024]/90 border border-white/[0.12] rounded-[20px] text-xs text-white shadow-lg animate-spring-in transition-[bottom] duration-150 ease-out"
        >
          <div className="min-w-0 flex-1">
            <span className="font-bold text-[#0A84FF] mr-1.5">
              {t('Replying to')} {replyingTo.sender?.display_name || t('Member')}:
            </span>
            <span className="reply-preview-content block text-[11px] leading-snug opacity-80">
              {replyingTo.content}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setReplyingTo(null)}
            className="w-7 h-7 flex items-center justify-center text-slate-400 active:scale-95 cursor-pointer"
          >
            <X size={16} weight="bold" />
          </button>
        </div>
      )}

      {/* Floating Message Input Container */}
      <div
        style={{
          bottom: isKeyboardOpen
            ? `${Math.max(8, keyboardOffset + 6)}px`
            : `calc(42px + env(safe-area-inset-bottom, 0px))`,
        }}
        data-reaction-clearance
        className="absolute left-3.5 right-3.5 z-30 pointer-events-auto transition-[bottom] duration-150 ease-out"
      >
        {isGamesView && (
          <div className="relative flex items-center gap-2">
            {onlineMembers.length > 0 && (
              <div
                aria-label={`${onlineMembers.length} members currently active`}
                title={`${onlineMembers.length} members currently active`}
                className="absolute bottom-[calc(100%+8px)] left-0 right-0 flex min-h-8 items-center justify-end -space-x-2"
              >
                {onlineMembers.slice(0, 7).map((member) => (
                  <button
                    key={member.userId}
                    type="button"
                    onClick={() => setSelectedProfileId(member.userId)}
                    aria-label={`${t('View profile')}: ${member.profile.display_name}`}
                    className="relative rounded-full"
                  >
                    <Avatar
                      name={member.profile.display_name}
                      avatarUrl={member.profile.avatar_url}
                      color={member.profile.color}
                      size={28}
                    />
                  </button>
                ))}
                {onlineMembers.length > 7 && (
                  <span className="flex h-7 min-w-7 items-center justify-center rounded-full border border-white/20 bg-[#303036] px-1 text-[10px] font-bold text-white">
                    +{onlineMembers.length - 7}
                  </span>
                )}
              </div>
            )}
            <button
              type="button"
              aria-label={t('Game leaderboard')}
              disabled={isLoadingGameScores}
              aria-busy={isLoadingGameScores}
              onClick={() => void openGameScoreboard()}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/[0.12] bg-[#222226]/90 text-white shadow-[0_4px_16px_rgba(0,0,0,0.3)] backdrop-blur-xl disabled:opacity-60"
            >
              <Trophy size={20} weight="fill" />
            </button>
            <div className="relative min-w-0 flex-1">
              <button
                ref={gamesButtonRef}
                type="button"
                aria-haspopup="menu"
                aria-expanded={isGamesMenuOpen}
                onClick={() => setIsGamesMenuOpen((open) => !open)}
                className="flex min-h-[48px] w-full items-center justify-center rounded-full border border-white/[0.12] bg-[#222226]/90 px-4 text-sm font-semibold text-white shadow-[0_4px_16px_rgba(0,0,0,0.3)] backdrop-blur-xl"
                style={{ backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)' }}
              >
                <span className="flex items-center gap-2"><GameController size={19} weight="fill" />{t('Choose a game')}</span>
              </button>
            <AnimatePresence>
              {isGamesMenuOpen && (
                <>
                  <motion.button
                    type="button"
                    aria-label={t('Close game menu')}
                    onClick={() => setIsGamesMenuOpen(false)}
                    className="fixed inset-0 z-30 cursor-default"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.12 }}
                  />
                  <motion.div
                    initial={{
                      opacity: 0,
                      scaleX: 1,
                      scaleY: Math.min(1, (gamesButtonRef.current?.offsetHeight || 48) / 160),
                      y: 8,
                    }}
                    animate={{ opacity: 1, scaleY: 1, y: 0 }}
                    exit={{
                      opacity: 0,
                      scaleX: 1,
                      scaleY: Math.min(1, (gamesButtonRef.current?.offsetHeight || 48) / 160),
                      y: 8,
                    }}
                    transition={{ type: 'spring', stiffness: 420, damping: 32, mass: 0.7 }}
                    style={{
                      transformOrigin: 'bottom center',
                      backdropFilter: 'blur(30px) saturate(190%)',
                      WebkitBackdropFilter: 'blur(30px) saturate(190%)',
                    }}
                    className="absolute bottom-[calc(100%+8px)] left-0 right-0 z-40 rounded-[24px] border border-white/[0.14] bg-[#202024]/90 p-2 shadow-[0_16px_40px_rgba(0,0,0,0.6)]"
                  >
                  {([
                    ['Draw and Guess', () => void createDrawGame()],
                    ['Connect Four', () => void createTripGame('connect_four')],
                    ['Tic-Tac-Toe', () => void createTripGame('tic_tac_toe')],
                  ] as const).map(([name, create]) => (
                    <button key={name} type="button" role="menuitem" onClick={create} className="flex min-h-12 w-full items-center gap-3 rounded-[18px] px-3.5 text-left text-sm font-semibold text-white transition-colors hover:bg-white/[0.08] active:bg-white/[0.12]">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0A84FF]/15 text-[#0A84FF]"><GameController size={17} weight="fill" /></span>
                      {t(name)}
                    </button>
                  ))}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
            </div>
          </div>
        )}
        {composerError && (
          <div
            role="alert"
            className="absolute bottom-[calc(100%+8px)] left-0 max-w-[85%] rounded-2xl border border-red-300/20 bg-red-950/95 px-3 py-2 text-xs text-red-100 shadow-lg"
          >
            {t(composerError)}
            <button type="button" onClick={() => setComposerError('')} className="ml-2 font-bold">{t('Dismiss')}</button>
          </div>
        )}
        <input
          type="file"
          ref={photoInputRef}
          accept="image/*"
          onChange={handleImageFile}
          className="hidden"
        />

        {/* Member Mention Autocomplete Popup */}
        {pendingPhoto && (
          <div className="mb-2 flex justify-end" key={pendingPhoto.id}>
            <div className="relative max-w-[70%] overflow-hidden rounded-[18px] border border-white/10 bg-[#222226]">
              <img
                src={pendingPhoto.previewUrl}
                alt={t('Photo upload preview')}
                className="block max-h-32 w-auto max-w-full object-contain"
              />
            </div>
          </div>
        )}

        {/* items-end: The + button and send button stay anchored at the bottom line when textarea expands */}
        <form ref={composerFormRef} onSubmit={handleSend} className={`relative flex items-end gap-2 ${isGamesView ? 'hidden' : ''}`}>
          {/* Type-specific tabs have a fixed composer mode and do not show mode toggles. */}
          {!isFilteredView && !isGamesView && <button
            ref={plusButtonRef}
            type="button"
            disabled={uploadingImage}
            onClick={() => {
              if (composerMode !== 'message') {
                setComposerMode('message');
                setEditingMessageId(null);
                setInputText('');
                setDraftCheckedItems([]);
                setMealTime('');
                setPlanDate('');
                setPlanTime('');
                setMentionQuery(null);
                setComposerError('');
                return;
              }
              if (textareaRef.current) {
                textareaRef.current.blur();
              }
              notifyKeyboard(false);
              setIsPlusMenuOpen(!isPlusMenuOpen);
            }}
            style={{
              backdropFilter: 'blur(24px) saturate(180%)',
              WebkitBackdropFilter: 'blur(24px) saturate(180%)',
            }}
            className={`w-[46px] h-[46px] min-w-[46px] min-h-[46px] rounded-full flex items-center justify-center cursor-pointer shadow-[0_4px_16px_rgba(0,0,0,0.3)] border border-white/[0.12] active-press shrink-0 self-end transition-colors ${
              isPlusMenuOpen || composerMode !== 'message'
                ? 'bg-white/25 text-white'
                : 'bg-[#222226]/90 text-white hover:bg-[#2a2a2e]'
            }`}
          >
            {composerMode !== 'message'
              ? <X size={22} weight="bold" />
              : <Plus size={22} weight="bold" className={`transition-transform duration-200 ${isPlusMenuOpen ? 'rotate-45' : ''}`} />}
          </button>}

          {/* Plus Menu Popup */}
          {!isFilteredView && !isGamesView && (
            <AnimatePresence>
              {isPlusMenuOpen && (
                <>
                  <motion.button
                    type="button"
                    aria-label={t('Close attachment menu')}
                    onClick={() => setIsPlusMenuOpen(false)}
                    className="fixed inset-0 z-30 bg-transparent"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.12 }}
                  />
                  <motion.div
                    initial={{
                      opacity: 0,
                      scaleX: Math.min(1, (plusButtonRef.current?.offsetWidth || 46) / 192),
                      scaleY: Math.min(1, (plusButtonRef.current?.offsetHeight || 46) / 240),
                      y: 8,
                    }}
                    animate={{ opacity: 1, scaleX: 1, scaleY: 1, y: 0 }}
                    exit={{
                      opacity: 0,
                      scaleX: Math.min(1, (plusButtonRef.current?.offsetWidth || 46) / 192),
                      scaleY: Math.min(1, (plusButtonRef.current?.offsetHeight || 46) / 240),
                      y: 8,
                    }}
                    transition={{ type: 'spring', stiffness: 420, damping: 32, mass: 0.7 }}
                    style={{
                      transformOrigin: 'bottom left',
                      backdropFilter: 'blur(30px) saturate(190%)',
                      WebkitBackdropFilter: 'blur(30px) saturate(190%)',
                      backgroundColor: 'rgba(28, 28, 32, 0.94)',
                    }}
                    data-reaction-clearance
                    className="absolute left-0 bottom-14 z-40 flex w-48 flex-col border border-white/[0.14] rounded-[24px] p-2 shadow-[0_16px_40px_rgba(0,0,0,0.6)]"
                  >
                <button
                  type="button"
                  onClick={() => {
                    setIsPlusMenuOpen(false);
                    photoInputRef.current?.click();
                  }}
                  className="order-6 w-full h-11 px-3.5 rounded-[18px] flex items-center gap-3 text-sm font-semibold text-white hover:bg-white/10 active:scale-98 cursor-pointer transition-all"
                >
                  <div className="w-7 h-7 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                    <ImageIcon size={16} weight="bold" />
                  </div>
                  <span>{t('Photo')}</span>
                </button>
                {([
                  ['grocery_list', t('Grocery list'), ShoppingCart],
                  ['meal', t('Meal'), ForkKnife],
                  ['plan', t('Plan'), CalendarBlank],
                ] as const).map(([mode, label, Icon]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setIsPlusMenuOpen(false);
                      setInputText('');
                      setComposerMode(mode);
                      textareaRef.current?.focus({ preventScroll: true });
                      window.setTimeout(() => textareaRef.current?.setSelectionRange(0, 0), 0);
                    }}
                    className={`${mode === 'plan' ? 'order-1' : mode === 'grocery_list' ? 'order-2' : 'order-3'} w-full h-11 px-3.5 rounded-[18px] flex items-center gap-3 text-sm font-semibold text-white hover:bg-white/10 active:scale-98 cursor-pointer transition-all`}
                  >
                    <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-slate-200">
                      <Icon size={16} weight="bold" />
                    </div>
                    <span>{label}</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setIsPlusMenuOpen(false);
                    setIsPollSheetOpen(true);
                  }}
                  className="order-5 w-full h-11 px-3.5 rounded-[18px] flex items-center gap-3 text-sm font-semibold text-white hover:bg-white/10 active:scale-98 cursor-pointer transition-all"
                >
                  <div className="w-7 h-7 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400">
                    <ChartBar size={16} weight="bold" />
                  </div>
                  <span>{t('Poll')}</span>
                </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          )}

          {((!isFilteredView && !isGamesView && composerMode !== 'grocery_list' && !isMentionListVisible)
            || (onlineMembers.length > 0 && !isMentionListVisible)) && (
            <div className="absolute bottom-[calc(100%+8px)] left-0 right-0 flex min-h-8 items-center justify-between">
              <div className="flex min-w-0 items-center gap-3 pl-1">
                <AnimatePresence initial={false}>
                {(isAtBottom || isComposerFocused) && (
                  <motion.div
                    key="composer-shortcuts"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0, x: isTextareaMultiline ? 58 : 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.22, ease: 'easeOut' }}
                    className="flex min-w-0 items-center gap-3"
                  >
                {!isFilteredView && !isGamesView && composerMode === 'message' && (
                  <>
                    <button
                      type="button"
                      aria-label={t('Insert hashtag')}
                      title={t('Insert hashtag')}
                      onPointerDown={(event) => event.preventDefault()}
                      onClick={() => insertComposerToken('#')}
                      className="flex min-h-8 translate-y-0.5 items-center gap-1 px-1 text-sm font-bold leading-none text-white drop-shadow-[0_2px_8px_rgba(0,0,0,1)] transition-colors active:text-white"
                    >
                      #
                      <span>{t('Hashtag')}</span>
                    </button>
                    <button
                      type="button"
                      aria-label={t('Mention a member')}
                      title={t('Mention a member')}
                      onPointerDown={(event) => event.preventDefault()}
                      onClick={() => insertComposerToken('@')}
                      className="flex min-h-8 items-center gap-1 px-1 text-sm font-bold leading-none text-white drop-shadow-[0_2px_8px_rgba(0,0,0,1)] transition-colors active:text-white"
                    >
                      @
                      <span>{t('Mention')}</span>
                    </button>
                  </>
                )}
                {composerMode === 'plan' && (
                  <>
                    <label className="relative inline-flex min-h-8 shrink-0 cursor-pointer items-center whitespace-nowrap text-sm font-bold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,1)] active:text-white">
                      <span>{planDate ? formatTripDate(planDate) : t('Add date')}</span>
                      <input
                        ref={planDateInputRef}
                        type="date"
                        aria-label={t('Plan date')}
                        value={planDate}
                        onChange={(event) => setPlanDate(event.target.value)}
                        className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                      />
                    </label>
                    <label className="relative inline-flex min-h-8 shrink-0 cursor-pointer items-center whitespace-nowrap text-sm font-bold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,1)] active:text-white">
                      <span>{planTime || t('Add time')}</span>
                      <input
                        ref={planTimeInputRef}
                        type="time"
                        aria-label={t('Plan time')}
                        value={planTime}
                        onChange={(event) => setPlanTime(event.target.value)}
                        className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                      />
                    </label>
                  </>
                )}
                {composerMode === 'meal' && (
                  <label className="relative inline-flex min-h-8 shrink-0 cursor-pointer items-center whitespace-nowrap text-sm font-bold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,1)] active:text-white">
                    <span>{mealTime || t('Add time')}</span>
                    <input
                      ref={mealTimeInputRef}
                      type="time"
                      aria-label={t('Meal time')}
                      value={mealTime}
                      onChange={(event) => setMealTime(event.target.value)}
                      className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                    />
                  </label>
                )}
                  </motion.div>
                )}
                </AnimatePresence>
              </div>
              {onlineMembers.length > 0 && (
                <div
                  aria-label={`${onlineMembers.length} members currently active`}
                  title={`${onlineMembers.length} members currently active`}
                  className="flex shrink-0 items-center justify-end -space-x-2"
                >
                  {onlineMembers.slice(0, 7).map((member) => (
                    <button
                      key={member.userId}
                      type="button"
                      onClick={() => setSelectedProfileId(member.userId)}
                      aria-label={`${t('View profile')}: ${member.profile.display_name}`}
                      className="relative rounded-full"
                    >
                      <Avatar
                        name={member.profile.display_name}
                        avatarUrl={member.profile.avatar_url}
                        color={member.profile.color}
                        size={28}
                      />
                    </button>
                  ))}
                  {onlineMembers.length > 7 && (
                    <span className="flex h-7 min-w-7 items-center justify-center rounded-full border border-white/20 bg-[#303036] px-1 text-[10px] font-bold text-white">
                      +{onlineMembers.length - 7}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex min-w-0 flex-1 flex-col">
            {/* Floating Pill Input Box - expands UPWARDS */}
            <div
              style={{
                backdropFilter: 'blur(28px) saturate(180%)',
                WebkitBackdropFilter: 'blur(28px) saturate(180%)',
              }}
              className="relative flex min-w-0 items-start min-h-[46px] bg-[#222226]/90 border border-white/[0.12] rounded-[23px] px-3.5 py-0.5 shadow-[0_4px_16px_rgba(0,0,0,0.3)] transition-all duration-150 ease-out"
            >
              {composerMode === 'grocery_list' && (
                <div className="absolute left-3.5 top-[15px] z-10 flex flex-col" aria-label={t('Draft grocery item checkboxes')}>
                  {inputText.split(/\r?\n/).map((_, index) => (
                    <button
                      key={index}
                      type="button"
                      aria-label={`${t(draftCheckedItems.includes(index) ? 'Uncheck' : 'Check')} ${t('grocery item')} ${index + 1}`}
                      aria-pressed={draftCheckedItems.includes(index)}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={() => setDraftCheckedItems((current) => (
                        current.includes(index) ? current.filter((item) => item !== index) : [...current, index]
                      ))}
                      className={`mb-[4px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-[background-color,border-color,transform] duration-200 ${
                        draftCheckedItems.includes(index) ? 'border-white bg-white text-[#0A84FF]' : 'border-white/65 bg-transparent'
                      }`}
                    >
                      {draftCheckedItems.includes(index) && <span className="text-xs font-bold">✓</span>}
                    </button>
                  ))}
                </div>
              )}
              {!isFilteredView && !isGamesView && composerMode === 'message' && !inputText.trim() && (
                <button
                  type="button"
                  aria-label={t('Choose a sticker')}
                  title={t('Choose a sticker')}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={openStickerPicker}
                  className="absolute left-2 top-[7px] z-10 flex h-8 w-8 items-center justify-center rounded-full text-slate-300 transition-colors hover:text-white active:scale-90"
                >
                  <Smiley size={21} weight="duotone" />
                </button>
              )}
              {!isFilteredView && !isGamesView && composerMode === 'message' && (
                <button
                  type="button"
                  aria-label={t('Focus message input')}
                  onPointerDown={(event) => event.preventDefault()}
                  onPointerUp={() => {
                    textareaRef.current?.focus({ preventScroll: true });
                  }}
                  onClick={() => textareaRef.current?.focus({ preventScroll: true })}
                  className={`absolute inset-y-0 left-10 right-0 z-10 cursor-text rounded-r-[23px] bg-transparent ${
                    isComposerFocused ? 'pointer-events-none' : ''
                  }`}
                />
              )}
              <textarea
                ref={textareaRef}
                id="chat-message-input"
                name="message"
                rows={1}
                inputMode="text"
                autoCapitalize="sentences"
                autoCorrect="on"
                spellCheck={true}
                enterKeyHint={composerMode === 'grocery_list' ? 'enter' : 'send'}
                placeholder={
                  t(composerMode === 'grocery_list' ? 'New grocery list'
                    : composerMode === 'meal' ? 'Add new meal'
                      : composerMode === 'plan' ? 'Add new plan'
                        : 'Message...')
                }
                value={inputText}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                onFocus={handleFocus}
                onBlur={handleBlur}
                className={`min-w-0 flex-1 bg-transparent text-white placeholder:text-slate-400 text-[16px] resize-none outline-none py-2.5 leading-[1.38] overflow-y-hidden whitespace-pre-wrap [overflow-wrap:anywhere] [word-break:break-word] ${
                  composerMode === 'grocery_list' ? 'pl-8' : composerMode === 'message' && !isFilteredView ? 'pl-9' : ''
                }`}
                style={{ minHeight: '40px', height: '40px' }}
              />
            </div>
          </div>

          {/* Send Button - stays anchored at bottom */}
          <div
            className={`shrink-0 self-end flex items-center justify-center transition-all duration-200 ease-out ${
              inputText.trim()
                ? 'w-[46px] opacity-100 scale-100 translate-x-0'
                : 'w-0 opacity-0 scale-50 translate-x-2 pointer-events-none'
            }`}
          >
            <button
              type="submit"
              disabled={!inputText.trim() || (composerMode === 'plan' && !planDate) || isSending}
              onMouseDown={(e) => {
                // Prevent focus shift away from textarea
                e.preventDefault();
              }}
              onTouchStart={(e) => {
                // Prevent focus shift away from textarea on touch devices
                e.preventDefault();
                handleSend();
              }}
              aria-label={t(isSending ? 'Sending…' : 'Send')}
              className="w-[46px] h-[46px] min-w-[46px] min-h-[46px] rounded-full bg-[#0A84FF] text-white flex items-center justify-center cursor-pointer shadow-lg active:scale-90 transition-transform disabled:cursor-wait"
            >
              {isSending
                ? <CircleNotch size={20} weight="bold" className="animate-spin" />
                : <ArrowUp size={20} weight="bold" />}
            </button>
          </div>
        </form>
      </div>

      {/* Poll Creation Bottom Sheet */}
      {!isFilteredView && !isGamesView && <PollSheet
        isOpen={isPollSheetOpen}
        onClose={() => setIsPollSheetOpen(false)}
        onCreatePoll={createPoll}
      />}
      {!isFilteredView && !isGamesView && (
        <BottomSheet isOpen={isStickerPickerOpen} onClose={() => setIsStickerPickerOpen(false)}>
          <div className="pb-2 text-center">
            <h2 className="mb-4 text-center text-lg font-bold text-white">{t('Stickers')}</h2>
            <div className="grid grid-cols-4 gap-x-3 gap-y-4">
              {CHAT_STICKERS.map((sticker) => (
                <button
                  key={sticker.id}
                  type="button"
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => void handleSendSticker(sticker.id)}
                  aria-label={`${t('Send sticker')}: ${t(sticker.name)}`}
                  className="flex min-h-24 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-1 text-center text-slate-300 transition-colors hover:bg-white/[0.06] active:scale-95"
                >
                  <StickerArtwork stickerId={sticker.id} size={66} />
                  <span className="text-xs font-medium">{t(sticker.name)}</span>
                </button>
              ))}
            </div>
          </div>
        </BottomSheet>
      )}
      <MemberProfileSheet
        profile={tripMembers.find((member) => member.user_id === selectedProfileId)?.profile || null}
        location={sharedLocations.find((location) => location.user_id === selectedProfileId)}
        onClose={() => setSelectedProfileId(null)}
        onMention={() => {
          const member = tripMembers.find((candidate) => candidate.user_id === selectedProfileId);
          if (member) handleSelectMention(member);
          setSelectedProfileId(null);
        }}
      />
      <AnimatePresence>
        {isGameScoreboardOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed inset-0 z-[12010] flex flex-col bg-black text-white"
            style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
          >
            <header className="relative flex h-14 shrink-0 items-center justify-between px-3.5">
              <div className="h-11 w-11 shrink-0" />
              <div className="absolute left-1/2 flex max-w-[220px] -translate-x-1/2 flex-col items-center truncate text-center">
                <h2 className="truncate text-base font-bold">{t('Game leaderboard')}</h2>
                <TripMemberStack members={tripMembers} />
              </div>
              <button
                type="button"
                aria-label={t('Close leaderboard')}
                onClick={() => setIsGameScoreboardOpen(false)}
                className="flex h-11 w-11 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/[0.08]"
              >
                <X size={22} weight="bold" />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8 pt-6">
              {isLoadingGameScores ? (
                <div className="flex h-full items-center justify-center text-sm text-white/60">{t('Loading leaderboard…')}</div>
              ) : gameScoreError ? (
                <p role="alert" className="rounded-2xl border border-red-300/15 bg-red-950/30 p-4 text-center text-sm text-red-200">{gameScoreError}</p>
              ) : gameScores.length === 0 || gameScores.every((entry) => entry.score === 0) ? (
                <p className="pt-16 text-center text-sm text-white/55">{t('No game scores yet')}</p>
              ) : (
                <>
                  <motion.div
                    initial={{ opacity: 0, y: 18, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 280, damping: 24 }}
                    className="mx-auto flex max-w-sm flex-col items-center px-5 py-7 text-center"
                  >
                    <Avatar
                      name={gameScores[0].name}
                      avatarUrl={gameScores[0].avatarUrl}
                      color={gameScores[0].color}
                      size={88}
                      className="ring-4 ring-[#0A84FF]/30"
                    />
                    <div className="mt-4 flex max-w-full items-baseline justify-center gap-3">
                      <span className="truncate text-2xl font-extrabold">{gameScores[0].name}</span>
                      <span className="text-2xl font-extrabold text-[#70baff]"><AnimatedScore score={gameScores[0].score} /></span>
                    </div>
                  </motion.div>
                  <div className="mx-auto mt-5 max-w-lg space-y-2">
                    {gameScores.slice(1).map((entry, index) => (
                      <motion.div
                        key={entry.userId}
                        initial={{ opacity: 0, x: 18 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.28, delay: index * 0.07, ease: 'easeOut' }}
                        className="flex min-h-[66px] items-center gap-3 px-3.5"
                      >
                        <Avatar name={entry.name} avatarUrl={entry.avatarUrl} color={entry.color} size={40} />
                        <span className="min-w-0 flex-1 truncate text-base font-semibold">{entry.name}</span>
                        <span className="text-lg font-bold tabular-nums text-white"><AnimatedScore score={entry.score} /></span>
                      </motion.div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {activeDrawGameId && user && (
        <DrawGuessGame
          gameId={activeDrawGameId}
          userId={user.id}
          members={tripMembers}
          onClose={() => setActiveDrawGameId(null)}
        />
      )}
      {activeGameSessionId && user && (
        <TripGameSession
          gameId={activeGameSessionId}
          userId={user.id}
          members={tripMembers}
          onClose={() => setActiveGameSessionId(null)}
          onOpenGame={setActiveGameSessionId}
          sendMessage={sendMessage}
        />
      )}
      <AnimatePresence>
        {selectedPhoto && (
          <PhotoLightbox
            key="message-photo-viewer"
            photos={tripPhotos}
            selectedPhotoId={selectedPhoto.id}
            onSelectPhoto={setSelectedPhotoId}
            onClose={() => setSelectedPhotoId(null)}
            showCloseButton={false}
          />
        )}
      </AnimatePresence>

      {mentionQuery !== null && mentionCandidates.length > 0 && mentionListPosition && createPortal(
        <div className="pointer-events-none fixed inset-0 z-[39]">
          <div
            aria-hidden="true"
            className="mention-autocomplete-backdrop mention-autocomplete-backdrop-top animate-calm-fade-in"
            style={{
              top: `${mentionListPosition.top}px`,
              bottom: `${Math.max(0, window.innerHeight - mentionListPosition.composerTop)}px`,
            }}
          />
          <div
            aria-hidden="true"
            className="mention-autocomplete-backdrop mention-autocomplete-backdrop-bottom animate-calm-fade-in"
            style={{ top: `${mentionListPosition.composerBottom}px` }}
          />
          <div
            style={{
              top: `${mentionListPosition.top}px`,
              maxHeight: `${mentionListPosition.maxHeight}px`,
            }}
            className="pointer-events-auto fixed inset-x-0 z-[39] flex max-h-56 flex-col items-stretch overflow-y-auto px-3 pb-safe animate-calm-fade-in"
          >
            {mentionCandidates.map((member) => (
              <button
                key={member.user_id}
                type="button"
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => handleSelectMention(member)}
                className="mention-autocomplete-item flex min-h-11 w-full items-center gap-2.5 border-b border-white/[0.06] px-3 py-1 text-left transition-colors hover:text-sky-200 active:text-sky-200"
              >
                <Avatar
                  name={member.profile?.display_name}
                  avatarUrl={member.profile?.avatar_url}
                  color={member.profile?.color}
                  size={30}
                />
                <span className="truncate text-sm font-semibold text-white">{member.profile?.display_name}</span>
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}

      {createPortal(
        <AnimatePresence>
          {isCallMenuOpen && callMenuPosition && (
            <>
              <motion.button
                type="button"
                aria-label={t('Close call menu')}
                className="fixed inset-0 z-[10000] cursor-default"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                onClick={() => setIsCallMenuOpen(false)}
              />
              <motion.div
                style={{
                  top: `${callMenuPosition.top}px`,
                  right: `${callMenuPosition.right}px`,
                  transformOrigin: 'top right',
                  backgroundColor: 'rgba(32, 32, 36, 0.88)',
                  backdropFilter: 'blur(24px) saturate(180%)',
                  WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                  width: 'min(18rem, calc(100vw - 1.5rem))',
                }}
                initial={{ opacity: 0, scale: 0.92, y: -5 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: -5 }}
                transition={{ type: 'spring', stiffness: 420, damping: 32, mass: 0.7 }}
                className="fixed z-[10001] box-border rounded-2xl border border-white/10 bg-[#202024]/90 p-2.5 shadow-2xl"
              >
                <div className="px-3 py-2 text-sm font-semibold text-slate-400">{t('Start a call')}</div>
                {([
                  ['audio', t('Voice call'), PhoneCall],
                  ['video', t('Video call'), VideoCamera],
                ] as const).map(([kind, label, Icon]) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => {
                      setIsCallMenuOpen(false);
                      void call.startCall(kind, onlineMembers);
                    }}
                    className="flex min-h-14 w-full items-center gap-3 rounded-xl px-4 text-left text-base font-semibold text-white hover:bg-white/10"
                  >
                    <Icon size={19} className="text-sky-400" />
                    {label}
                  </button>
                ))}
                {call.callError && <div className="px-3 pb-2 pt-1 text-xs text-red-300">{call.callError}</div>}
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body,
      )}

    </div>
  );
};
