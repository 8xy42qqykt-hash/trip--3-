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
  const { user, profile, isLoading } = useAuth();
  const { currentTrip, userTrips, selectTrip } = useTrip();
  const [activeTab, setActiveTab] = useState<TabKey>('messages');
  const [slideDirection, setSlideDirection] = useState<number>(0);
  const [isForcedReady, setIsForcedReady] = useState(false);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [targetMention, setTargetMention] = useState<string | undefined>(undefined);
  const onlineMembers = useTripPresence(currentTrip?.id, user?.id, profile, activeTab === 'messages');
  const call = useGroupCall(currentTrip?.id, user?.id, profile);

  const prevTripIdRef = useRef<string | null>(null);
  const prevViewRef = useRef<AppViewKey>('trips');
  const deepLinkHandledRef = useRef(false);

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
      // Selected a trip -> slide in opposite direction (-1: enters from left, trips slides right)
      setSlideDirection(-1);
      if (!deepLinkHandledRef.current) setActiveTab('messages');
      setIsKeyboardOpen(false);
    } else if (prevTripIdRef.current !== null && currentTripId === null) {
      // Exited a trip -> slide in opposite direction (1: enters from right, messages slides left)
      setSlideDirection(1);
      setIsKeyboardOpen(false);
    }
    prevTripIdRef.current = currentTripId;
  }, [currentTrip?.id]);

  const activeView: AppViewKey = !currentTrip ? 'trips' : activeTab;

  useEffect(() => {
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
      <main className="flex-1 w-full overflow-hidden relative">
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
      {(call.activeCall || call.incomingCall) && (
        <CallOverlay call={call} userId={user?.id} />
      )}
    </div>
  );
};

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <TripProvider>
          <MainAppContent />
        </TripProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
