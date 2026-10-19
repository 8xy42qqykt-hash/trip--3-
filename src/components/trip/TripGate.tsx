import React, { useState, useEffect } from 'react';
import { useTrip } from '../../context/TripContext';
import { useAuth } from '../../context/AuthContext';
import { DatePickerModal } from '../common/DatePickerModal';
import { formatTripDate, getTodayDateString } from '../../utils/date';
import { Avatar } from '../common/Avatar';
import { BottomSheet } from '../common/BottomSheet';
import { Plus, Hash, CalendarBlank, SignOut, CaretLeft, CaretRight } from '@phosphor-icons/react';

export const TripGate: React.FC = () => {
  const { createTrip, joinTrip, userTrips, selectTrip, loadUserTrips, isLoadingTrips } = useTrip();
  const { user, profile, signOut } = useAuth();

  const [isPlusMenuOpen, setIsPlusMenuOpen] = useState(false);
  const [activeForm, setActiveForm] = useState<'create' | 'join' | null>(null);

  // Create state
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(getTodayDateString());
  const [endDate, setEndDate] = useState(getTodayDateString());
  const [activeDatePicker, setActiveDatePicker] = useState<'start' | 'end' | null>(null);

  // Join state
  const [inviteCode, setInviteCode] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadUserTrips();
  }, [loadUserTrips]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    const res = await createTrip(name, startDate, endDate);
    setLoading(false);
    if (res.error) {
      alert(res.error);
    } else {
      setActiveForm(null);
      setIsPlusMenuOpen(false);
      setName('');
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim()) return;
    setJoinError(null);
    setLoading(true);
    const res = await joinTrip(inviteCode);
    setLoading(false);
    if (res.error) {
      setJoinError(res.error);
    } else {
      setActiveForm(null);
      setIsPlusMenuOpen(false);
      setInviteCode('');
    }
  };

  const openPlusPopup = () => {
    setActiveForm(null);
    setJoinError(null);
    setIsPlusMenuOpen(true);
  };

  return (
    <div
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 20px)',
      }}
      className="h-full w-full overflow-y-auto flex flex-col justify-start px-5 pb-8 max-w-lg mx-auto bg-black text-white select-none"
    >
      {/* Header with NO logo icon box and NO trip count text */}
      <div className="flex items-center justify-between mb-7 px-1 pt-1">
        <h1 className="text-3xl font-extrabold tracking-tight text-white leading-tight">
          Trips
        </h1>

        <div className="flex items-center gap-3">
          {/* Plus button EXACTLY the same size as the profile picture (38px) */}
          <button
            type="button"
            onClick={openPlusPopup}
            className="w-[38px] h-[38px] min-w-[38px] min-h-[38px] rounded-full bg-[#0A84FF] text-white flex items-center justify-center active-press cursor-pointer shadow-md hover:bg-[#007AFF] transition-colors"
            title="New Trip"
          >
            <Plus size={20} weight="bold" />
          </button>
          <Avatar
            name={profile?.display_name}
            avatarUrl={profile?.avatar_url}
            color={profile?.color}
            size={38}
          />
          <button
            type="button"
            onClick={signOut}
            className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-red-400 hover:bg-white/10 active-press cursor-pointer transition-colors"
            title="Sign out"
          >
            <SignOut size={19} weight="bold" />
          </button>
        </div>
      </div>

      {/* Trips List */}
      <div className="flex flex-col gap-3 flex-1">
        {isLoadingTrips && userTrips.length === 0 ? (
          <div className="py-20 text-center text-slate-400 text-sm animate-pulse">
            Loading trips...
          </div>
        ) : userTrips.length > 0 ? (
          <div className="divide-y divide-white/[0.08]">
            {userTrips.map((trip) => {
              const isTripOwner = user && trip.owner_id === user.id;
              return (
                <button
                  key={trip.id}
                  type="button"
                  onClick={() => selectTrip(trip)}
                  className="w-full text-left py-4 px-1 hover:bg-white/[0.04] active:bg-white/[0.07] cursor-pointer transition-colors flex items-center justify-between group"
                >
                  <div className="flex flex-col gap-1 truncate pr-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[18px] font-bold text-white tracking-tight truncate">
                        {trip.name}
                      </span>
                      {isTripOwner && (
                        <span className="text-[11px] font-bold text-[#0A84FF] bg-[#0A84FF]/15 px-2.5 py-0.5 rounded-full shrink-0">
                          Owner
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
                      <CalendarBlank size={14} weight="regular" />
                      <span>
                        {formatTripDate(trip.start_date)} &ndash; {formatTripDate(trip.end_date)}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 font-mono">
                      Code: {trip.invite_code}
                    </div>
                  </div>
                  <CaretRight size={18} weight="bold" className="text-slate-500 group-hover:text-slate-300 transition-colors shrink-0" />
                </button>
              );
            })}
          </div>
        ) : (
          <div className="py-20 px-5 text-center mt-3">
            <CalendarBlank size={42} className="mx-auto text-slate-500 mb-3 opacity-80" />
            <h3 className="text-lg font-bold text-white">
              No Trips
            </h3>
            <button
              type="button"
              onClick={openPlusPopup}
              className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#0A84FF] text-white text-sm font-bold active-press shadow-md cursor-pointer hover:bg-[#007AFF] transition-colors"
            >
              <Plus size={17} weight="bold" />
              <span>Create or Join Trip</span>
            </button>
          </div>
        )}
      </div>

      {/* Action sheet */}
      <BottomSheet
        isOpen={isPlusMenuOpen}
        onClose={() => {
          setIsPlusMenuOpen(false);
          setActiveForm(null);
        }}
      >
        {!activeForm ? (
          <div className="flex flex-col divide-y divide-white/[0.08] py-1">
            <button
              type="button"
              onClick={() => setActiveForm('create')}
              className="w-full py-3.5 px-1 hover:bg-white/5 active:bg-white/10 cursor-pointer flex items-center justify-between transition-colors text-left"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-9 h-9 rounded-full bg-[#0A84FF] flex items-center justify-center text-white shrink-0 shadow-sm">
                  <Plus size={20} weight="bold" />
                </div>
                <span className="text-base font-bold text-white">
                  Create Trip
                </span>
              </div>
              <CaretRight size={18} weight="bold" className="text-slate-400" />
            </button>
            <button
              type="button"
              onClick={() => setActiveForm('join')}
              className="w-full py-3.5 px-1 hover:bg-white/5 active:bg-white/10 cursor-pointer flex items-center justify-between transition-colors text-left"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center text-white shrink-0">
                  <Hash size={20} weight="bold" />
                </div>
                <span className="text-base font-bold text-white">
                  Join Trip
                </span>
              </div>
              <CaretRight size={18} weight="bold" className="text-slate-400" />
            </button>
          </div>
        ) : activeForm === 'create' ? (
          <div className="flex flex-col gap-3.5 py-1">
            <div className="flex items-center gap-2 mb-1">
              <button
                type="button"
                onClick={() => setActiveForm(null)}
                className="text-slate-400 hover:text-white p-1.5 rounded-full active-press cursor-pointer"
              >
                <CaretLeft size={20} weight="bold" />
              </button>
              <h3 className="text-lg font-bold text-white">
                Create Trip
              </h3>
            </div>
            <form onSubmit={handleCreate} className="space-y-3.5 mb-4">
              <input
                type="text"
                autoFocus
                inputMode="text"
                enterKeyHint="done"
                autoCapitalize="words"
                autoCorrect="on"
                spellCheck={true}
                placeholder="Trip Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full h-12 px-4 rounded-[18px] bg-white/10 text-white placeholder:text-slate-500 text-[17px] outline-none border border-white/[0.08]"
              />
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setActiveDatePicker('start')}
                  className="w-full h-12 px-3.5 rounded-[18px] bg-white/10 text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 active-press cursor-pointer border border-white/[0.08]"
                >
                  <CalendarBlank size={16} weight="regular" />
                  <span>{formatTripDate(startDate)}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveDatePicker('end')}
                  className="w-full h-12 px-3.5 rounded-[18px] bg-white/10 text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 active-press cursor-pointer border border-white/[0.08]"
                >
                  <CalendarBlank size={16} weight="regular" />
                  <span>{formatTripDate(endDate)}</span>
                </button>
              </div>
              <div className="pt-2 flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setActiveForm(null)}
                  className="flex-1 h-12 rounded-[20px] bg-white/10 text-slate-300 font-bold text-sm flex items-center justify-center active-press cursor-pointer"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={loading || !name.trim()}
                  className="flex-1 h-12 rounded-[20px] bg-[#0A84FF] disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center active-press cursor-pointer shadow-sm hover:bg-[#007AFF]"
                >
                  {loading ? 'Creating...' : 'Create Trip'}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="flex flex-col gap-3.5 py-1">
            <div className="flex items-center gap-2 mb-1">
              <button
                type="button"
                onClick={() => setActiveForm(null)}
                className="text-slate-400 hover:text-white p-1.5 rounded-full active-press cursor-pointer"
              >
                <CaretLeft size={20} weight="bold" />
              </button>
              <h3 className="text-lg font-bold text-white">
                Join Trip
              </h3>
            </div>
            <form onSubmit={handleJoin} className="space-y-3.5 mb-4">
              <input
                type="text"
                autoFocus
                inputMode="text"
                enterKeyHint="go"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                maxLength={6}
                placeholder="6-Letter Code (e.g. ABCXYZ)"
                value={inviteCode}
                onChange={(e) => {
                  setInviteCode(e.target.value.toUpperCase());
                  setJoinError(null);
                }}
                required
                className="w-full h-13 px-4 rounded-[18px] bg-white/10 text-white placeholder:text-slate-500 text-center font-bold tracking-widest text-[20px] outline-none border border-white/[0.08]"
              />
              {joinError && (
                <div className="text-xs text-red-400 text-center py-2.5 px-3.5 bg-red-500/15 rounded-[16px] border border-red-500/20">
                  {joinError}
                </div>
              )}
              <div className="pt-2 flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setActiveForm(null)}
                  className="flex-1 h-12 rounded-[20px] bg-white/10 text-slate-300 font-bold text-sm flex items-center justify-center active-press cursor-pointer"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={loading || inviteCode.trim().length !== 6}
                  className="flex-1 h-12 rounded-[20px] bg-[#0A84FF] disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center active-press cursor-pointer shadow-sm hover:bg-[#007AFF]"
                >
                  {loading ? 'Joining...' : 'Join Trip'}
                </button>
              </div>
            </form>
          </div>
        )}
      </BottomSheet>

      {/* Date Pickers */}
      <DatePickerModal
        isOpen={activeDatePicker === 'start'}
        onClose={() => setActiveDatePicker(null)}
        selectedDate={startDate}
        onSelectDate={(d) => {
          setStartDate(d);
          if (d > endDate) setEndDate(d);
        }}
      />
      <DatePickerModal
        isOpen={activeDatePicker === 'end'}
        onClose={() => setActiveDatePicker(null)}
        selectedDate={endDate}
        onSelectDate={(d) => {
          setEndDate(d);
          if (d < startDate) setStartDate(d);
        }}
      />
    </div>
  );
};
