import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase, isCloudActive } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { Trip, TripMember, Message, Reaction, Poll, GroceryItem, Meal, EventItem, Profile } from '../types';
import { parseGroceryInput } from '../utils/groceryParser';
import { parseScheduleInput } from '../utils/scheduleParser';

interface TripContextType {
  currentTrip: Trip | null;
  userTrips: Trip[];
  tripMembers: TripMember[];
  isOwner: boolean;
  isLoadingTrips: boolean;
  createTrip: (name: string, startDate: string, endDate: string) => Promise<{ id?: string; error?: string }>;
  joinTrip: (code: string) => Promise<{ id?: string; error?: string }>;
  updateTrip: (updates: { name?: string; start_date?: string; end_date?: string }) => Promise<{ error?: string }>;
  selectTrip: (trip: Trip) => void;
  exitTrip: () => void;
  removeMember: (userId: string) => Promise<{ error?: string }>;
  loadUserTrips: () => Promise<Trip[]>;
  // Messages & Reactions
  messages: Message[];
  sendMessage: (content: string, imageUrl?: string, replyToId?: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  toggleReaction: (messageId: string, kind: Reaction['kind']) => Promise<void>;
  // Polls
  polls: Poll[];
  createPoll: (question: string, options: string[], multiple: boolean) => Promise<void>;
  votePoll: (pollId: string, optionId: string) => Promise<void>;
  endPoll: (pollId: string) => Promise<void>;
  // Groceries
  groceries: GroceryItem[];
  addGrocery: (rawText: string) => Promise<void>;
  toggleGrocery: (itemId: string) => Promise<void>;
  editGrocery: (itemId: string, newText: string) => Promise<void>;
  deleteGrocery: (itemId: string) => Promise<void>;
  // Meals
  meals: Meal[];
  addMeal: (date: string, slot: Meal['slot'], name: string) => Promise<void>;
  toggleMealVote: (mealId: string) => Promise<void>;
  assignCooking: (mealId: string) => Promise<void>;
  sendMealToGroceries: (mealName: string) => Promise<void>;
  deleteMeal: (mealId: string) => Promise<void>;
  // Schedule / Events
  events: EventItem[];
  addEvent: (date: string, rawText: string) => Promise<void>;
  toggleEventAttendance: (eventId: string) => Promise<void>;
  editEvent: (eventId: string, updates: Partial<EventItem>) => Promise<void>;
  deleteEvent: (eventId: string) => Promise<void>;
  refreshData: () => Promise<void>;
}

const TripContext = createContext<TripContextType | undefined>(undefined);

// Cross-tab Realtime channel for local preview
const realtimeChannel = (() => {
  try {
    if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
      return new BroadcastChannel('trip_realtime_sync');
    }
  } catch (err) {
    console.warn('BroadcastChannel not supported in this environment:', err);
  }
  return null;
})();

export const TripProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, profile } = useAuth();
  const [currentTrip, setCurrentTrip] = useState<Trip | null>(null);
  const [userTrips, setUserTrips] = useState<Trip[]>([]);
  const [isLoadingTrips, setIsLoadingTrips] = useState(false);
  const [tripMembers, setTripMembers] = useState<TripMember[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [groceries, setGroceries] = useState<GroceryItem[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);

  const isOwner = Boolean(currentTrip && user && currentTrip.owner_id === user.id);

  const broadcastSync = useCallback((action: string, payload?: any) => {
    if (realtimeChannel) {
      realtimeChannel.postMessage({ action, payload, tripId: currentTrip?.id, senderId: user?.id });
    }
  }, [currentTrip?.id, user?.id]);

  const loadUserTrips = useCallback(async (): Promise<Trip[]> => {
    if (!user) {
      setUserTrips([]);
      return [];
    }
    setIsLoadingTrips(true);
    try {
      if (isCloudActive && supabase) {
        const { data, error } = await supabase
          .from('trip_members')
          .select('trip_id, role, trips(*)')
          .eq('user_id', user.id);
        if (error) {
          console.warn('Error fetching user trips from cloud:', error);
          setUserTrips([]);
          return [];
        }
        const validTrips: Trip[] = (data || [])
          .map((item: any) => item.trips as Trip)
          .filter(Boolean);
        setUserTrips(validTrips);
        return validTrips;
      } else {
        const tripsStr = localStorage.getItem('trip_local_trips') || '[]';
        const allTrips: Trip[] = JSON.parse(tripsStr);
        const membersStr = localStorage.getItem('trip_local_members') || '[]';
        const allMembers: TripMember[] = JSON.parse(membersStr);
        const userTripIds = new Set(allMembers.filter((m) => m.user_id === user.id).map((m) => m.trip_id));
        const matching = allTrips.filter((t) => userTripIds.has(t.id));
        setUserTrips(matching);
        return matching;
      }
    } catch (err) {
      console.warn('Failed to load user trips:', err);
      setUserTrips([]);
      return [];
    } finally {
      setIsLoadingTrips(false);
    }
  }, [user]);

  const loadActiveTrip = useCallback(async () => {
    if (!user) {
      setCurrentTrip(null);
      setUserTrips([]);
      return;
    }
    const trips = await loadUserTrips();
    const savedTripId = localStorage.getItem('active_trip_id');
    if (savedTripId) {
      const found = trips.find((t) => t.id === savedTripId);
      if (found) {
        setCurrentTrip(found);
        return;
      }
    }
    setCurrentTrip(null);
  }, [user, loadUserTrips]);

  useEffect(() => {
    loadActiveTrip();
  }, [loadActiveTrip]);

  const selectTrip = useCallback((trip: Trip) => {
    setCurrentTrip(trip);
    localStorage.setItem('active_trip_id', trip.id);
  }, []);

  const exitTrip = useCallback(() => {
    setCurrentTrip(null);
    localStorage.removeItem('active_trip_id');
    loadUserTrips();
  }, [loadUserTrips]);

  const refreshData = useCallback(async () => {
    if (!currentTrip || !user) return;
    if (isCloudActive && supabase) {
      try {
        const { data: membersData } = await supabase
          .from('trip_members')
          .select('trip_id, user_id, role, joined_at, profiles(*)')
          .eq('trip_id', currentTrip.id);
        if (membersData) {
          setTripMembers(
            membersData.map((m: any) => ({
              trip_id: m.trip_id,
              user_id: m.user_id,
              role: m.role,
              joined_at: m.joined_at,
              profile: m.profiles,
            }))
          );
        }

        const { data: messagesData } = await supabase
          .from('messages')
          .select('*, reactions(*), profiles(*)')
          .eq('trip_id', currentTrip.id)
          .order('created_at', { ascending: true });
        if (messagesData) {
          setMessages(
            messagesData.map((m: any) => ({
              ...m,
              reactions: m.reactions || [],
              sender: m.profiles,
            }))
          );
        }

        const { data: pollsData } = await supabase
          .from('polls')
          .select('*, poll_options(*, poll_votes(*, profiles(*)))')
          .eq('trip_id', currentTrip.id)
          .order('created_at', { ascending: false });
        if (pollsData) {
          const parsedPolls: Poll[] = pollsData.map((p: any) => {
            const options = (p.poll_options || []).map((opt: any) => {
              const votes = opt.poll_votes || [];
              const hasVoted = votes.some((v: any) => v.user_id === user.id);
              const voters = votes.map((v: any) => v.profiles).filter(Boolean);
              return {
                id: opt.id,
                poll_id: opt.poll_id,
                text: opt.text,
                sort_order: opt.sort_order,
                votes_count: votes.length,
                has_voted: hasVoted,
                voters,
              };
            });
            const totalVotes = options.reduce((sum: number, o: any) => sum + (o.votes_count || 0), 0);
            return {
              id: p.id,
              trip_id: p.trip_id,
              creator_id: p.creator_id,
              question: p.question,
              multiple: p.multiple,
              is_closed: p.is_closed,
              created_at: p.created_at,
              options,
              total_votes: totalVotes,
            };
          });
          setPolls(parsedPolls);
        }

        const { data: grocData } = await supabase
          .from('grocery_items')
          .select('*, profiles(*)')
          .eq('trip_id', currentTrip.id)
          .order('created_at', { ascending: true });
        if (grocData) {
          setGroceries(
            grocData.map((g: any) => ({
              ...g,
              creator: g.profiles,
            }))
          );
        }

        const { data: mealsData } = await supabase
          .from('meals')
          .select('*, meal_votes(user_id), profiles(*)')
          .eq('trip_id', currentTrip.id)
          .order('created_at', { ascending: true });
        if (mealsData) {
          setMeals(
            mealsData.map((m: any) => ({
              ...m,
              votes: (m.meal_votes || []).map((v: any) => v.user_id),
              cook: m.profiles,
            }))
          );
        }

        const { data: eventsData } = await supabase
          .from('events')
          .select('*, event_attendees(user_id, profiles(*))')
          .eq('trip_id', currentTrip.id)
          .order('created_at', { ascending: true });
        if (eventsData) {
          setEvents(
            eventsData.map((e: any) => ({
              ...e,
              attendees: (e.event_attendees || []).map((a: any) => a.user_id),
              attendee_profiles: (e.event_attendees || []).map((a: any) => a.profiles).filter(Boolean),
            }))
          );
        }
      } catch (err) {
        console.warn('Error refreshing data from cloud:', err);
      }
    } else {
      // Local storage fallback
      const tid = currentTrip.id;
      const getStore = (k: string) => JSON.parse(localStorage.getItem(k) || '[]');
      const mockUsers: Record<string, any> = JSON.parse(localStorage.getItem('trip_mock_users') || '{}');
      const getProfile = (uid: string): Profile => {
        for (const u of Object.values(mockUsers)) {
          if (u.id === uid) {
            return { id: u.id, display_name: u.display_name, color: u.color, avatar_url: u.avatar_url };
          }
        }
        if (profile && profile.id === uid) return profile;
        return { id: uid, display_name: 'Member', color: '#007AFF' };
      };

      const allMembers: TripMember[] = getStore('trip_local_members');
      const tripM = allMembers
        .filter((m) => m.trip_id === tid)
        .map((m) => ({ ...m, profile: getProfile(m.user_id) }));
      setTripMembers(tripM);

      const allMsg: Message[] = getStore('trip_local_messages');
      const allReact: Reaction[] = getStore('trip_local_reactions');
      const tripMsg = allMsg
        .filter((m) => m.trip_id === tid)
        .map((m) => ({
          ...m,
          reactions: allReact.filter((r) => r.message_id === m.id),
          sender: getProfile(m.user_id),
        }));
      setMessages(tripMsg);

      const allPolls: Poll[] = getStore('trip_local_polls');
      const allVotes: any[] = getStore('trip_local_poll_votes');
      const tripPolls = allPolls
        .filter((p) => p.trip_id === tid)
        .map((p) => {
          const options = (p.options || []).map((opt) => {
            const votes = allVotes.filter((v) => v.option_id === opt.id);
            const voters = votes.map((v) => getProfile(v.user_id));
            return {
              ...opt,
              votes_count: votes.length,
              voters,
              has_voted: votes.some((v) => v.user_id === user.id),
            };
          });
          const totalVotes = options.reduce((sum, o) => sum + (o.votes_count || 0), 0);
          return { ...p, options, total_votes: totalVotes };
        });
      setPolls(tripPolls);

      const allGroc: GroceryItem[] = getStore('trip_local_groceries');
      const tripGroc = allGroc
        .filter((g) => g.trip_id === tid)
        .map((g) => ({ ...g, creator: getProfile(g.user_id) }));
      setGroceries(tripGroc);

      const allMeals: Meal[] = getStore('trip_local_meals');
      const allMealVotes: any[] = getStore('trip_local_meal_votes');
      const tripMeals = allMeals
        .filter((m) => m.trip_id === tid)
        .map((m) => ({
          ...m,
          votes: allMealVotes.filter((v) => v.meal_id === m.id).map((v) => v.user_id),
          cook: m.cook_user_id ? getProfile(m.cook_user_id) : undefined,
        }));
      setMeals(tripMeals);

      const allEvents: EventItem[] = getStore('trip_local_events');
      const allEventAttendees: any[] = getStore('trip_local_event_attendees');
      const tripEvents = allEvents
        .filter((e) => e.trip_id === tid)
        .map((e) => {
          const attIds = allEventAttendees.filter((a) => a.event_id === e.id).map((a) => a.user_id);
          const attProfiles = attIds.map((uid) => getProfile(uid));
          return {
            ...e,
            attendees: attIds,
            attendee_profiles: attProfiles,
          };
        });
      setEvents(tripEvents);
    }
  }, [currentTrip, user, profile]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  useEffect(() => {
    if (!currentTrip) return;
    if (isCloudActive && supabase) {
      const channel = supabase
        .channel(`trip_realtime_${currentTrip.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', filter: `trip_id=eq.${currentTrip.id}` },
          () => {
            refreshData();
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'reactions' },
          () => {
            refreshData();
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'poll_votes' },
          () => {
            refreshData();
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'meal_votes' },
          () => {
            refreshData();
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'event_attendees' },
          () => {
            refreshData();
          }
        )
        .subscribe();
      return () => {
        supabase?.removeChannel(channel);
      };
    } else if (realtimeChannel) {
      const handleBroadcast = (evt: MessageEvent) => {
        if (evt.data?.tripId === currentTrip.id) {
          refreshData();
        }
      };
      realtimeChannel.addEventListener('message', handleBroadcast);
      return () => {
        realtimeChannel.removeEventListener('message', handleBroadcast);
      };
    }
  }, [currentTrip, refreshData]);

  // --- TRIPS ---
  const createTrip = async (name: string, startDate: string, endDate: string) => {
    if (!user) return { error: 'Not authenticated' };
    if (isCloudActive && supabase) {
      const { data, error } = await supabase.rpc('create_trip', {
        name: name.trim(),
        start_date: startDate,
        end_date: endDate,
      });
      if (error) return { error: error.message };
      const { data: tripData } = await supabase
        .from('trips')
        .select('*')
        .eq('id', data)
        .single();
      if (tripData) {
        const created = tripData as Trip;
        setCurrentTrip(created);
        localStorage.setItem('active_trip_id', created.id);
        await loadUserTrips();
        await refreshData();
        return { id: created.id };
      }
      await loadUserTrips();
      return { id: data };
    } else {
      const tripId = 'trip_' + Math.random().toString(36).substring(2, 9);
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let code = '';
      for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
      }
      const newTrip: Trip = {
        id: tripId,
        name: name.trim(),
        start_date: startDate,
        end_date: endDate,
        invite_code: code,
        owner_id: user.id,
        created_at: new Date().toISOString(),
      };
      const trips: Trip[] = JSON.parse(localStorage.getItem('trip_local_trips') || '[]');
      trips.push(newTrip);
      localStorage.setItem('trip_local_trips', JSON.stringify(trips));
      const members: TripMember[] = JSON.parse(localStorage.getItem('trip_local_members') || '[]');
      members.push({
        trip_id: tripId,
        user_id: user.id,
        role: 'owner',
        joined_at: new Date().toISOString(),
      });
      localStorage.setItem('trip_local_members', JSON.stringify(members));
      setCurrentTrip(newTrip);
      localStorage.setItem('active_trip_id', tripId);
      await loadUserTrips();
      broadcastSync('trip_created', newTrip);
      return { id: tripId };
    }
  };

  const joinTrip = async (code: string) => {
    if (!user) return { error: 'Not authenticated' };
    const cleanCode = code.trim().toUpperCase();
    if (isCloudActive && supabase) {
      const { data, error } = await supabase.rpc('join_trip', {
        code: cleanCode,
      });
      if (error) return { error: error.message };
      const { data: tripData } = await supabase
        .from('trips')
        .select('*')
        .eq('id', data)
        .single();
      if (tripData) {
        const joined = tripData as Trip;
        setCurrentTrip(joined);
        localStorage.setItem('active_trip_id', joined.id);
        await loadUserTrips();
        await refreshData();
        return { id: joined.id };
      }
      await loadUserTrips();
      return { id: data };
    } else {
      const trips: Trip[] = JSON.parse(localStorage.getItem('trip_local_trips') || '[]');
      const found = trips.find((t) => t.invite_code.toUpperCase() === cleanCode);
      if (!found) {
        return { error: 'Invalid invite code' };
      }
      const members: TripMember[] = JSON.parse(localStorage.getItem('trip_local_members') || '[]');
      if (!members.some((m) => m.trip_id === found.id && m.user_id === user.id)) {
        members.push({
          trip_id: found.id,
          user_id: user.id,
          role: 'member',
          joined_at: new Date().toISOString(),
        });
        localStorage.setItem('trip_local_members', JSON.stringify(members));
      }
      setCurrentTrip(found);
      localStorage.setItem('active_trip_id', found.id);
      await loadUserTrips();
      broadcastSync('trip_joined', { tripId: found.id, userId: user.id });
      return { id: found.id };
    }
  };

  const updateTrip = async (updates: { name?: string; start_date?: string; end_date?: string }) => {
    if (!currentTrip || !isOwner) return { error: 'Unauthorized' };
    const updated = { ...currentTrip, ...updates };
    setCurrentTrip(updated);
    if (isCloudActive && supabase) {
      const { error } = await supabase
        .from('trips')
        .update(updates)
        .eq('id', currentTrip.id);
      if (error) return { error: error.message };
    } else {
      const trips: Trip[] = JSON.parse(localStorage.getItem('trip_local_trips') || '[]');
      const idx = trips.findIndex((t) => t.id === currentTrip.id);
      if (idx !== -1) {
        trips[idx] = updated;
        localStorage.setItem('trip_local_trips', JSON.stringify(trips));
      }
      broadcastSync('trip_updated', updated);
    }
    await loadUserTrips();
    return {};
  };

  const removeMember = async (userId: string): Promise<{ error?: string }> => {
    if (!currentTrip || !user) return { error: 'Not authenticated' };
    try {
      if (isCloudActive && supabase) {
        const { error } = await supabase
          .from('trip_members')
          .delete()
          .eq('trip_id', currentTrip.id)
          .eq('user_id', userId);
        if (error) return { error: error.message };
      } else {
        const all: TripMember[] = JSON.parse(localStorage.getItem('trip_local_members') || '[]');
        const filtered = all.filter((m) => !(m.trip_id === currentTrip.id && m.user_id === userId));
        localStorage.setItem('trip_local_members', JSON.stringify(filtered));
        broadcastSync('member_removed', { tripId: currentTrip.id, userId });
      }
      await refreshData();
      return {};
    } catch (err: any) {
      return { error: err?.message || 'Failed to remove member' };
    }
  };

  // --- MESSAGES ---
  const sendMessage = async (content: string, imageUrl?: string, replyToId?: string) => {
    if (!currentTrip || !user) return;
    const cleanContent = content.trim();
    if (!cleanContent && !imageUrl) return;

    const newMsg: Message = {
      id: 'msg_' + Math.random().toString(36).substring(2, 9),
      trip_id: currentTrip.id,
      user_id: user.id,
      type: imageUrl ? 'image' : 'text',
      content: cleanContent,
      image_url: imageUrl || null,
      reply_to: replyToId || null,
      created_at: new Date().toISOString(),
      reactions: [],
      sender: profile || { id: user.id, display_name: 'Me', color: '#007AFF' },
    };

    setMessages((prev) => [...prev, newMsg]);

    if (isCloudActive && supabase) {
      await supabase.from('messages').insert({
        trip_id: currentTrip.id,
        user_id: user.id,
        type: newMsg.type,
        content: newMsg.content,
        image_url: newMsg.image_url,
        reply_to: newMsg.reply_to,
      });
    } else {
      const all: Message[] = JSON.parse(localStorage.getItem('trip_local_messages') || '[]');
      all.push(newMsg);
      localStorage.setItem('trip_local_messages', JSON.stringify(all));
      broadcastSync('message_sent', newMsg);
    }
  };

  const deleteMessage = async (messageId: string) => {
    if (!user) return;
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    if (isCloudActive && supabase) {
      await supabase.from('messages').delete().eq('id', messageId).eq('user_id', user.id);
    } else {
      const all: Message[] = JSON.parse(localStorage.getItem('trip_local_messages') || '[]');
      const filtered = all.filter((m) => m.id !== messageId);
      localStorage.setItem('trip_local_messages', JSON.stringify(filtered));
      broadcastSync('message_deleted', messageId);
    }
  };

  const toggleReaction = async (messageId: string, kind: Reaction['kind']) => {
    if (!user) return;
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        const existingIdx = (m.reactions || []).findIndex(
          (r) => r.user_id === user.id && r.kind === kind
        );
        let updatedReactions = [...(m.reactions || [])];
        if (existingIdx !== -1) {
          updatedReactions.splice(existingIdx, 1);
        } else {
          updatedReactions.push({
            id: 'react_' + Math.random().toString(36).substring(2, 9),
            message_id: messageId,
            user_id: user.id,
            kind,
            created_at: new Date().toISOString(),
          });
        }
        return { ...m, reactions: updatedReactions };
      })
    );

    if (isCloudActive && supabase) {
      const { data: existing } = await supabase
        .from('reactions')
        .select('id')
        .eq('message_id', messageId)
        .eq('user_id', user.id)
        .eq('kind', kind)
        .maybeSingle();

      if (existing) {
        await supabase.from('reactions').delete().eq('id', existing.id);
      } else {
        await supabase.from('reactions').insert({
          message_id: messageId,
          user_id: user.id,
          kind,
        });
      }
    } else {
      const all: Reaction[] = JSON.parse(localStorage.getItem('trip_local_reactions') || '[]');
      const idx = all.findIndex((r) => r.message_id === messageId && r.user_id === user.id && r.kind === kind);
      if (idx !== -1) {
        all.splice(idx, 1);
      } else {
        all.push({
          id: 'react_' + Math.random().toString(36).substring(2, 9),
          message_id: messageId,
          user_id: user.id,
          kind,
          created_at: new Date().toISOString(),
        });
      }
      localStorage.setItem('trip_local_reactions', JSON.stringify(all));
      broadcastSync('reaction_toggled', { messageId, kind, userId: user.id });
    }
  };

  // --- POLLS ---
  const createPoll = async (question: string, options: string[], multiple: boolean) => {
    if (!currentTrip || !user) return;
    const cleanQ = question.trim();
    const cleanOpts = options.map((o) => o.trim()).filter(Boolean);
    if (!cleanQ || cleanOpts.length < 2) return;

    if (isCloudActive && supabase) {
      const { data: pollData } = await supabase
        .from('polls')
        .insert({
          trip_id: currentTrip.id,
          creator_id: user.id,
          question: cleanQ,
          multiple,
        })
        .select()
        .single();

      if (pollData) {
        const optionRows = cleanOpts.map((text, idx) => ({
          poll_id: pollData.id,
          text,
          sort_order: idx,
        }));
        await supabase.from('poll_options').insert(optionRows);
      }
      await refreshData();
    } else {
      const pollId = 'poll_' + Math.random().toString(36).substring(2, 9);
      const pollOptions = cleanOpts.map((text, idx) => ({
        id: 'opt_' + Math.random().toString(36).substring(2, 9),
        poll_id: pollId,
        text,
        sort_order: idx,
        votes_count: 0,
        has_voted: false,
      }));
      const newPoll: Poll = {
        id: pollId,
        trip_id: currentTrip.id,
        creator_id: user.id,
        question: cleanQ,
        multiple,
        is_closed: false,
        created_at: new Date().toISOString(),
        options: pollOptions,
        total_votes: 0,
      };
      const all: Poll[] = JSON.parse(localStorage.getItem('trip_local_polls') || '[]');
      all.unshift(newPoll);
      localStorage.setItem('trip_local_polls', JSON.stringify(all));
      setPolls((prev) => [newPoll, ...prev]);
      broadcastSync('poll_created', newPoll);
    }
  };

  const votePoll = async (pollId: string, optionId: string) => {
    if (!user) return;
    const poll = polls.find((p) => p.id === pollId);
    if (!poll || poll.is_closed) return;

    const opt = poll.options.find((o) => o.id === optionId);
    const wasVoted = Boolean(opt?.has_voted);

    setPolls((prev) =>
      prev.map((p) => {
        if (p.id !== pollId) return p;
        const newOptions = p.options.map((o) => {
          if (o.id === optionId) {
            return {
              ...o,
              has_voted: !wasVoted,
              votes_count: Math.max(0, (o.votes_count || 0) + (wasVoted ? -1 : 1)),
            };
          } else if (!p.multiple && !wasVoted && o.has_voted) {
            return {
              ...o,
              has_voted: false,
              votes_count: Math.max(0, (o.votes_count || 0) - 1),
            };
          }
          return o;
        });
        const total = newOptions.reduce((acc, curr) => acc + (curr.votes_count || 0), 0);
        return { ...p, options: newOptions, total_votes: total };
      })
    );

    (async () => {
      try {
        if (isCloudActive && supabase) {
          if (wasVoted) {
            await supabase
              .from('poll_votes')
              .delete()
              .eq('poll_id', pollId)
              .eq('option_id', optionId)
              .eq('user_id', user.id);
          } else {
            if (!poll.multiple) {
              await supabase
                .from('poll_votes')
                .delete()
                .eq('poll_id', pollId)
                .eq('user_id', user.id);
            }
            await supabase.from('poll_votes').insert({
              poll_id: pollId,
              option_id: optionId,
              user_id: user.id,
            });
          }
        } else {
          const allVotes: any[] = JSON.parse(localStorage.getItem('trip_local_poll_votes') || '[]');
          const existingVoteIdx = allVotes.findIndex(
            (v) => v.poll_id === pollId && v.option_id === optionId && v.user_id === user.id
          );
          if (existingVoteIdx !== -1) {
            allVotes.splice(existingVoteIdx, 1);
          } else {
            if (!poll.multiple) {
              for (let i = allVotes.length - 1; i >= 0; i--) {
                if (allVotes[i].poll_id === pollId && allVotes[i].user_id === user.id) {
                  allVotes.splice(i, 1);
                }
              }
            }
            allVotes.push({
              id: 'pv_' + Math.random().toString(36).substring(2, 9),
              poll_id: pollId,
              option_id: optionId,
              user_id: user.id,
              created_at: new Date().toISOString(),
            });
          }
          localStorage.setItem('trip_local_poll_votes', JSON.stringify(allVotes));
          broadcastSync('poll_voted', { pollId, optionId, userId: user.id });
        }
      } catch (err) {
        console.warn('Background poll vote error:', err);
      }
    })();
  };

  const endPoll = async (pollId: string) => {
    if (!user || !currentTrip) return;
    const poll = polls.find((p) => p.id === pollId);
    if (!poll || poll.creator_id !== user.id) return;

    setPolls((prev) =>
      prev.map((p) => (p.id === pollId ? { ...p, is_closed: true } : p))
    );

    let topOption = poll.options[0]?.text || '';
    let topVotes = -1;
    for (const opt of poll.options) {
      const vCount = opt.votes_count || 0;
      if (vCount > topVotes) {
        topVotes = vCount;
        topOption = opt.text;
      }
    }

    const totalVotes = poll.total_votes || 0;
    const metadata = {
      poll_id: pollId,
      question: poll.question,
      total_votes: totalVotes,
      winner: topVotes > 0 ? topOption : 'No votes',
      ended_by: profile?.display_name || 'Creator',
      options: poll.options.map((o) => ({
        id: o.id,
        text: o.text,
        votes: o.votes_count || 0,
        voters: o.voters || [],
      })),
    };

    const resultMsg: Message = {
      id: 'msg_' + Math.random().toString(36).substring(2, 9),
      trip_id: currentTrip.id,
      user_id: user.id,
      type: 'poll_result',
      content: `Poll Results: ${poll.question}`,
      metadata,
      created_at: new Date().toISOString(),
      reactions: [],
      sender: profile || { id: user.id, display_name: 'Me', color: '#007AFF' },
    };

    setMessages((prev) => [...prev, resultMsg]);

    (async () => {
      try {
        if (isCloudActive && supabase) {
          try {
            await supabase.rpc('end_poll', { p_poll_id: pollId });
          } catch {
            await supabase.from('messages').insert({
              trip_id: currentTrip.id,
              user_id: user.id,
              type: 'poll_result',
              content: `Poll Results: ${poll.question}`,
              metadata,
            });
            await supabase.from('polls').update({ is_closed: true }).eq('id', pollId);
          }
        } else {
          const allPolls: Poll[] = JSON.parse(localStorage.getItem('trip_local_polls') || '[]');
          const pIdx = allPolls.findIndex((p) => p.id === pollId);
          if (pIdx !== -1) {
            allPolls[pIdx].is_closed = true;
            localStorage.setItem('trip_local_polls', JSON.stringify(allPolls));
          }
          const allMsg: Message[] = JSON.parse(localStorage.getItem('trip_local_messages') || '[]');
          allMsg.push(resultMsg);
          localStorage.setItem('trip_local_messages', JSON.stringify(allMsg));
          broadcastSync('poll_ended', { pollId });
        }
      } catch (err) {
        console.warn('Background end poll error:', err);
      }
    })();
  };

  // --- GROCERIES ---
  const addGrocery = async (rawText: string) => {
    if (!currentTrip || !user) return;
    const parsed = parseGroceryInput(rawText);
    if (!parsed.text) return;

    const newItem: GroceryItem = {
      id: 'groc_' + Math.random().toString(36).substring(2, 9),
      trip_id: currentTrip.id,
      user_id: user.id,
      text: parsed.text,
      quantity: parsed.quantity,
      category: parsed.category,
      is_done: false,
      created_at: new Date().toISOString(),
      creator: profile || { id: user.id, display_name: 'Me', color: '#007AFF' },
    };

    setGroceries((prev) => [...prev, newItem]);

    if (isCloudActive && supabase) {
      await supabase.from('grocery_items').insert({
        trip_id: currentTrip.id,
        user_id: user.id,
        text: newItem.text,
        quantity: newItem.quantity,
        category: newItem.category,
        is_done: false,
      });
    } else {
      const all: GroceryItem[] = JSON.parse(localStorage.getItem('trip_local_groceries') || '[]');
      all.push(newItem);
      localStorage.setItem('trip_local_groceries', JSON.stringify(all));
      broadcastSync('grocery_added', newItem);
    }
  };

  const toggleGrocery = async (itemId: string) => {
    setGroceries((prev) =>
      prev.map((g) => (g.id === itemId ? { ...g, is_done: !g.is_done } : g))
    );

    const currentItem = groceries.find((g) => g.id === itemId);
    const newStatus = !currentItem?.is_done;

    if (isCloudActive && supabase) {
      await supabase.from('grocery_items').update({ is_done: newStatus }).eq('id', itemId);
    } else {
      const all: GroceryItem[] = JSON.parse(localStorage.getItem('trip_local_groceries') || '[]');
      const idx = all.findIndex((g) => g.id === itemId);
      if (idx !== -1) {
        all[idx].is_done = newStatus;
        localStorage.setItem('trip_local_groceries', JSON.stringify(all));
      }
      broadcastSync('grocery_toggled', { itemId, is_done: newStatus });
    }
  };

  const editGrocery = async (itemId: string, newText: string) => {
    const parsed = parseGroceryInput(newText);
    if (!parsed.text) return;

    setGroceries((prev) =>
      prev.map((g) =>
        g.id === itemId
          ? { ...g, text: parsed.text, quantity: parsed.quantity, category: parsed.category }
          : g
      )
    );

    if (isCloudActive && supabase) {
      await supabase
        .from('grocery_items')
        .update({ text: parsed.text, quantity: parsed.quantity, category: parsed.category })
        .eq('id', itemId);
    } else {
      const all: GroceryItem[] = JSON.parse(localStorage.getItem('trip_local_groceries') || '[]');
      const idx = all.findIndex((g) => g.id === itemId);
      if (idx !== -1) {
        all[idx].text = parsed.text;
        all[idx].quantity = parsed.quantity;
        all[idx].category = parsed.category;
        localStorage.setItem('trip_local_groceries', JSON.stringify(all));
      }
      broadcastSync('grocery_updated', { itemId, ...parsed });
    }
  };

  const deleteGrocery = async (itemId: string) => {
    setGroceries((prev) => prev.filter((g) => g.id !== itemId));
    if (isCloudActive && supabase) {
      await supabase.from('grocery_items').delete().eq('id', itemId);
    } else {
      const all: GroceryItem[] = JSON.parse(localStorage.getItem('trip_local_groceries') || '[]');
      const filtered = all.filter((g) => g.id !== itemId);
      localStorage.setItem('trip_local_groceries', JSON.stringify(filtered));
      broadcastSync('grocery_deleted', itemId);
    }
  };

  // --- MEALS ---
  const addMeal = async (date: string, slot: Meal['slot'], name: string) => {
    if (!currentTrip || !user) return;
    const cleanName = name.trim();
    if (!cleanName) return;

    const newMeal: Meal = {
      id: 'meal_' + Math.random().toString(36).substring(2, 9),
      trip_id: currentTrip.id,
      user_id: user.id,
      date,
      slot,
      name: cleanName,
      created_at: new Date().toISOString(),
      votes: [],
    };

    setMeals((prev) => [...prev, newMeal]);

    if (isCloudActive && supabase) {
      await supabase.from('meals').insert({
        trip_id: currentTrip.id,
        user_id: user.id,
        date,
        slot,
        name: cleanName,
      });
      await refreshData();
    } else {
      const all: Meal[] = JSON.parse(localStorage.getItem('trip_local_meals') || '[]');
      all.push(newMeal);
      localStorage.setItem('trip_local_meals', JSON.stringify(all));
      broadcastSync('meal_added', newMeal);
    }
  };

  const toggleMealVote = async (mealId: string) => {
    if (!user) return;
    setMeals((prev) =>
      prev.map((m) => {
        if (m.id !== mealId) return m;
        const votes = m.votes || [];
        const hasVoted = votes.includes(user.id);
        const newVotes = hasVoted ? votes.filter((id) => id !== user.id) : [...votes, user.id];
        return { ...m, votes: newVotes };
      })
    );

    if (isCloudActive && supabase) {
      const { data: existing } = await supabase
        .from('meal_votes')
        .select('id')
        .eq('meal_id', mealId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (existing) {
        await supabase.from('meal_votes').delete().eq('id', existing.id);
      } else {
        await supabase.from('meal_votes').insert({ meal_id: mealId, user_id: user.id });
      }
    } else {
      const allVotes: any[] = JSON.parse(localStorage.getItem('trip_local_meal_votes') || '[]');
      const idx = allVotes.findIndex((v) => v.meal_id === mealId && v.user_id === user.id);
      if (idx !== -1) {
        allVotes.splice(idx, 1);
      } else {
        allVotes.push({
          id: 'mv_' + Math.random().toString(36).substring(2, 9),
          meal_id: mealId,
          user_id: user.id,
        });
      }
      localStorage.setItem('trip_local_meal_votes', JSON.stringify(allVotes));
      broadcastSync('meal_voted', { mealId, userId: user.id });
    }
  };

  const assignCooking = async (mealId: string) => {
    if (!user) return;
    const meal = meals.find((m) => m.id === mealId);
    if (!meal) return;
    const newCookId = meal.cook_user_id === user.id ? null : user.id;

    setMeals((prev) =>
      prev.map((m) =>
        m.id === mealId ? { ...m, cook_user_id: newCookId, cook: newCookId ? profile || undefined : undefined } : m
      )
    );

    if (isCloudActive && supabase) {
      await supabase.from('meals').update({ cook_user_id: newCookId }).eq('id', mealId);
    } else {
      const all: Meal[] = JSON.parse(localStorage.getItem('trip_local_meals') || '[]');
      const idx = all.findIndex((m) => m.id === mealId);
      if (idx !== -1) {
        all[idx].cook_user_id = newCookId;
        localStorage.setItem('trip_local_meals', JSON.stringify(all));
      }
      broadcastSync('meal_cook_assigned', { mealId, cookId: newCookId });
    }
  };

  const sendMealToGroceries = async (mealName: string) => {
    await addGrocery(mealName);
  };

  const deleteMeal = async (mealId: string) => {
    setMeals((prev) => prev.filter((m) => m.id !== mealId));
    if (isCloudActive && supabase) {
      await supabase.from('meals').delete().eq('id', mealId);
    } else {
      const all: Meal[] = JSON.parse(localStorage.getItem('trip_local_meals') || '[]');
      const filtered = all.filter((m) => m.id !== mealId);
      localStorage.setItem('trip_local_meals', JSON.stringify(filtered));
      broadcastSync('meal_deleted', mealId);
    }
  };

  // --- SCHEDULE / EVENTS ---
  const addEvent = async (date: string, rawText: string) => {
    if (!currentTrip || !user) return;
    const parsed = parseScheduleInput(rawText);
    if (!parsed.title) return;

    const newEvent: EventItem = {
      id: 'evt_' + Math.random().toString(36).substring(2, 9),
      trip_id: currentTrip.id,
      user_id: user.id,
      date,
      time: parsed.time,
      title: parsed.title,
      created_at: new Date().toISOString(),
      attendees: [user.id],
    };

    setEvents((prev) => [...prev, newEvent]);

    if (isCloudActive && supabase) {
      const { data } = await supabase
        .from('events')
        .insert({
          trip_id: currentTrip.id,
          user_id: user.id,
          date,
          time: parsed.time,
          title: parsed.title,
        })
        .select()
        .single();

      if (data) {
        await supabase.from('event_attendees').insert({
          event_id: data.id,
          user_id: user.id,
        });
      }
      await refreshData();
    } else {
      const all: EventItem[] = JSON.parse(localStorage.getItem('trip_local_events') || '[]');
      all.push(newEvent);
      localStorage.setItem('trip_local_events', JSON.stringify(all));
      const allAtt: any[] = JSON.parse(localStorage.getItem('trip_local_event_attendees') || '[]');
      allAtt.push({
        id: 'ea_' + Math.random().toString(36).substring(2, 9),
        event_id: newEvent.id,
        user_id: user.id,
      });
      localStorage.setItem('trip_local_event_attendees', JSON.stringify(allAtt));
      broadcastSync('event_added', newEvent);
    }
  };

  const toggleEventAttendance = async (eventId: string) => {
    if (!user) return;
    setEvents((prev) =>
      prev.map((e) => {
        if (e.id !== eventId) return e;
        const att = e.attendees || [];
        const hasIn = att.includes(user.id);
        const newAtt = hasIn ? att.filter((id) => id !== user.id) : [...att, user.id];
        const existingProfiles = e.attendee_profiles || [];
        const newProfiles = hasIn
          ? existingProfiles.filter((p) => p.id !== user.id)
          : [...existingProfiles, profile || { id: user.id, display_name: 'Me', color: '#007AFF' }];
        return { ...e, attendees: newAtt, attendee_profiles: newProfiles };
      })
    );

    if (isCloudActive && supabase) {
      const { data: existing } = await supabase
        .from('event_attendees')
        .select('id')
        .eq('event_id', eventId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (existing) {
        await supabase.from('event_attendees').delete().eq('id', existing.id);
      } else {
        await supabase.from('event_attendees').insert({
          event_id: eventId,
          user_id: user.id,
        });
      }
    } else {
      const allAtt: any[] = JSON.parse(localStorage.getItem('trip_local_event_attendees') || '[]');
      const idx = allAtt.findIndex((a) => a.event_id === eventId && a.user_id === user.id);
      if (idx !== -1) {
        allAtt.splice(idx, 1);
      } else {
        allAtt.push({
          id: 'ea_' + Math.random().toString(36).substring(2, 9),
          event_id: eventId,
          user_id: user.id,
        });
      }
      localStorage.setItem('trip_local_event_attendees', JSON.stringify(allAtt));
      broadcastSync('event_attendance_toggled', { eventId, userId: user.id });
    }
  };

  const editEvent = async (eventId: string, updates: Partial<EventItem>) => {
    setEvents((prev) =>
      prev.map((e) => (e.id === eventId ? { ...e, ...updates } : e))
    );

    if (isCloudActive && supabase) {
      await supabase.from('events').update(updates).eq('id', eventId);
    } else {
      const all: EventItem[] = JSON.parse(localStorage.getItem('trip_local_events') || '[]');
      const idx = all.findIndex((e) => e.id === eventId);
      if (idx !== -1) {
        all[idx] = { ...all[idx], ...updates };
        localStorage.setItem('trip_local_events', JSON.stringify(all));
      }
      broadcastSync('event_updated', { eventId, updates });
    }
  };

  const deleteEvent = async (eventId: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== eventId));
    if (isCloudActive && supabase) {
      await supabase.from('events').delete().eq('id', eventId);
    } else {
      const all: EventItem[] = JSON.parse(localStorage.getItem('trip_local_events') || '[]');
      const filtered = all.filter((e) => e.id !== eventId);
      localStorage.setItem('trip_local_events', JSON.stringify(filtered));
      broadcastSync('event_deleted', eventId);
    }
  };

  return (
    <TripContext.Provider
      value={{
        currentTrip,
        userTrips,
        tripMembers,
        isOwner,
        isLoadingTrips,
        createTrip,
        joinTrip,
        updateTrip,
        selectTrip,
        exitTrip,
        removeMember,
        loadUserTrips,
        messages,
        sendMessage,
        deleteMessage,
        toggleReaction,
        polls,
        createPoll,
        votePoll,
        endPoll,
        groceries,
        addGrocery,
        toggleGrocery,
        editGrocery,
        deleteGrocery,
        meals,
        addMeal,
        toggleMealVote,
        assignCooking,
        sendMealToGroceries,
        deleteMeal,
        events,
        addEvent,
        toggleEventAttendance,
        editEvent,
        deleteEvent,
        refreshData,
      }}
    >
      {children}
    </TripContext.Provider>
  );
};

export const useTrip = () => {
  const context = useContext(TripContext);
  if (!context) throw new Error('useTrip must be used within TripProvider');
  return context;
};
