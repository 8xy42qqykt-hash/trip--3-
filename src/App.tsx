import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, animate, useMotionValue } from 'motion/react';
import { ArrowLeft, ArrowRight } from '@phosphor-icons/react';
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

const VIEW_INDEX: Record<AppViewKey, number> = {
  trips: -1,
  messages: 0,
  groceries: 1,
  schedule: 2,
  my_trip: 3,
  settings: 4,
};

const MainAppContent: React.FC = () => {
  const { setLanguage } = useLanguage();
  const { user, profile, isLoading } = useAuth();
  const { currentTrip, userTrips, selectTrip, exitTrip } = useTrip();
  const [activeTab, setActiveTab] = useState<TabKey>('messages');
  const [slideDirection, setSlideDirection] = useState<number>(0);
  const [isForcedReady, setIsForcedReady] = useState(false);
  const [isLaunchAnimationVisible, setIsLaunchAnimationVisible] = useState(false);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [targetMention, setTargetMention] = useState<string | undefined>(undefined);
  const onlineMembers = useTripPresence(currentTrip?.id, user?.id, profile, activeTab === 'messages');
  const call = useGroupCall(currentTrip?.id, user?.id, profile);

  const prevTripIdRef = useRef<string | null>(null);
  const prevViewRef = useRef<AppViewKey>('trips');
  const deepLinkHandledRef = useRef(false);
  const edgeSwipeRef = useRef<{ x: number; y: number; side: 'left' | 'right' | null; pointerId: number } | null>(null);
  const edgeSwipeOffset = useMotionValue(0);
  const [edgeSwipeSide, setEdgeSwipeSide] = useState<'left' | 'right' | null>(null);
  const [canCommitEdgeSwipe, setCanCommitEdgeSwipe] = useState(false);
  const edgeSwipeArmedRef = useRef(false);
  const isHorizontalSwipeRef = useRef(false);
  const [isGestureTransitioning, setIsGestureTransitioning] = useState(false);
  const gestureTransitionTimerRef = useRef<number | null>(null);
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

  const handleEdgePointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType === 'mouse' || !currentTrip || activeTab === 'trips') return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('input, textarea, button, select, [contenteditable="true"], [data-no-edge-swipe], .leaflet-container, [role="dialog"]')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    edgeSwipeRef.current = { x: event.clientX, y: event.clientY, side: null, pointerId: event.pointerId };
    edgeSwipeArmedRef.current = false;
    isHorizontalSwipeRef.current = false;
    edgeSwipeOffset.set(0);
  };

  const handleEdgePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const start = edgeSwipeRef.current;
    if (!start || event.pointerId !== start.pointerId) return;
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    const threshold = window.innerWidth / 6;
    if (edgeSwipeArmedRef.current) {
      const returnedToEdge = start.side === 'left' ? deltaX <= 8 : deltaX >= -8;
      if (returnedToEdge) {
        edgeSwipeArmedRef.current = false;
        setCanCommitEdgeSwipe(false);
        setEdgeSwipeSide(null);
        edgeSwipeOffset.set(0);
        return;
      }
      event.preventDefault();
      isHorizontalSwipeRef.current = true;
      edgeSwipeOffset.set(start.side === 'left' ? threshold : -threshold);
      return;
    }
    if (Math.abs(deltaY) > 20 && Math.abs(deltaY) > Math.abs(deltaX)) {
      edgeSwipeRef.current = null;
      isHorizontalSwipeRef.current = false;
      setEdgeSwipeSide(null);
      setCanCommitEdgeSwipe(false);
      edgeSwipeOffset.set(0);
      return;
    }
    if (Math.abs(deltaX) < Math.abs(deltaY) || Math.abs(deltaX) < 6) return;

    const side = deltaX > 0 ? 'left' : 'right';
    start.side = side;
    isHorizontalSwipeRef.current = true;
    event.preventDefault();
    setEdgeSwipeSide(side);
    const isValidDirection = side === 'left'
      ? (activeTab === 'messages' || ['groceries', 'schedule', 'my_trip', 'settings'].includes(activeTab))
      : activeTab !== 'settings';
    const hasReachedThreshold = Math.abs(deltaX) >= threshold && isValidDirection;
    if (hasReachedThreshold) {
      edgeSwipeArmedRef.current = true;
    }
    setCanCommitEdgeSwipe(edgeSwipeArmedRef.current);
    edgeSwipeOffset.set(side === 'left'
      ? Math.max(0, Math.min(threshold, deltaX))
      : Math.min(0, Math.max(-threshold, deltaX)));
  };

  useEffect(() => {
    const preventScrollDuringSwipe = (event: TouchEvent) => {
      if (isHorizontalSwipeRef.current) event.preventDefault();
    };
    window.addEventListener('touchmove', preventScrollDuringSwipe, { passive: false });

    const finishEdgeSwipe = (event: PointerEvent | null) => {
      const start = edgeSwipeRef.current;
      edgeSwipeRef.current = null;
      isHorizontalSwipeRef.current = false;
      const deltaX = event && start ? event.clientX - start.x : 0;
      const returnedToEdge = start?.side === 'left' ? deltaX <= 8 : deltaX >= -8;
      if (edgeSwipeArmedRef.current && returnedToEdge) {
        edgeSwipeArmedRef.current = false;
      }
      const wasArmed = edgeSwipeArmedRef.current;
      edgeSwipeArmedRef.current = false;
      if (!start || !start.side || (event && event.pointerId !== start.pointerId)) {
        setEdgeSwipeSide(null);
        setCanCommitEdgeSwipe(false);
        edgeSwipeOffset.set(0);
        return;
      }

      if (start.side) setEdgeSwipeSide(start.side);
      const isCommitGesture = wasArmed
        && currentTrip
        && activeTab !== 'trips';
      const tabs = ['messages', 'groceries', 'schedule', 'my_trip', 'settings'] as const;
      let transitionDirection = 0;
      let commitTransition: (() => void) | null = null;

      if (isCommitGesture && start.side === 'left') {
        if (activeTab === 'messages') {
          transitionDirection = -1;
          commitTransition = () => {
            setSlideDirection(transitionDirection);
            setIsKeyboardOpen(false);
            tripExitDirectionRef.current = -1;
            exitTrip();
          };
        } else {
          const previousTab = tabs.indexOf(activeTab) - 1;
          if (previousTab >= 0) {
            transitionDirection = -1;
            commitTransition = () => {
              setSlideDirection(transitionDirection);
              setActiveTab(tabs[previousTab]);
              setIsKeyboardOpen(false);
            };
          }
        }
      } else if (isCommitGesture && start.side === 'right') {
        const nextTab = tabs.indexOf(activeTab) + 1;
        if (nextTab < tabs.length) {
          transitionDirection = 1;
          commitTransition = () => {
            setSlideDirection(transitionDirection);
            setActiveTab(tabs[nextTab]);
            setIsKeyboardOpen(false);
          };
        }
      }

      if (commitTransition) {
        setIsGestureTransitioning(true);
        setEdgeSwipeSide(start.side);
        const threshold = window.innerWidth / 6;
        edgeSwipeOffset.set(start.side === 'left' ? threshold : -threshold);
      }
      const arrowExitDirection = transitionDirection > 0 ? -1 : 1;
      animate(edgeSwipeOffset, commitTransition ? arrowExitDirection * (window.innerWidth + 64) : 0, {
        duration: commitTransition ? 0.2 : 0.18,
        ease: [0.22, 1, 0.36, 1],
        onComplete: () => {
          setEdgeSwipeSide(null);
          setCanCommitEdgeSwipe(false);
          if (!commitTransition) return;
          commitTransition();
          if (gestureTransitionTimerRef.current !== null) {
            window.clearTimeout(gestureTransitionTimerRef.current);
          }
          gestureTransitionTimerRef.current = window.setTimeout(() => {
            setIsGestureTransitioning(false);
            gestureTransitionTimerRef.current = null;
          }, 500);
        },
      });
    };

    const handlePointerUp = (event: PointerEvent) => finishEdgeSwipe(event);
    const handlePointerCancel = () => finishEdgeSwipe(null);

    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerCancel);
    return () => {
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
      window.removeEventListener('touchmove', preventScrollDuringSwipe);
    };
  }, [activeTab, currentTrip?.id, edgeSwipeOffset, exitTrip]);

  useEffect(() => () => {
    if (gestureTransitionTimerRef.current !== null) {
      window.clearTimeout(gestureTransitionTimerRef.current);
    }
  }, []);

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
        onPointerDown={handleEdgePointerDown}
        onPointerMove={handleEdgePointerMove}
        style={{ touchAction: edgeSwipeSide ? 'none' : 'pan-y' }}
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
            className="absolute inset-0 w-full h-full overflow-hidden flex flex-col"
            data-view-key={activeView}
            data-app-view="inactive"
          >
            {activeView === 'trips' && (
              <TripGate
                onTripSelecting={() => setSlideDirection(1)}
                onTripSelected={() => setActiveTab('messages')}
              />
            )}
            {activeView === 'messages' && (
              <MessagesView
                onKeyboardStateChange={setIsKeyboardOpen}
                initialMention={targetMention}
                onClearInitialMention={() => setTargetMention(undefined)}
                onlineMembers={onlineMembers}
                call={call}
              />
            )}
            {activeView === 'groceries' && (
              <MessagesView viewMode="grocery_list" onlineMembers={onlineMembers} call={call} />
            )}
            {activeView === 'schedule' && (
              <MessagesView viewMode="plan" onlineMembers={onlineMembers} call={call} />
            )}
            {activeView === 'my_trip' && (
              <TripOverview />
            )}
            {activeView === 'settings' && (
              <SettingsView onNavigateToMessages={handleNavigateToMessages} />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {currentTrip && user && (
        <TripLocationTracker tripId={currentTrip.id} userId={user.id} />
      )}

      {/* Nav bar is completely closed whenever input is active/focused or outside of active trip */}
      <BottomTabBar
        activeTab={activeTab}
        onChangeTab={handleTabChange}
        isHidden={!currentTrip || (isKeyboardOpen && activeTab === 'messages')}
        hidden={!currentTrip || (isKeyboardOpen && activeTab === 'messages')}
      />
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
      {(call.activeCall || call.incomingCall) && (
        <CallOverlay call={call} userId={user?.id} />
      )}
      {edgeSwipeSide && (
        <motion.div
          aria-hidden="true"
          className={`pointer-events-none fixed top-1/2 z-[13010] -translate-y-1/2 ${
            edgeSwipeSide === 'left' ? 'left-2' : 'right-2'
          }`}
          style={{ x: edgeSwipeOffset }}
        >
          <motion.div
            animate={{
              backgroundColor: canCommitEdgeSwipe ? '#0A84FF' : 'rgba(0,0,0,0.6)',
              borderColor: canCommitEdgeSwipe ? 'rgba(255,255,255,0.42)' : 'rgba(255,255,255,0.2)',
            }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="flex h-12 w-12 items-center justify-center rounded-full border text-white shadow-[0_4px_24px_rgba(0,0,0,0.45)] backdrop-blur-xl"
          >
            {edgeSwipeSide === 'left'
              ? <ArrowRight size={22} weight="bold" />
              : <ArrowLeft size={22} weight="bold" />}
          </motion.div>
        </motion.div>
      )}
      {isGestureTransitioning && (
        <div
          className="fixed inset-0 z-[13000] touch-none"
          onWheel={(event) => event.preventDefault()}
          onTouchMove={(event) => event.preventDefault()}
          aria-hidden="true"
        />
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
