import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { TripProvider, useTrip } from './context/TripContext';
import { ThemeProvider } from './context/ThemeContext';
import { AuthScreen } from './components/auth/AuthScreen';
import { TripGate } from './components/trip/TripGate';
import { BottomTabBar, TabKey } from './components/navigation/BottomTabBar';
import { MessagesView } from './components/messages/MessagesView';
import { GroceriesView } from './components/groceries/GroceriesView';
import { MealsView } from './components/meals/MealsView';
import { ScheduleView } from './components/schedule/ScheduleView';
import { SettingsView } from './components/settings/SettingsView';
import tripLogo from '../trip-logo.png';
import { useTripPresence } from './components/messages/useTripPresence';
import { useGroupCall } from './components/messages/useGroupCall';
import { CallOverlay } from './components/messages/CallOverlay';

type AppViewKey = 'trips' | TabKey;

const VIEW_INDEX: Record<AppViewKey, number> = {
  trips: -1,
  messages: 0,
  groceries: 1,
  meals: 2,
  schedule: 3,
  settings: 4,
};

const MainAppContent: React.FC = () => {
  const { user, profile, isLoading } = useAuth();
  const { currentTrip } = useTrip();
  const onlineMembers = useTripPresence(currentTrip?.id, user?.id, profile);
  const call = useGroupCall(currentTrip?.id, user?.id, profile);
  const [activeTab, setActiveTab] = useState<TabKey>('messages');
  const [slideDirection, setSlideDirection] = useState<number>(0);
  const [isForcedReady, setIsForcedReady] = useState(false);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [targetMention, setTargetMention] = useState<string | undefined>(undefined);

  const prevTripIdRef = useRef<string | null>(null);
  const prevViewRef = useRef<AppViewKey>('trips');

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
      setActiveTab('messages');
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
    <div className="fixed inset-0 w-full h-full flex flex-col bg-black text-white overflow-hidden select-none">
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
            {activeView === 'trips' && <TripGate />}
            {activeView === 'messages' && (
              <MessagesView
                onKeyboardStateChange={setIsKeyboardOpen}
                initialMention={targetMention}
                onClearInitialMention={() => setTargetMention(undefined)}
                onlineMembers={onlineMembers}
                call={call}
              />
            )}
            {activeView === 'groceries' && <GroceriesView />}
            {activeView === 'meals' && <MealsView />}
            {activeView === 'schedule' && <ScheduleView />}
            {activeView === 'settings' && (
              <SettingsView onNavigateToMessages={handleNavigateToMessages} />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Nav bar is completely closed whenever input is active/focused or outside of active trip */}
      <BottomTabBar
        activeTab={activeTab}
        onChangeTab={handleTabChange}
        isHidden={!currentTrip || (isKeyboardOpen && activeTab === 'messages')}
        hidden={!currentTrip || (isKeyboardOpen && activeTab === 'messages')}
      />
      <CallOverlay call={call} userId={user.id} />
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
