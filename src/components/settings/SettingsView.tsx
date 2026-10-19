import React, { useState, useRef } from 'react';
import {
  Copy,
  Check,
  Camera,
  SignOut,
  CalendarBlank,
  ArrowsLeftRight,
  PaperPlaneTilt,
  Trash,
  ShieldCheck,
  User,
  X,
} from '@phosphor-icons/react';
import { useAuth } from '../../context/AuthContext';
import { useTrip } from '../../context/TripContext';
import { TripMember } from '../../types';
import { Avatar } from '../common/Avatar';
import { DatePickerModal } from '../common/DatePickerModal';
import { BottomSheet } from '../common/BottomSheet';
import { formatTripDate } from '../../utils/date';
import { uploadAsset } from '../../lib/supabase';
import { PWAInstallPrompt } from '../common/PWAInstallPrompt';
import { CollapsingHeaderLayout } from '../common/CollapsingHeaderLayout';

interface SettingsViewProps {
  onNavigateToMessages?: (mentionName?: string) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onNavigateToMessages }) => {
  const { user, profile, updateProfile, signOut } = useAuth();
  const { currentTrip, tripMembers, isOwner, updateTrip, exitTrip, removeMember } = useTrip();

  // Avatar upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Edit Name
  const [editingName, setEditingName] = useState(false);
  const [displayName, setDisplayName] = useState(profile?.display_name || '');

  // Edit Trip (owner only)
  const [tripName, setTripName] = useState(currentTrip?.name || '');
  const [startDate, setStartDate] = useState(currentTrip?.start_date || '');
  const [endDate, setEndDate] = useState(currentTrip?.end_date || '');
  const [activeDatePicker, setActiveDatePicker] = useState<'start' | 'end' | null>(null);
  const [savedTripNotice, setSavedTripNotice] = useState(false);

  // Copy code feedback
  const [copiedCode, setCopiedCode] = useState(false);

  // Member details sheet
  const [selectedMember, setSelectedMember] = useState<TripMember | null>(null);
  const [copiedMemberName, setCopiedMemberName] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  // Long press refs
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const didLongPressRef = useRef(false);

  if (!currentTrip) return null;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(currentTrip.invite_code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleAvatarSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const publicUrl = await uploadAsset(file, 'avatars');
      await updateProfile({ avatar_url: publicUrl });
    } catch (err) {
      console.warn('Avatar upload error:', err);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSaveName = async () => {
    if (!displayName.trim()) return;
    await updateProfile({ display_name: displayName.trim() });
    setEditingName(false);
  };

  const handleSaveTrip = async () => {
    if (!tripName.trim() || !startDate || !endDate) return;
    await updateTrip({
      name: tripName.trim(),
      start_date: startDate,
      end_date: endDate,
    });
    setSavedTripNotice(true);
    setTimeout(() => setSavedTripNotice(false), 2000);
  };

  const openMemberSheet = (m: TripMember) => {
    setSelectedMember(m);
    setCopiedMemberName(false);
    setConfirmRemove(false);
  };

  const handleMemberPointerDown = (m: TripMember) => {
    didLongPressRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      didLongPressRef.current = true;
      openMemberSheet(m);
    }, 320);
  };

  const handleMemberPointerUp = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleMemberClick = (m: TripMember) => {
    // Allows opening via click or after long press release
    openMemberSheet(m);
  };

  const handleCopyMemberName = () => {
    if (!selectedMember) return;
    const name = selectedMember.profile?.display_name || 'Member';
    navigator.clipboard.writeText(name);
    setCopiedMemberName(true);
    setTimeout(() => setCopiedMemberName(false), 2000);
  };

  const handleChatWithMember = () => {
    if (!selectedMember) return;
    const name = selectedMember.profile?.display_name || 'Member';
    setSelectedMember(null);
    if (onNavigateToMessages) {
      onNavigateToMessages(name);
    }
  };

  const handleRemoveMember = async () => {
    if (!selectedMember) return;
    setIsRemoving(true);
    try {
      await removeMember(selectedMember.user_id);
      setSelectedMember(null);
    } catch (err) {
      console.warn('Failed to remove member:', err);
    } finally {
      setIsRemoving(false);
      setConfirmRemove(false);
    }
  };

  return (
    <CollapsingHeaderLayout title="Settings">
      <div className="space-y-6 pt-2 pb-24">
        {/* User Profile Header - Clean without panel */}
        <div className="flex flex-col items-center text-center pt-2">
          <div className="relative mb-3">
            <Avatar
              name={profile?.display_name}
              avatarUrl={profile?.avatar_url}
              color={profile?.color}
              size={84}
            />
            <button
              type="button"
              disabled={uploadingAvatar}
              onClick={() => fileInputRef.current?.click()}
              className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-[#0A84FF] text-white flex items-center justify-center border-2 border-black active:scale-90 cursor-pointer shadow-md transition-transform"
              title="Change avatar"
            >
              <Camera size={15} weight="bold" />
            </button>
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              onChange={handleAvatarSelect}
              className="hidden"
            />
          </div>

          {editingName ? (
            <div className="flex items-center gap-2 mt-1">
              <input
                type="text"
                autoFocus
                inputMode="text"
                enterKeyHint="done"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSaveName();
                  }
                }}
                className="h-10 px-4 rounded-full bg-white/10 text-[17px] text-center font-bold text-white outline-none border border-white/20"
              />
              <button
                type="button"
                onClick={handleSaveName}
                className="text-sm font-bold text-[#0A84FF] active-press cursor-pointer px-3 py-1.5"
              >
                Save
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setDisplayName(profile?.display_name || '');
                setEditingName(true);
              }}
              className="text-lg font-bold text-white mt-0.5 active:scale-98 cursor-pointer transition-transform"
            >
              {profile?.display_name || 'User'}
            </button>
          )}

          <span className="text-xs text-slate-400 font-medium">
            {user?.email}
          </span>
        </div>

        {/* Switch Trip Button - Clean unboxed row */}
        <button
          type="button"
          onClick={exitTrip}
          className="w-full flex items-center justify-between py-3 px-2 active:bg-white/5 cursor-pointer text-left transition-colors border-y border-white/[0.08]"
        >
          <div className="flex items-center gap-3.5">
            <div className="w-9 h-9 rounded-full bg-[#0A84FF]/20 flex items-center justify-center text-[#0A84FF]">
              <ArrowsLeftRight size={18} weight="bold" />
            </div>
            <div>
              <div className="text-base font-bold text-white">
                Switch Trip
              </div>
              <div className="text-xs text-slate-400">
                Return to your trips list
              </div>
            </div>
          </div>
          <span className="text-xs font-bold text-[#0A84FF] px-2">
            All Trips
          </span>
        </button>

        {/* Trip Info & Invite Code - Clean row */}
        <div className="space-y-1">
          <div className="text-xs font-bold text-slate-400 px-2">
            Invite Code
          </div>
          <div className="flex items-center justify-between py-2 px-2">
            <div>
              <span className="text-2xl font-mono font-extrabold tracking-widest text-white">
                {currentTrip.invite_code}
              </span>
              <p className="text-xs text-slate-400 mt-0.5">
                Share this code with friends to join
              </p>
            </div>
            <button
              type="button"
              onClick={handleCopyCode}
              className="px-4 py-2 rounded-full bg-white/10 active:bg-white/20 text-white font-semibold text-xs flex items-center gap-1.5 active-press cursor-pointer transition-colors"
            >
              {copiedCode ? (
                <>
                  <Check size={14} weight="bold" className="text-emerald-400" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy size={14} weight="bold" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Owner Trip Details Editor - Clean without border panels */}
        {isOwner && (
          <div className="space-y-3 pt-1">
            <div className="text-xs font-bold text-slate-400 px-2">
              Trip Details (Owner)
            </div>
            <div className="space-y-3 px-1">
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">
                  Trip Name
                </label>
                <input
                  type="text"
                  value={tripName}
                  onChange={(e) => setTripName(e.target.value)}
                  placeholder="e.g. Hawaii Summer 2026"
                  className="w-full h-12 px-3.5 rounded-[16px] bg-white/10 text-white text-[16px] outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setActiveDatePicker('start')}
                  className="h-12 px-3.5 rounded-[16px] bg-white/10 text-left flex items-center justify-between active:bg-white/15 cursor-pointer transition-colors"
                >
                  <div className="truncate">
                    <span className="text-[10px] text-slate-400 block leading-tight">Start Date</span>
                    <span className="text-xs font-semibold text-white">
                      {startDate ? formatTripDate(startDate) : 'Select'}
                    </span>
                  </div>
                  <CalendarBlank size={16} className="text-slate-400 shrink-0" />
                </button>
                <button
                  type="button"
                  onClick={() => setActiveDatePicker('end')}
                  className="h-12 px-3.5 rounded-[16px] bg-white/10 text-left flex items-center justify-between active:bg-white/15 cursor-pointer transition-colors"
                >
                  <div className="truncate">
                    <span className="text-[10px] text-slate-400 block leading-tight">End Date</span>
                    <span className="text-xs font-semibold text-white">
                      {endDate ? formatTripDate(endDate) : 'Select'}
                    </span>
                  </div>
                  <CalendarBlank size={16} className="text-slate-400 shrink-0" />
                </button>
              </div>
              <div>
                <button
                  type="button"
                  onClick={handleSaveTrip}
                  className="w-full h-12 rounded-[18px] bg-[#0A84FF] text-white font-bold text-sm active-press cursor-pointer shadow-sm hover:bg-[#007AFF]"
                >
                  {savedTripNotice ? 'Saved!' : 'Save Changes'}
                </button>
              </div>
            </div>

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
        )}

        {/* Members - Clean divided list with Long-Click & Tap interactions */}
        <div className="space-y-1.5">
          <div className="text-xs font-bold text-slate-400 px-2 flex items-center justify-between">
            <span>Members ({tripMembers.length})</span>
            <span className="text-[11px] text-slate-500 font-normal">Tap or hold to inspect</span>
          </div>
          <div className="divide-y divide-white/[0.08] overflow-hidden">
            {tripMembers.map((m) => (
              <div
                key={m.user_id}
                onPointerDown={() => handleMemberPointerDown(m)}
                onPointerUp={handleMemberPointerUp}
                onPointerCancel={handleMemberPointerUp}
                onClick={() => handleMemberClick(m)}
                className="flex items-center justify-between min-h-[52px] px-2 py-2.5 cursor-pointer active:bg-white/10 rounded-xl transition-all"
                title="Tap or hold for member profile"
              >
                <div className="flex items-center gap-3">
                  <Avatar
                    name={m.profile?.display_name}
                    avatarUrl={m.profile?.avatar_url}
                    color={m.profile?.color}
                    size={36}
                  />
                  <div>
                    <div className="text-sm font-semibold text-white flex items-center gap-1.5">
                      <span>{m.profile?.display_name || 'Member'}</span>
                      {user?.id === m.user_id && (
                        <span className="text-[11px] text-slate-400 font-normal">(You)</span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {m.role === 'owner' ? 'Trip Organizer' : 'Member'}
                    </div>
                  </div>
                </div>
                {m.role === 'owner' ? (
                  <span className="text-[11px] font-bold text-[#0A84FF] bg-[#0A84FF]/20 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                    <ShieldCheck size={12} weight="bold" />
                    <span>Owner</span>
                  </span>
                ) : (
                  <span className="text-xs text-slate-500">View</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Install App */}
        <div className="flex justify-center pt-2">
          <PWAInstallPrompt />
        </div>

        {/* Sign Out */}
        <div className="pt-2 pb-6">
          <button
            type="button"
            onClick={signOut}
            className="w-full min-h-[48px] px-4 rounded-[18px] bg-red-500/15 hover:bg-red-500/25 flex items-center justify-center gap-2 text-red-400 font-bold text-sm active-press cursor-pointer transition-colors"
          >
            <SignOut size={18} weight="bold" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {/* Member Profile Bottom Sheet */}
      <BottomSheet
        isOpen={Boolean(selectedMember)}
        onClose={() => {
          setSelectedMember(null);
          setConfirmRemove(false);
        }}
      >
        {selectedMember && (
          <div className="p-5 flex flex-col items-center text-center">
            {/* Large Avatar */}
            <div className="mb-3.5 relative">
              <Avatar
                name={selectedMember.profile?.display_name}
                avatarUrl={selectedMember.profile?.avatar_url}
                color={selectedMember.profile?.color}
                size={72}
              />
            </div>

            {/* Name & Role */}
            <h3 className="text-xl font-bold text-white mb-1">
              {selectedMember.profile?.display_name || 'Member'}
            </h3>

            <div className="flex items-center gap-1.5 mb-6">
              {selectedMember.role === 'owner' ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#0A84FF] bg-[#0A84FF]/15 px-3 py-1 rounded-full">
                  <ShieldCheck size={14} weight="bold" />
                  <span>Trip Owner</span>
                </span>
              ) : (
                <span className="text-xs font-medium text-slate-400 bg-white/10 px-3 py-1 rounded-full">
                  Trip Member
                </span>
              )}
              {user?.id === selectedMember.user_id && (
                <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/15 px-2.5 py-1 rounded-full">
                  You
                </span>
              )}
            </div>

            {/* Action Buttons */}
            <div className="w-full space-y-2.5 mb-2">
              {/* Chat / Mention */}
              <button
                type="button"
                onClick={handleChatWithMember}
                className="w-full h-12 rounded-[18px] bg-[#0A84FF] hover:bg-[#007AFF] text-white font-semibold text-sm flex items-center justify-center gap-2.5 active-press cursor-pointer transition-colors"
              >
                <PaperPlaneTilt size={18} weight="bold" />
                <span>Send Message / Mention</span>
              </button>

              {/* Copy Name */}
              <button
                type="button"
                onClick={handleCopyMemberName}
                className="w-full h-12 rounded-[18px] bg-white/10 hover:bg-white/15 text-white font-semibold text-sm flex items-center justify-center gap-2.5 active-press cursor-pointer transition-colors"
              >
                {copiedMemberName ? (
                  <>
                    <Check size={18} weight="bold" className="text-emerald-400" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy size={18} weight="bold" />
                    <span>Copy Name</span>
                  </>
                )}
              </button>

              {/* Owner actions: Remove Member */}
              {isOwner && user?.id !== selectedMember.user_id && (
                <div className="pt-2">
                  {confirmRemove ? (
                    <div className="p-3.5 rounded-[18px] bg-red-500/15 border border-red-500/20 text-left space-y-3">
                      <div className="text-xs text-red-300">
                        Remove <strong className="text-white">{selectedMember.profile?.display_name}</strong> from this trip? They will lose access to all trip data.
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={isRemoving}
                          onClick={handleRemoveMember}
                          className="flex-1 h-10 rounded-[14px] bg-red-600 hover:bg-red-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 active-press cursor-pointer"
                        >
                          <Trash size={14} weight="bold" />
                          <span>{isRemoving ? 'Removing...' : 'Yes, Remove'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmRemove(false)}
                          className="px-4 h-10 rounded-[14px] bg-white/10 text-slate-300 text-xs font-semibold active-press cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmRemove(true)}
                      className="w-full h-12 rounded-[18px] bg-red-500/10 hover:bg-red-500/20 text-red-400 font-semibold text-sm flex items-center justify-center gap-2 active-press cursor-pointer transition-colors"
                    >
                      <Trash size={18} weight="bold" />
                      <span>Remove from Trip</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Close Button */}
            <button
              type="button"
              onClick={() => {
                setSelectedMember(null);
                setConfirmRemove(false);
              }}
              className="mt-3 text-xs font-semibold text-slate-400 hover:text-white py-2 px-4 cursor-pointer"
            >
              Done
            </button>
          </div>
        )}
      </BottomSheet>
    </CollapsingHeaderLayout>
  );
};
