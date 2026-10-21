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
} from '@phosphor-icons/react';
import { useTrip } from '../../context/TripContext';
import { useAuth } from '../../context/AuthContext';
import { Message, TripMember } from '../../types';
import { ChatBubble } from './ChatBubble';
import { PinnedPolls } from './PinnedPolls';
import { PollSheet } from './PollSheet';
import { Avatar } from '../common/Avatar';
import { MemberProfileSheet } from '../common/MemberProfileSheet';
import { CustomScrollArea } from '../common/CustomScrollArea';
import { formatMessageDaySeparator, formatTripDate } from '../../utils/date';
import { supabase, uploadAsset } from '../../lib/supabase';
import { OnlineTripMember } from './useTripPresence';
import { GroupCallManager } from './useGroupCall';
import { useTripLocations } from '../trip/useTripLocations';
import { DrawGuessGame } from './DrawGuessGame';
import { useLanguage } from '../../context/LanguageContext';
import tripLogo from '../../../trip-logo.png';

interface MessagesViewProps {
  viewMode?: 'messages' | 'grocery_list' | 'plan';
  onKeyboardStateChange?: (isOpen: boolean) => void;
  initialMention?: string;
  onClearInitialMention?: () => void;
  onlineMembers: OnlineTripMember[];
  call: GroupCallManager;
}

export const MessagesView: React.FC<MessagesViewProps> = ({
  viewMode = 'messages',
  onKeyboardStateChange,
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
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [isPlusMenuOpen, setIsPlusMenuOpen] = useState(false);
  const [composerMode, setComposerMode] = useState<'message' | 'grocery_list' | 'meal' | 'plan'>(
    viewMode === 'messages' ? 'message' : viewMode,
  );
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [mealTime, setMealTime] = useState('');
  const [planDate, setPlanDate] = useState('');
  const [planTime, setPlanTime] = useState('');
  const [draftCheckedItems, setDraftCheckedItems] = useState<number[]>([]);
  const [isPollSheetOpen, setIsPollSheetOpen] = useState(false);
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
  const [isTitleCollapsed, setIsTitleCollapsed] = useState(false);
  const [messageRevealPhase, setMessageRevealPhase] = useState<'waiting' | 'loading' | 'revealing' | 'shown'>('waiting');
  const [showMessageLoader, setShowMessageLoader] = useState(false);

  // Virtual keyboard tracking for mobile (using accurate visualViewport bottom offset)
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const isInputFocusedRef = useRef(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerFormRef = useRef<HTMLFormElement>(null);
  const [mentionListPosition, setMentionListPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const mealTimeInputRef = useRef<HTMLInputElement>(null);
  const planDateInputRef = useRef<HTMLInputElement>(null);
  const planTimeInputRef = useRef<HTMLInputElement>(null);
  const isFilteredView = viewMode !== 'messages';
  const pageTitle = isFilteredView
    ? viewMode === 'grocery_list' ? t('Groceries') : t('Plans')
    : currentTrip?.name || '';
  const seenCallIdsRef = useRef(new Set<string>());
  const trackedCallRef = useRef<{ callId: string; startedAt: number } | null>(null);

  useEffect(() => {
    if (isFilteredView) return;
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
  }, [call.activeCall, call.lastCallState, call.participants, isFilteredView, messages, sendMessage, t, updateMessage]);

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
    isInputFocusedRef.current = true;
    notifyKeyboard(true);
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    window.requestAnimationFrame(() => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    });
    window.setTimeout(() => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }, 80);
    const offset = calcKeyboardOffset();
    setKeyboardOffset(offset);
    setTimeout(() => {
      setKeyboardOffset(calcKeyboardOffset());
    }, 60);
  };

  const handleBlur = () => {
    setTimeout(() => {
      // If the activeElement is still textarea, do NOT close!
      if (document.activeElement === textareaRef.current) {
        return;
      }
      isInputFocusedRef.current = false;
      const offset = calcKeyboardOffset();
      if (offset <= 20) {
        notifyKeyboard(false);
        setKeyboardOffset(0);
      }
    }, 120);
  };

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
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages.length]);

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
      textarea.style.height = `${Math.max(40, scrollH)}px`;
    }
  };

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.max(40, textarea.scrollHeight)}px`;
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

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const newPos = replacedBefore.length;
        textareaRef.current.setSelectionRange(newPos, newPos);
        textareaRef.current.style.height = 'auto';
        const scrollH = textareaRef.current.scrollHeight;
        textareaRef.current.style.height = `${Math.max(40, scrollH)}px`;
      }
    }, 20);
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
    const previousMetadata = editing?.metadata || {};
    const previousCheckedByText = new Map<string, boolean[]>();
    for (const item of previousMetadata.items || []) {
      const matchingItems = previousCheckedByText.get(item.text) || [];
      matchingItems.push(Boolean(item.checked));
      previousCheckedByText.set(item.text, matchingItems);
    }
    const metadata = pendingPhoto
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
          await sendMessage(clean);
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
    const gameId = crypto.randomUUID();
    const { error } = await supabase.from('draw_games').insert({
      id: gameId,
      trip_id: currentTrip.id,
      creator_id: user.id,
      status: 'lobby',
      players: [user.id],
      participant_ids: [user.id],
      scores: {},
      drawing: [],
    });
    if (error) {
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

  const visibleMessages = isFilteredView
    ? messages.filter((message) => message.type === viewMode)
    : messages.filter((message) => message.type !== 'grocery_list' && message.type !== 'plan');

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
    setIsTitleCollapsed(event.currentTarget.scrollTop > 40);
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

  useEffect(() => {
    if (mentionQuery === null || mentionCandidates.length === 0) {
      setMentionListPosition(null);
      return;
    }
    const updatePosition = () => {
      const rect = composerFormRef.current?.getBoundingClientRect();
      if (!rect) return;
      const height = Math.min(mentionCandidates.length * 44, 224);
      setMentionListPosition({
        top: Math.max(8, rect.top - height - 8),
        left: rect.left,
        width: rect.width,
      });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    window.visualViewport?.addEventListener('resize', updatePosition);
    window.visualViewport?.addEventListener('scroll', updatePosition);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      window.visualViewport?.removeEventListener('resize', updatePosition);
      window.visualViewport?.removeEventListener('scroll', updatePosition);
    };
  }, [mentionCandidates.length, mentionQuery]);

  if (!currentTrip) {
    return null;
  }

  return (
    <div className="h-full w-full flex flex-col bg-black text-white overflow-hidden relative select-none">
      {/* Top Header - Trip Title & Exit Button (Extended cleanly through top danger zone) */}
      <div
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
        className="relative isolate z-20 w-full shrink-0"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -top-8 -bottom-16"
          style={{
            backgroundImage: 'linear-gradient(to bottom, rgba(0,0,0,0.98) 0%, rgba(0,0,0,0.94) 36%, rgba(0,0,0,0.72) 62%, rgba(0,0,0,0) 100%)',
          }}
        />
        <div className="relative z-10 h-14 w-full flex items-center justify-between px-3.5">
          {!isFilteredView ? (
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

          <div className="flex max-w-[200px] flex-col items-center truncate text-center">
            <span className={`truncate text-base font-bold tracking-tight text-white transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              isTitleCollapsed ? 'translate-y-0 scale-100 opacity-100' : 'pointer-events-none translate-y-2 scale-95 opacity-0'
            }`}>
              {pageTitle}
            </span>
            <span className="text-[11px] text-slate-400 font-medium -mt-0.5">
              {tripMembers.length} {tripMembers.length === 1 ? t('Member') : t('members')}
            </span>
          </div>

          {!isFilteredView ? (
            <div className="w-14 flex justify-end">
              <button
                ref={callButtonRef}
                type="button"
                aria-label={t('Start a call')}
                aria-expanded={isCallMenuOpen}
                onClick={() => {
                  if (isCallMenuOpen) {
                    setIsCallMenuOpen(false);
                    return;
                  }
                  const rect = callButtonRef.current?.getBoundingClientRect();
                  if (rect) setCallMenuPosition({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
                  setIsCallMenuOpen(true);
                }}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0A84FF] text-white shadow-lg active:scale-95"
              >
                <Phone size={20} weight="fill" />
              </button>
            </div>
          ) : <div className="w-14" />}
        </div>
      </div>

      {/* Pinned Polls Banner */}
      {!isFilteredView && !call.activeCall && !call.incomingCall && call.callError && (
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

      {!isFilteredView && <PinnedPolls
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
          onClick={handleEmptySpaceTap}
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
      {replyingTo && !isFilteredView && (
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
            : 'calc(42px + env(safe-area-inset-bottom, 0px))',
        }}
        data-reaction-clearance
        className="absolute left-3.5 right-3.5 z-30 pointer-events-auto transition-[bottom] duration-150 ease-out"
      >
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
        <form ref={composerFormRef} onSubmit={handleSend} className="relative flex items-end gap-2">
          {/* Type-specific tabs have a fixed composer mode and do not show mode toggles. */}
          {!isFilteredView && <button
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
          {!isFilteredView && isPlusMenuOpen && (
            <>
              <div
                onClick={() => setIsPlusMenuOpen(false)}
                className="fixed inset-0 z-30 bg-transparent"
              />
              <div
                style={{
                  backdropFilter: 'blur(30px) saturate(190%)',
                  WebkitBackdropFilter: 'blur(30px) saturate(190%)',
                  backgroundColor: 'rgba(28, 28, 32, 0.94)',
                }}
                data-reaction-clearance
                className="absolute left-0 bottom-14 z-40 flex w-48 flex-col border border-white/[0.14] rounded-[24px] p-2 shadow-[0_16px_40px_rgba(0,0,0,0.6)] origin-bottom-left animate-pop-in"
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
                      window.setTimeout(() => {
                        const textarea = textareaRef.current;
                        if (!textarea) return;
                        textarea.focus({ preventScroll: true });
                        textarea.setSelectionRange(0, 0);
                      }, 40);
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
                  onClick={() => void createDrawGame()}
                  className="order-4 w-full h-11 px-3.5 rounded-[18px] flex items-center gap-3 text-sm font-semibold text-white hover:bg-white/10 active:scale-98 cursor-pointer transition-all"
                >
                  <div className="w-7 h-7 rounded-full bg-violet-500/20 flex items-center justify-center text-violet-300">
                    <GameController size={16} weight="bold" />
                  </div>
                  <span>{t('Draw and Guess')}</span>
                </button>
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
              </div>
            </>
          )}

          {onlineMembers.length > 0 && (
            <div
              aria-label={`${onlineMembers.length} members currently active`}
              title={`${onlineMembers.length} members currently active`}
              className="absolute bottom-[calc(100%+8px)] right-0 flex shrink-0 items-center justify-end -space-x-2"
            >
              {onlineMembers.slice(0, 7).map((member) => (
                <button
                  key={member.userId}
                  type="button"
                  onClick={() => setSelectedProfileId(member.userId)}
                  aria-label={`${t('View profile')}: ${member.profile.display_name}`}
                  className="relative rounded-full border-2 border-black"
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
                <span className="flex h-7 min-w-7 items-center justify-center rounded-full border-2 border-black bg-[#303036] px-1 text-[10px] font-bold text-white">
                  +{onlineMembers.length - 7}
                </span>
              )}
            </div>
          )}

          <div className="flex min-w-0 flex-1 flex-col">
            {(composerMode === 'meal' || composerMode === 'plan') && (
              <div className="mb-1.5 flex min-h-8 min-w-0 items-center gap-3 pl-1">
                {composerMode === 'plan' && (
                  <label className="relative inline-flex min-h-8 shrink-0 cursor-pointer items-center whitespace-nowrap text-sm font-medium text-slate-400 active:text-white">
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
                )}
                {composerMode === 'meal' && (
                  <label className="relative inline-flex min-h-8 shrink-0 cursor-pointer items-center whitespace-nowrap text-sm font-medium text-slate-400 active:text-white">
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
                {composerMode === 'plan' && (
                  <label className="relative inline-flex min-h-8 shrink-0 cursor-pointer items-center whitespace-nowrap text-sm font-medium text-slate-400 active:text-white">
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
                )}
              </div>
            )}

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
                className={`flex-1 bg-transparent text-white placeholder:text-slate-400 text-[16px] resize-none outline-none py-2.5 leading-[1.38] overflow-y-hidden ${
                  composerMode === 'grocery_list' ? 'pl-8' : ''
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
      {!isFilteredView && <PollSheet
        isOpen={isPollSheetOpen}
        onClose={() => setIsPollSheetOpen(false)}
        onCreatePoll={createPoll}
      />}
      <MemberProfileSheet
        profile={tripMembers.find((member) => member.user_id === selectedProfileId)?.profile || null}
        location={sharedLocations.find((location) => location.user_id === selectedProfileId)}
        onClose={() => setSelectedProfileId(null)}
        onMention={() => {
          const member = tripMembers.find((candidate) => candidate.user_id === selectedProfileId);
          setSelectedProfileId(null);
          if (member) window.setTimeout(() => handleSelectMention(member), 300);
        }}
      />
      {activeDrawGameId && user && (
        <DrawGuessGame
          gameId={activeDrawGameId}
          userId={user.id}
          members={tripMembers}
          onClose={() => setActiveDrawGameId(null)}
          sendMessage={sendMessage}
        />
      )}

      {mentionQuery !== null && mentionCandidates.length > 0 && mentionListPosition && createPortal(
        <div
          style={{
            top: `${mentionListPosition.top}px`,
            left: `${mentionListPosition.left}px`,
            width: `${mentionListPosition.width}px`,
          }}
          className="fixed z-[12002] flex max-h-56 flex-col items-start overflow-y-auto animate-calm-fade-in"
        >
          {mentionCandidates.map((member) => (
            <button
              key={member.user_id}
              type="button"
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => handleSelectMention(member)}
              className="mention-autocomplete-item flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2 py-1 text-left transition-colors hover:text-sky-200 active:text-sky-200"
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
                  backdropFilter: 'blur(24px) saturate(180%)',
                  WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                }}
                initial={{ opacity: 0, scale: 0.88, y: -5 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: -3 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                className="fixed z-[10001] w-52 rounded-2xl border border-white/10 bg-[#202024]/90 p-2 shadow-xl"
              >
                <div className="px-3 py-1.5 text-xs font-semibold text-slate-400">{t('Start a call')}</div>
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
                    className="flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold text-white hover:bg-white/10"
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
