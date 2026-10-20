import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
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
  const edgeSwipeRef = useRef<{ x: number; y: number; side: 'left' | 'right' } | null>(null);

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
      // The selected trip enters from the left as the Trips view exits right.
      setSlideDirection(-1);
      if (!deepLinkHandledRef.current) setActiveTab('messages');
      setIsKeyboardOpen(false);
    } else if (prevTripIdRef.current !== null && currentTripId === null) {
      setSlideDirection(activeTab === 'my_trip' || activeTab === 'settings' ? -1 : 1);
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
    if (event.pointerType === 'mouse') return;
    const side = event.clientX <= 24 ? 'left'
      : event.clientX >= window.innerWidth - 24 ? 'right'
        : null;
    const target = event.target;
    if (!side || !(target instanceof Element)) return;
    if (target.closest('input, textarea, button, select, [contenteditable="true"], [data-no-edge-swipe], .leaflet-container, [role="dialog"]')) return;
    edgeSwipeRef.current = { x: event.clientX, y: event.clientY, side };
  };

  useEffect(() => {
    const handlePointerUp = (event: PointerEvent) => {
      const start = edgeSwipeRef.current;
      edgeSwipeRef.current = null;
      if (!start) return;

      const deltaX = event.clientX - start.x;
      const deltaY = event.clientY - start.y;
      const threshold = window.innerWidth / 4;
      if (Math.abs(deltaX) < threshold || Math.abs(deltaY) > Math.min(100, threshold * 0.4)) return;
      if (!currentTrip || activeTab === 'trips') return;
      const tabs = ['messages', 'groceries', 'schedule', 'my_trip', 'settings'] as const;

      if (start.side === 'left' && deltaX > 0) {
        if (activeView === 'messages' || activeTab === 'my_trip' || activeTab === 'settings') {
          setSlideDirection(activeTab === 'my_trip' || activeTab === 'settings' ? -1 : 1);
          setIsKeyboardOpen(false);
          exitTrip();
          return;
        }
        const previousTab = tabs.indexOf(activeTab) - 1;
        if (previousTab >= 0) {
          setSlideDirection(-1);
          setActiveTab(tabs[previousTab]);
          setIsKeyboardOpen(false);
        }
      } else if (start.side === 'right' && deltaX < 0) {
        const nextTab = tabs.indexOf(activeTab) + 1;
        if (nextTab < tabs.length) {
          setSlideDirection(1);
          setActiveTab(tabs[nextTab]);
          setIsKeyboardOpen(false);
        }
      }
    };

    const handlePointerCancel = () => {
      edgeSwipeRef.current = null;
    };

    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerCancel);
    return () => {
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
    };
  }, [activeTab, activeView, currentTrip, exitTrip]);

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
              <TripGate onTripSelected={() => setActiveTab('messages')} />
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
          transition={{ duration: 1.2, ease: 'easeOut' }}
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
