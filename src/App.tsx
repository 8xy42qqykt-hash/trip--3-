import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, animate, useMotionValue } from 'motion/react';
import { GameController, X } from '@phosphor-icons/react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { TripProvider, useTrip } from './context/TripContext';
import { ThemeProvider } from './context/ThemeContext';
import { AuthScreen } from './components/auth/AuthScreen';
import { TripGate } from './components/trip/TripGate';
import { BottomTabBar, TabKey } from './components/navigation/BottomTabBar';
import { MessagesView } from './components/messages/MessagesView';
import { CallOverlay } from './components/messages/CallOverlay';
import { SettingsView } from './components/settings/SettingsView';
import tripLogo from '../trip-logo.png';
import { useTripPresence } from './components/messages/useTripPresence';
import { useGroupCall } from './components/messages/useGroupCall';
import { TripOverview } from './components/trip/TripOverview';
import { TripLocationTracker } from './components/trip/TripLocationTracker';
import { LanguageProvider } from './context/LanguageContext';
import { useLanguage } from './context/LanguageContext';

type AppViewKey = 'trips' | TabKey;
type GameLobbyNotice = {
  id: string;
  type: 'draw_game' | 'game_session';
  title: string;
  sender: string;
};

const VIEW_INDEX: Record<AppViewKey, number> = {
  trips: -1,
  messages: 0,
  schedule: 1,
  groceries: 2,
  games: 2,
  my_trip: 3,
  settings: 4,
};

const CountdownDigit: React.FC<{ digit: string }> = ({ digit }) => (
  <span className="relative inline-block h-[1.1em] w-[0.62em] overflow-hidden">
    <AnimatePresence initial={false} mode="popLayout">
      <motion.span
        key={digit}
        initial={{ y: '105%', opacity: 0, filter: 'blur(6px)' }}
        animate={{ y: '0%', opacity: 1, filter: 'blur(0px)' }}
        exit={{ y: '-105%', opacity: 0, filter: 'blur(6px)' }}
        transition={{ type: 'spring', stiffness: 240, damping: 22, mass: 0.75 }}
        className="absolute inset-0 block"
      >
        {digit}
      </motion.span>
    </AnimatePresence>
  </span>
);

const CountdownValue: React.FC<{ value: number }> = ({ value }) => (
  <span className="inline-flex justify-center text-[clamp(2.6rem,11vw,5.5rem)] font-black leading-none tracking-[-0.075em] tabular-nums">
    {String(value).padStart(2, '0').split('').map((digit, index) => (
      <CountdownDigit key={index} digit={digit} />
    ))}
  </span>
);

const TripCountdownOverlay: React.FC<{
  tripName: string;
  startDate: string;
  onDismiss: () => void;
  t: (value: string) => string;
  language: 'en' | 'fi';
}> = ({ tripName, startDate, onDismiss, t, language }) => {
  const [now, setNow] = useState(Date.now());
  const [showEntryHint, setShowEntryHint] = useState(false);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    const hintTimer = window.setTimeout(() => setShowEntryHint(true), 1000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(hintTimer);
    };
  }, []);

  const remaining = Math.max(0, new Date(`${startDate}T00:00:00`).getTime() - now);
  const totalSeconds = Math.floor(remaining / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const countdownValues = [days, hours, minutes, seconds];

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={`${tripName}: ${days} ${t('Days')}, ${hours} ${t('Hours')}, ${minutes} ${t('Minutes')}, ${seconds} ${t('Seconds')}`}
      onClick={onDismiss}
      onKeyDown={(event) => {
        if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') onDismiss();
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="countdown-backdrop fixed inset-0 z-[10000] flex items-center justify-center px-4 pb-safe"
    >
      <motion.div
        initial={{ y: 18, scale: 0.97, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 180, damping: 22 }}
        className="w-full max-w-sm text-center"
      >
        <div className="mb-7 flex items-center justify-center gap-1 text-white sm:gap-2" aria-hidden="true">
          {countdownValues.map((value, index) => (
            <React.Fragment key={index}>
              {index > 0 && <span className="self-start pb-1 text-[clamp(2rem,8vw,4rem)] font-black text-white">.</span>}
              <CountdownValue value={value} />
            </React.Fragment>
          ))}
        </div>
        <h2 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">{tripName}</h2>
        <p className="mt-2 text-sm text-slate-400">
          {new Date(`${startDate}T12:00:00`).toLocaleDateString(language === 'fi' ? 'fi-FI' : 'en-US', { dateStyle: 'full' })}
        </p>
        <AnimatePresence>
          {showEntryHint && (
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 2rem)' }}
              className="fixed left-0 right-0 text-center text-sm font-medium text-white/70"
            >
              {t('Click anywhere to enter')}
            </motion.p>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
};

const MainAppContent: React.FC = () => {
  const { setLanguage, t, language } = useLanguage();
  const { user, profile, isLoading } = useAuth();
  const { currentTrip, userTrips, selectTrip, exitTrip, isLoadingTrips, isLoadingMessages, hasLoadedMessages, messages, tripMembers } = useTrip();
  const [activeTab, setActiveTab] = useState<TabKey>('messages');
  const [secondaryTab, setSecondaryTab] = useState<'groceries' | 'games'>(() => {
    const saved = window.localStorage.getItem(`trip:secondary-tab:${user?.id || 'guest'}`);
    return saved === 'groceries' ? 'groceries' : 'games';
  });
  const [slideDirection, setSlideDirection] = useState<number>(0);
  const [isForcedReady, setIsForcedReady] = useState(false);
  const [isLaunchAnimationVisible, setIsLaunchAnimationVisible] = useState(false);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [showTripCountdown, setShowTripCountdown] = useState(false);
  const [isPhotoViewerOpen, setIsPhotoViewerOpen] = useState(false);
  const [countdownShownTripId, setCountdownShownTripId] = useState<string | null>(null);
  const [targetMention, setTargetMention] = useState<string | undefined>(undefined);
  const [gameLobbyNotice, setGameLobbyNotice] = useState<GameLobbyNotice | null>(null);
  const [gameOpenRequest, setGameOpenRequest] = useState<(GameLobbyNotice & { requestId: number }) | null>(null);
  const seenGameMessagesRef = useRef(new Set<string>());
  const gameMessageBaselineTripRef = useRef<string | null>(null);
  const gameMessageBaselineReadyRef = useRef(false);
  const gameOpenRequestSequenceRef = useRef(0);
  const onlineMembers = useTripPresence(
    currentTrip?.id,
    user?.id,
    profile,
    activeTab === 'messages' || activeTab === 'games',
  );
  const call = useGroupCall(currentTrip?.id, user?.id, profile);

  useEffect(() => {
    if (!currentTrip) {
      gameMessageBaselineTripRef.current = null;
      gameMessageBaselineReadyRef.current = false;
      seenGameMessagesRef.current.clear();
      setGameLobbyNotice(null);
      return;
    }
    if (gameMessageBaselineTripRef.current !== currentTrip.id) {
      gameMessageBaselineTripRef.current = currentTrip.id;
      gameMessageBaselineReadyRef.current = false;
      seenGameMessagesRef.current.clear();
    }
    if (isLoadingMessages || !hasLoadedMessages) return;

    const gameMessages = messages.filter((message) => (
      (message.type === 'draw_game' || message.type === 'game_session')
      && message.trip_id === currentTrip.id
    ));
    if (!gameMessageBaselineReadyRef.current) {
      gameMessages.forEach((message) => seenGameMessagesRef.current.add(message.id));
      gameMessageBaselineReadyRef.current = true;
      return;
    }

    const newInvitations = gameMessages.filter((message) => (
      !seenGameMessagesRef.current.has(message.id) && message.user_id !== user?.id
    ));
    gameMessages.forEach((message) => seenGameMessagesRef.current.add(message.id));
    const invitation = newInvitations[newInvitations.length - 1];
    if (!invitation) return;
    if (!onlineMembers.some((member) => member.userId !== user?.id)) return;
    const isDrawGame = invitation.type === 'draw_game';
    const invitationType = isDrawGame ? 'draw_game' : 'game_session';
    const gameId = isDrawGame
      ? invitation.metadata?.gameId
      : invitation.metadata?.gameSessionId;
    if (typeof gameId !== 'string' || !gameId) return;
    const gameType = invitation.metadata?.gameType;
    const titleKey = isDrawGame
      ? 'Draw and Guess'
      : gameType === 'connect_four' ? 'Connect Four' : 'Tic-Tac-Toe';
    const sender = tripMembers.find((member) => member.user_id === invitation.user_id)?.profile?.display_name
      || t('Member');
    setGameLobbyNotice({ id: gameId, type: invitationType, title: t(titleKey), sender });
  }, [currentTrip?.id, hasLoadedMessages, isLoadingMessages, messages, onlineMembers, tripMembers, user?.id, t]);

  useEffect(() => {
    if (!gameLobbyNotice) return;
    const timer = window.setTimeout(() => setGameLobbyNotice(null), 9000);
    return () => window.clearTimeout(timer);
  }, [gameLobbyNotice]);

  const openGameLobbyNotice = (notice: GameLobbyNotice) => {
    setSecondaryTab('games');
    window.localStorage.setItem(`trip:secondary-tab:${user?.id || 'guest'}`, 'games');
    setGameOpenRequest({ ...notice, requestId: ++gameOpenRequestSequenceRef.current });
    setGameLobbyNotice(null);
    if (activeTab !== 'games') handleTabChange('games');
  };

  useEffect(() => {
    const saved = window.localStorage.getItem(`trip:secondary-tab:${user?.id || 'guest'}`);
    setSecondaryTab(saved === 'groceries' ? 'groceries' : 'games');
  }, [user?.id]);

  const handleSecondaryTabChange = (nextTab: 'groceries' | 'games') => {
    setSecondaryTab(nextTab);
    window.localStorage.setItem(`trip:secondary-tab:${user?.id || 'guest'}`, nextTab);
    if (activeTab === 'groceries' || activeTab === 'games') {
      setActiveTab(nextTab);
    }
  };

  const prevTripIdRef = useRef<string | null>(null);
  const prevViewRef = useRef<AppViewKey>('trips');
  const deepLinkHandledRef = useRef(false);
  const swipeStartRef = useRef<{ x: number; y: number; startedAt: number; pointerId: number } | null>(null);
  const swipeOffset = useMotionValue(0);
  const adjacentViewOffset = useMotionValue(0);
  const [swipeNeighbor, setSwipeNeighbor] = useState<AppViewKey | null>(null);
  const [isSwipeDragging, setIsSwipeDragging] = useState(false);
  const swipeNeighborRef = useRef<AppViewKey | null>(null);
  const swipeDirectionRef = useRef<number>(0);
  const tripExitDirectionRef = useRef<number | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('_appUpdate')) return;
    url.searchParams.delete('_appUpdate');
    window.history.replaceState(window.history.state, '', url);
  }, []);

  useEffect(() => {
    if (profile?.language === 'en' || profile?.language === 'fi') {
      setLanguage(profile.language);
    }
  }, [profile?.language, setLanguage]);

  useEffect(() => {
    if (deepLinkHandledRef.current || !user) return;
    const params = new URLSearchParams(window.location.search);
    const invitationId = params.get('invitation');
    const tripId = params.get('trip');
    const callId = params.get('joinCall');
    const view = params.get('view');
    if (invitationId) {
      setActiveTab('trips');
      deepLinkHandledRef.current = true;
      return;
    }
    if (!tripId) return;
    const targetTrip = userTrips.find((trip) => trip.id === tripId);
    if (!targetTrip) {
      if (userTrips.length > 0) {
        setActiveTab('trips');
        deepLinkHandledRef.current = true;
      }
      return;
    }
    if (currentTrip?.id !== targetTrip.id) selectTrip(targetTrip);
    const targetTab: TabKey = view === 'groceries' ? 'groceries'
      : view === 'games' ? 'games'
      : view === 'schedule' ? 'schedule'
        : view === 'my_trip' ? 'my_trip'
          : view === 'settings' ? 'settings'
            : 'messages';
    setActiveTab(targetTab);
    deepLinkHandledRef.current = true;
    if (callId) {
      window.setTimeout(() => { void call.joinCall(callId); }, 700);
    }
  }, [call, currentTrip?.id, selectTrip, user, userTrips]);

  // Splash timeout of 1.2s to guarantee first-time visitor never hangs
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsForcedReady(true);
    }, 1200);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (isLoading || !user) return;
    setIsLaunchAnimationVisible(true);
    const timer = window.setTimeout(() => setIsLaunchAnimationVisible(false), 1250);
    return () => window.clearTimeout(timer);
  }, [isLoading, user?.id]);

  useEffect(() => {
    if (
      !currentTrip
      || isLoading
      || isLoadingTrips
      || isLoadingMessages
      || isLaunchAnimationVisible
      || countdownShownTripId === currentTrip.id
      || new Date(`${currentTrip.start_date}T00:00:00`).getTime() <= Date.now()
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      setCountdownShownTripId(currentTrip.id);
      setShowTripCountdown(true);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [
    countdownShownTripId,
    currentTrip,
    isLaunchAnimationVisible,
    isLoading,
    isLoadingMessages,
    isLoadingTrips,
  ]);

  // Listen to keyboard toggle events across all views
  useEffect(() => {
    const handleKb = (e: any) => {
      if (typeof e?.detail?.isOpen === 'boolean') {
        setIsKeyboardOpen(e.detail.isOpen);
      }
    };
    window.addEventListener('trip:keyboard-toggle', handleKb);
    return () => {
      window.removeEventListener('trip:keyboard-toggle', handleKb);
    };
  }, []);

  // Animate slide when selecting or exiting trips (in opposite direction as requested)
  useEffect(() => {
    const currentTripId = currentTrip?.id || null;
    if (prevTripIdRef.current === null && currentTripId !== null) {
      setSlideDirection(1);
      if (!deepLinkHandledRef.current) setActiveTab('messages');
      setIsKeyboardOpen(false);
    } else if (prevTripIdRef.current !== null && currentTripId === null) {
      setSlideDirection(tripExitDirectionRef.current
        ?? (activeTab === 'my_trip' || activeTab === 'settings' || activeTab === 'messages' ? -1 : 1));
      tripExitDirectionRef.current = null;
      setIsKeyboardOpen(false);
    }
    prevTripIdRef.current = currentTripId;
  }, [activeTab, currentTrip?.id]);

  const activeView: AppViewKey = !currentTrip ? 'trips' : activeTab;

  useEffect(() => {
    document.querySelectorAll<HTMLElement>('[data-view-key]').forEach((view) => {
      view.dataset.appView = view.dataset.viewKey === activeView ? 'active' : 'inactive';
    });
    prevViewRef.current = activeView;
  }, [activeView]);

  const handleTabChange = (newTab: TabKey) => {
    if (showTripCountdown) setShowTripCountdown(false);
    if (newTab === activeTab) return;
    const prevIdx = VIEW_INDEX[activeTab];
    const newIdx = VIEW_INDEX[newTab];
    setSlideDirection(newIdx > prevIdx ? 1 : -1);
    setActiveTab(newTab);
    setIsKeyboardOpen(false);
  };

  const handleNavigateToMessages = (mentionName?: string) => {
    const prevIdx = VIEW_INDEX[activeTab];
    const newIdx = VIEW_INDEX['messages'];
    setSlideDirection(newIdx > prevIdx ? 1 : -1);
    setActiveTab('messages');
    setTargetMention(mentionName);
  };

  const getAdjacentView = (view: AppViewKey, direction: number): AppViewKey | null => {
    if (view === 'trips') return null;
    const tabs: TabKey[] = ['messages', 'schedule', secondaryTab, 'my_trip', 'settings'];
    const index = tabs.indexOf(view);
    if (direction < 0) return index <= 0 ? 'trips' : tabs[index - 1];
    return tabs[index + 1] || null;
  };

  const handleSwipePointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType === 'mouse' || !currentTrip || activeView === 'trips') return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('input, textarea, button, select, video, [contenteditable="true"], [data-no-view-swipe], .chat-bubble-touch, .leaflet-container, [role="dialog"]')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    swipeStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      startedAt: performance.now(),
      pointerId: event.pointerId,
    };
    swipeNeighborRef.current = null;
    swipeDirectionRef.current = 0;
    setIsSwipeDragging(false);
    swipeOffset.set(0);
    adjacentViewOffset.set(0);
  };

  const handleSwipePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const start = swipeStartRef.current;
    if (!start || event.pointerId !== start.pointerId) return;
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.abs(deltaY) > 24 && Math.abs(deltaY) > Math.abs(deltaX)) {
      swipeStartRef.current = null;
      return;
    }
    if (Math.abs(deltaX) < Math.abs(deltaY) || Math.abs(deltaX) < 8) return;

    event.preventDefault();
    setIsSwipeDragging(true);
    const direction = deltaX > 0 ? -1 : 1;
    const neighbor = getAdjacentView(activeView, direction);
    if (swipeNeighborRef.current !== neighbor) {
      swipeNeighborRef.current = neighbor;
      setSwipeNeighbor(neighbor);
      swipeDirectionRef.current = neighbor ? direction : 0;
    }
    const width = window.innerWidth;
    const offset = neighbor
      ? Math.max(-width, Math.min(width, deltaX))
      : Math.max(-width * 0.18, Math.min(width * 0.18, deltaX * 0.18));
    swipeOffset.set(offset);
    adjacentViewOffset.set(offset + (neighbor ? direction * width : 0));
  };

  const handleSwipePointerUp = (event: React.PointerEvent<HTMLElement>, cancelled = false) => {
    const start = swipeStartRef.current;
    if (!start || event.pointerId !== start.pointerId) return;
    swipeStartRef.current = null;
    const neighbor = swipeNeighborRef.current;
    if (!neighbor) {
      setIsSwipeDragging(false);
      swipeOffset.set(0);
      adjacentViewOffset.set(0);
      return;
    }

    const deltaX = event.clientX - start.x;
    const elapsed = Math.max(1, performance.now() - start.startedAt);
    const velocity = deltaX / elapsed;
    const width = window.innerWidth;
    const shouldCommit = !cancelled
      && (Math.abs(deltaX) >= width * 0.22 || (Math.abs(deltaX) >= 42 && Math.abs(velocity) >= 0.45));
    const target = shouldCommit ? (deltaX > 0 ? width : -width) : 0;
    const neighborDirection = swipeDirectionRef.current;

    animate(swipeOffset, target, {
      duration: shouldCommit ? 0.22 : 0.18,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (value) => adjacentViewOffset.set(value + neighborDirection * width),
      onComplete: () => {
        if (shouldCommit) {
          setSlideDirection(0);
          setIsKeyboardOpen(false);
          if (neighbor === 'trips') {
            tripExitDirectionRef.current = 0;
            exitTrip();
          } else {
            setActiveTab(neighbor);
          }
        }
        swipeNeighborRef.current = null;
        swipeDirectionRef.current = 0;
        setSwipeNeighbor(null);
        setIsSwipeDragging(false);
        swipeOffset.set(0);
        adjacentViewOffset.set(0);
      },
    });
  };

  const renderViewContent = (view: AppViewKey) => {
    if (view === 'trips') {
      return (
        <TripGate
          onTripSelecting={() => setSlideDirection(1)}
          onTripSelected={() => setActiveTab('messages')}
        />
      );
    }
    if (view === 'messages') {
      return (
        <MessagesView
          onKeyboardStateChange={setIsKeyboardOpen}
          onPhotoViewerChange={setIsPhotoViewerOpen}
          initialMention={targetMention}
          onClearInitialMention={() => setTargetMention(undefined)}
          onlineMembers={onlineMembers}
          call={call}
        />
      );
    }
    if (view === 'groceries') {
      return <MessagesView viewMode="grocery_list" onlineMembers={onlineMembers} call={call} />;
    }
    if (view === 'games') {
      return (
        <MessagesView
          viewMode="games"
          onlineMembers={onlineMembers}
          call={call}
          gameOpenRequest={gameOpenRequest}
          onGameOpenRequestHandled={() => setGameOpenRequest(null)}
        />
      );
    }
    if (view === 'schedule') {
      return <MessagesView viewMode="plan" onlineMembers={onlineMembers} call={call} />;
    }
    if (view === 'my_trip') {
      return <TripOverview onPhotoViewerChange={setIsPhotoViewerOpen} />;
    }
    return (
      <SettingsView
        onNavigateToMessages={handleNavigateToMessages}
        secondaryTab={secondaryTab}
        onSecondaryTabChange={handleSecondaryTabChange}
      />
    );
  };

  // Splash screen until session resolves
  if (isLoading && !isForcedReady) {
    return (
      <div className="fixed inset-0 w-full h-full flex items-center justify-center bg-black">
        <img src={tripLogo} alt="Trip" className="w-16 h-16 object-contain animate-pulse" />
      </div>
    );
  }

  // Not signed in: Auth screen
  if (!user) {
    return <AuthScreen />;
  }

  // Signed in: Main layout with seamless sliding between Trips and Tabs
  return (
    <div className="fixed inset-0 h-[100dvh] w-full flex flex-col bg-black text-white overflow-hidden select-none">
      <main
        className="flex-1 w-full overflow-hidden relative"
        onPointerDown={handleSwipePointerDown}
        onPointerMove={handleSwipePointerMove}
        onPointerUp={handleSwipePointerUp}
        onPointerCancel={(event) => handleSwipePointerUp(event, true)}
        style={{ touchAction: 'pan-y' }}
      >
        <AnimatePresence initial={false} custom={slideDirection} mode="popLayout">
          <motion.div
            key={activeView}
            custom={slideDirection}
            variants={{
              enter: (dir: number) => ({
                x: dir > 0 ? '100%' : dir < 0 ? '-100%' : 0,
                opacity: 1,
              }),
              center: {
                x: 0,
                opacity: 1,
              },
              exit: (dir: number) => ({
                x: dir > 0 ? '-100%' : dir < 0 ? '100%' : 0,
                opacity: 1,
              }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{
              x: { type: 'spring', stiffness: 380, damping: 36 },
              opacity: { duration: 0.15 },
            }}
            style={isSwipeDragging ? { x: swipeOffset } : undefined}
            className="absolute inset-0 z-10 flex h-full w-full flex-col overflow-hidden"
            data-view-key={activeView}
            data-app-view="inactive"
          >
            {renderViewContent(activeView)}
          </motion.div>
        </AnimatePresence>
        {swipeNeighbor && (
          <motion.div
            aria-hidden="true"
            initial={false}
            style={{ x: adjacentViewOffset }}
            className="absolute inset-0 z-20 flex h-full w-full flex-col overflow-hidden"
            data-view-key={swipeNeighbor}
            data-app-view="inactive"
          >
            {renderViewContent(swipeNeighbor)}
          </motion.div>
        )}
      </main>

      {currentTrip && user && (
        <TripLocationTracker tripId={currentTrip.id} userId={user.id} />
      )}

      {/* Nav bar is completely closed whenever input is active/focused or outside of active trip */}
      <BottomTabBar
        activeTab={activeTab}
        onChangeTab={handleTabChange}
        secondaryTab={secondaryTab}
        isHidden={!currentTrip || isPhotoViewerOpen || (isKeyboardOpen && activeTab === 'messages')}
        hidden={!currentTrip || isPhotoViewerOpen || (isKeyboardOpen && activeTab === 'messages')}
      />
      <AnimatePresence>
        {gameLobbyNotice && (
          <motion.div
            initial={{ opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            role="status"
            className="fixed left-3 right-3 top-[calc(env(safe-area-inset-top,0px)+0.75rem)] z-[14000] mx-auto flex max-w-lg items-center gap-3 rounded-2xl border border-white/10 bg-[#202024]/95 p-3.5 text-white shadow-2xl backdrop-blur-xl"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#0A84FF]/15 text-[#0A84FF]">
              <GameController size={22} weight="fill" />
            </span>
            <button type="button" onClick={() => openGameLobbyNotice(gameLobbyNotice)} className="min-w-0 flex-1 text-left">
              <span className="block truncate text-sm font-bold">{gameLobbyNotice.title}</span>
              <span className="mt-0.5 block truncate text-xs text-white/65">
                {t('Game lobby started by')} {gameLobbyNotice.sender} · {t('Tap to join')}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setGameLobbyNotice(null)}
              aria-label={t('Dismiss')}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/60 hover:bg-white/10"
            >
              <X size={18} weight="bold" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showTripCountdown && currentTrip && (
          <TripCountdownOverlay
            key={currentTrip.id}
            tripName={currentTrip.name}
            startDate={currentTrip.start_date}
            onDismiss={() => setShowTripCountdown(false)}
            t={t}
            language={language}
          />
        )}
      </AnimatePresence>
      {isLaunchAnimationVisible && (
        <motion.div
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 1.2, delay: 0.38, ease: 'easeOut' }}
          className="pointer-events-none fixed inset-0 z-[20000] flex items-center justify-center bg-black"
          aria-hidden="true"
        >
          <motion.img
            src={tripLogo}
            alt=""
            initial={{ scale: 1 }}
            animate={{ scale: [1, 0.78, 1, 4.4], opacity: [1, 1, 1, 0] }}
            transition={{
              duration: 1.2,
              times: [0, 0.18, 0.38, 1],
              ease: [0.16, 1, 0.3, 1],
            }}
            className="h-16 w-16 object-contain"
          />
        </motion.div>
      )}
      {activeTab === 'messages' && (call.activeCall || call.incomingCall) && (
        <CallOverlay call={call} userId={user?.id} />
      )}
    </div>
  );
};

export default function App() {
  return (
    <LanguageProvider>
      <ThemeProvider>
        <AuthProvider>
          <TripProvider>
            <MainAppContent />
          </TripProvider>
        </AuthProvider>
      </ThemeProvider>
    </LanguageProvider>
  );
}
