import React, { useState, useMemo } from 'react';
import { Check, Trash } from '@phosphor-icons/react';
import { useTrip } from '../../context/TripContext';
import { useAuth } from '../../context/AuthContext';
import { EventItem, Profile } from '../../types';
import { TripDaySelector } from '../common/TripDaySelector';
import { BottomSheet } from '../common/BottomSheet';
import { Avatar } from '../common/Avatar';
import { getInitialTripDate, formatTime24 } from '../../utils/date';
import { CollapsingHeaderLayout } from '../common/CollapsingHeaderLayout';
import { handleEnterKeyNavigation } from '../../utils/formNavigation';

export const ScheduleView: React.FC = () => {
  const { currentTrip, events, tripMembers, addEvent, toggleEventAttendance, editEvent, deleteEvent } = useTrip();
  const { user, profile } = useAuth();

  const initialDate = useMemo(() => {
    if (!currentTrip) return '';
    return getInitialTripDate(currentTrip.start_date, currentTrip.end_date);
  }, [currentTrip]);

  const [selectedDate, setSelectedDate] = useState<string>(initialDate);
  const [quickAdd, setQuickAdd] = useState('');

  // Long press / Edit Event state
  const [editingEvent, setEditingEvent] = useState<EventItem | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const daysWithEvents = useMemo(() => {
    return new Set(events.map((e) => e.date));
  }, [events]);

  if (!currentTrip) return null;

  const dayEvents = events.filter((e) => e.date === selectedDate);
  const anytimeEvents = dayEvents.filter((e) => !e.time);
  const timedEvents = dayEvents
    .filter((e) => Boolean(e.time))
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = quickAdd.trim();
    if (!clean) return;
    setQuickAdd('');
    await addEvent(selectedDate, clean);
  };

  const openEditModal = (item: EventItem) => {
    setEditingEvent(item);
    setEditTitle(item.title);
    setEditTime(item.time || '');
    setEditLocation(item.location || '');
    setEditNotes(item.notes || '');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEvent || !editTitle.trim()) return;
    await editEvent(editingEvent.id, {
      title: editTitle.trim(),
      time: editTime.trim() || null,
      location: editLocation.trim() || null,
      notes: editNotes.trim() || null,
    });
    setEditingEvent(null);
  };

  const handleDelete = async () => {
    if (!editingEvent) return;
    await deleteEvent(editingEvent.id);
    setEditingEvent(null);
  };

  const getMemberProfile = (userId: string, evt?: EventItem): Profile => {
    if (user && userId === user.id && profile) {
      return profile;
    }
    if (evt?.attendee_profiles) {
      const found = evt.attendee_profiles.find((p) => p.id === userId);
      if (found) return found;
    }
    const tm = tripMembers.find((m) => m.user_id === userId);
    if (tm?.profile) return tm.profile;
    return {
      id: userId,
      display_name: 'Member',
      color: '#0A84FF',
      avatar_url: null,
    };
  };

  return (
    <CollapsingHeaderLayout
      title="Schedule"
      headerSubContent={
        <div>
          <div className="flex items-center justify-between pb-1.5 pt-1">
            <TripDaySelector
              startDate={currentTrip.start_date}
              endDate={currentTrip.end_date}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              daysWithItems={daysWithEvents}
            />
          </div>

          <form onSubmit={handleAdd} className="mt-1 mb-2">
            <div className="flex items-center bg-[#1c1c1e] rounded-[18px] px-3.5 py-1 border border-white/[0.08]">
              <input
                type="text"
                inputMode="text"
                enterKeyHint="done"
                placeholder="Add event (e.g. 10:00 Ski lesson, 19:30 Dinner)..."
                value={quickAdd}
                onChange={(e) => setQuickAdd(e.target.value)}
                className="flex-1 bg-transparent text-white placeholder:text-slate-500 text-[17px] h-10 outline-none"
              />
              {quickAdd.trim() && (
                <button
                  type="submit"
                  className="text-sm font-bold text-[#0A84FF] active-press cursor-pointer px-2 py-1"
                >
                  Add
                </button>
              )}
            </div>
          </form>
        </div>
      }
    >
      <div className="space-y-4 pt-1">
        {/* Anytime group */}
        {anytimeEvents.length > 0 && (
          <div className="space-y-1 animate-spring-in">
            <div className="text-xs font-semibold text-slate-400 px-2">
              Anytime
            </div>
            {/* Direct divided list (NO heavy card panel) */}
            <div className="divide-y divide-white/[0.08] overflow-hidden">
              {anytimeEvents.map((evt) => (
                <ScheduleItemRow
                  key={evt.id}
                  event={evt}
                  currentUserId={user?.id}
                  getProfile={(uid) => getMemberProfile(uid, evt)}
                  onToggle={() => toggleEventAttendance(evt.id)}
                  onLongPress={() => openEditModal(evt)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Timed events */}
        {timedEvents.length > 0 && (
          <div className="space-y-1 animate-spring-in">
            <div className="text-xs font-semibold text-slate-400 px-2">
              Timeline
            </div>
            {/* Direct divided list (NO heavy card panel) */}
            <div className="divide-y divide-white/[0.08] overflow-hidden">
              {timedEvents.map((evt) => (
                <ScheduleItemRow
                  key={evt.id}
                  event={evt}
                  currentUserId={user?.id}
                  getProfile={(uid) => getMemberProfile(uid, evt)}
                  onToggle={() => toggleEventAttendance(evt.id)}
                  onLongPress={() => openEditModal(evt)}
                />
              ))}
            </div>
          </div>
        )}

        {dayEvents.length === 0 && (
          <div className="py-16 text-center text-slate-500 text-sm">
            No events scheduled for this day
          </div>
        )}
      </div>

      {/* Edit/Delete Event Bottom Sheet */}
      <BottomSheet isOpen={Boolean(editingEvent)} onClose={() => setEditingEvent(null)}>
        {editingEvent && (
          <form onSubmit={handleSaveEdit} className="flex flex-col gap-3.5">
            <div className="text-lg font-bold text-white px-1">
              Edit Event
            </div>
            <div>
              <input
                type="text"
                inputMode="text"
                enterKeyHint="next"
                autoCapitalize="sentences"
                placeholder="Title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={(e) => handleEnterKeyNavigation(e)}
                required
                className="w-full h-12 px-4 rounded-[18px] bg-white/10 text-white text-[17px] outline-none border border-white/[0.08]"
              />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <input
                type="text"
                inputMode="text"
                enterKeyHint="next"
                placeholder="Time (e.g. 14:00)"
                value={editTime}
                onChange={(e) => setEditTime(e.target.value)}
                onKeyDown={(e) => handleEnterKeyNavigation(e)}
                className="w-full h-12 px-4 rounded-[18px] bg-white/10 text-white text-[17px] outline-none border border-white/[0.08]"
              />
              <input
                type="text"
                inputMode="text"
                enterKeyHint="next"
                autoCapitalize="words"
                placeholder="Location"
                value={editLocation}
                onChange={(e) => setEditLocation(e.target.value)}
                onKeyDown={(e) => handleEnterKeyNavigation(e)}
                className="w-full h-12 px-4 rounded-[18px] bg-white/10 text-white text-[17px] outline-none border border-white/[0.08]"
              />
            </div>
            <div>
              <input
                type="text"
                inputMode="text"
                enterKeyHint="done"
                autoCapitalize="sentences"
                placeholder="Notes"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                onKeyDown={(e) => handleEnterKeyNavigation(e)}
                className="w-full h-12 px-4 rounded-[18px] bg-white/10 text-white text-[17px] outline-none border border-white/[0.08]"
              />
            </div>
            <div className="flex items-center gap-2.5 pt-2 mb-5">
              <button
                type="button"
                onClick={handleDelete}
                className="h-12 px-4.5 rounded-[18px] bg-red-500/15 text-red-400 font-bold text-xs active-press cursor-pointer flex items-center justify-center gap-1.5 hover:bg-red-500/25 transition-colors"
              >
                <Trash size={18} weight="bold" />
                <span>Delete</span>
              </button>
              <button
                type="submit"
                className="flex-1 h-12 rounded-[18px] bg-[#0A84FF] text-white font-bold text-sm active-press cursor-pointer shadow-sm hover:bg-[#007AFF] transition-colors"
              >
                Save
              </button>
            </div>
          </form>
        )}
      </BottomSheet>
    </CollapsingHeaderLayout>
  );
};

interface ScheduleItemRowProps {
  event: EventItem;
  currentUserId?: string;
  getProfile: (userId: string) => Profile;
  onToggle: () => void;
  onLongPress: () => void;
}

const ScheduleItemRow: React.FC<ScheduleItemRowProps> = ({
  event,
  currentUserId,
  getProfile,
  onToggle,
  onLongPress,
}) => {
  const isAttending = currentUserId && (event.attendees || []).includes(currentUserId);
  const attendees = event.attendees || [];

  const timerRef = React.useRef<NodeJS.Timeout | null>(null);
  const isMovedRef = React.useRef(false);
  const startPosRef = React.useRef<{ x: number; y: number } | null>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    isMovedRef.current = false;
    startPosRef.current = { x: e.clientX, y: e.clientY };
    timerRef.current = setTimeout(() => {
      if (!isMovedRef.current) {
        onLongPress();
      }
    }, 400);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!startPosRef.current) return;
    const dx = Math.abs(e.clientX - startPosRef.current.x);
    const dy = Math.abs(e.clientY - startPosRef.current.y);
    if (dx > 8 || dy > 8) {
      isMovedRef.current = true;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const handlePointerUp = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onContextMenu={(e) => e.preventDefault()}
      className="flex items-center justify-between min-h-[48px] px-2 py-2 hover:bg-white/5 active:bg-white/10 cursor-pointer select-none transition-colors animate-spring-in"
    >
      <div className="flex flex-col flex-1 pr-2 truncate">
        <div className="flex items-center gap-2.5">
          {event.time && (
            <span className="text-xs font-bold text-[#0A84FF] shrink-0">
              {formatTime24(event.time)}
            </span>
          )}
          <span className="text-[15px] font-semibold text-white truncate">
            {event.title}
          </span>
        </div>
        {(event.location || event.notes) && (
          <div className="text-xs text-slate-400 truncate mt-0.5">
            {event.location}
            {event.location && event.notes && ' · '}
            {event.notes}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2.5 shrink-0">
        {attendees.length > 0 && (
          <div className="flex -space-x-2 overflow-hidden">
            {attendees.slice(0, 3).map((uid) => {
              const prof = getProfile(uid);
              return (
                <Avatar
                  key={uid}
                  name={prof.display_name}
                  avatarUrl={prof.avatar_url}
                  color={prof.color}
                  size={24}
                />
              );
            })}
          </div>
        )}

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className={`min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer active:scale-90`}
          title="Going"
        >
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center transition-all duration-200 ${
              isAttending
                ? 'bg-[#0A84FF] text-white shadow-xs'
                : 'border-2 border-white/30 text-transparent hover:border-white/50'
            }`}
          >
            <Check size={14} weight="bold" />
          </div>
        </button>
      </div>
    </div>
  );
};
