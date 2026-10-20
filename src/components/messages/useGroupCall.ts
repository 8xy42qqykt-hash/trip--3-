import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { Profile } from '../../types';
import { supabase } from '../../lib/supabase';

export type CallKind = 'audio' | 'video';

export interface CallParticipant {
  userId: string;
  profile: Profile;
}

export interface CallInvite {
  callId: string;
  kind: CallKind;
  hostId: string;
  hostProfile: Profile;
  startedAt: number;
  participants: CallParticipant[];
}

export interface ActiveCall {
  callId: string;
  kind: CallKind;
  hostId: string;
  startedAt: number;
}

export interface LastCallState {
  callId: string;
  startedAt: number;
  participantIds: string[];
  activeParticipantIds: string[];
  ended: boolean;
}

interface SignalPayload {
  callId: string;
  from: string;
  to: string;
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

const MAX_PARTICIPANTS = 6;
const turnUrls = (import.meta.env.VITE_TURN_URL || '')
  .split(',')
  .map((url: string) => url.trim())
  .filter(Boolean);
const iceServers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
if (turnUrls.length > 0 && import.meta.env.VITE_TURN_USERNAME && import.meta.env.VITE_TURN_CREDENTIAL) {
  iceServers.push({
    urls: turnUrls,
    username: import.meta.env.VITE_TURN_USERNAME,
    credential: import.meta.env.VITE_TURN_CREDENTIAL,
  });
}

function mergeParticipants(...rosters: CallParticipant[][]) {
  return Array.from(
    new Map(rosters.flat().map((participant) => [participant.userId, participant])).values(),
  );
}

async function persistCallRoster(callId: string, participants: string[]) {
  if (!supabase) return;
  const { data, error: readError } = await supabase
    .from('call_sessions')
    .select('participant_history')
    .eq('call_id', callId)
    .maybeSingle();
  if (readError) throw readError;
  const participantHistory = Array.from(new Set([
    ...(data?.participant_history || []),
    ...participants,
  ]));
  const { error } = await supabase.from('call_sessions')
    .update({ participants, participant_history: participantHistory })
    .eq('call_id', callId)
    .is('ended_at', null);
  if (error) throw error;
}

async function finishCallSession(callId: string, participantIds: string[]) {
  if (!supabase) return;
  const { data, error: readError } = await supabase
    .from('call_sessions')
    .select('participant_history')
    .eq('call_id', callId)
    .maybeSingle();
  if (readError) throw readError;
  const participantHistory = Array.from(new Set([
    ...(data?.participant_history || []),
    ...participantIds,
  ]));
  const { error } = await supabase.from('call_sessions')
    .update({
      participants: [],
      participant_history: participantHistory,
      ended_at: new Date().toISOString(),
    })
    .eq('call_id', callId)
    .is('ended_at', null);
  if (error) throw error;
}

export function useGroupCall(
  tripId: string | undefined,
  userId: string | undefined,
  profile: Profile | null,
) {
  const [incomingCall, setIncomingCall] = useState<CallInvite | null>(null);
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [participants, setParticipants] = useState<CallParticipant[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [callError, setCallError] = useState('');
  const [lastCallState, setLastCallState] = useState<LastCallState | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const channelReadyRef = useRef(false);
  const activeCallRef = useRef<ActiveCall | null>(null);
  const lastKnownCallRef = useRef<{ callId: string; startedAt: number; participantIds: string[] } | null>(null);
  const incomingCallRef = useRef<CallInvite | null>(null);
  const participantsRef = useRef<CallParticipant[]>([]);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef(new Map<string, RTCPeerConnection>());
  const pendingCandidatesRef = useRef(new Map<string, RTCIceCandidateInit[]>());
  const userProfile: Profile = profile || {
    id: userId || '',
    display_name: 'Member',
    color: '#0A84FF',
  };

  const updateIncomingCall = useCallback((call: CallInvite | null) => {
    incomingCallRef.current = call;
    setIncomingCall(call);
  }, []);

  const updateParticipants = useCallback((next: CallParticipant[]) => {
    const unique = Array.from(new Map(next.map((member) => [member.userId, member])).values());
    participantsRef.current = unique;
    setParticipants(unique);
    const active = activeCallRef.current;
    if (active) {
      const previous = lastKnownCallRef.current;
      lastKnownCallRef.current = {
        callId: active.callId,
        startedAt: active.startedAt,
        participantIds: Array.from(new Set([
          ...(previous?.callId === active.callId ? previous.participantIds : []),
          ...unique.map((member) => member.userId),
        ])),
      };
    }
  }, []);

  const updateActiveCall = useCallback((call: ActiveCall | null) => {
    activeCallRef.current = call;
    setActiveCall(call);
  }, []);

  const send = useCallback(async (event: string, payload: Record<string, unknown>) => {
    const channel = channelRef.current;
    if (!channel || !channelReadyRef.current) {
      throw new Error('Call connection is not ready. Try again in a moment.');
    }
    const result = await channel.send({ type: 'broadcast', event, payload });
    if (result !== 'ok') throw new Error(`Call signaling failed: ${result}`);
  }, []);

  const closePeer = useCallback((peerId: string) => {
    const peer = peersRef.current.get(peerId);
    if (peer) {
      peer.onicecandidate = null;
      peer.ontrack = null;
      peer.close();
      peersRef.current.delete(peerId);
    }
    pendingCandidatesRef.current.delete(peerId);
    setRemoteStreams((current) => {
      const next = { ...current };
      delete next[peerId];
      return next;
    });
  }, []);

  const clearCall = useCallback(() => {
    peersRef.current.forEach((peer) => peer.close());
    peersRef.current.clear();
    pendingCandidatesRef.current.clear();
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStreams({});
    updateParticipants([]);
    updateActiveCall(null);
  }, [updateActiveCall, updateParticipants]);

  const makePeer = useCallback(
    (peerId: string) => {
      const existing = peersRef.current.get(peerId);
      if (existing) return existing;

      const peer = new RTCPeerConnection({ iceServers });
      peersRef.current.set(peerId, peer);
      localStreamRef.current?.getTracks().forEach((track) => {
        peer.addTrack(track, localStreamRef.current!);
      });
      peer.onicecandidate = (event) => {
        if (!event.candidate) return;
        const call = activeCallRef.current;
        if (call) {
          void send('signal', {
            callId: call.callId,
            from: userId || '',
            to: peerId,
            candidate: event.candidate.toJSON(),
          }).catch((error: unknown) => console.error('Could not send ICE candidate:', error));
        }
      };
      peer.ontrack = (event) => {
        const stream = event.streams[0];
        if (stream) {
          setRemoteStreams((current) => ({ ...current, [peerId]: stream }));
        }
      };
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === 'failed') {
          setCallError('Could not connect to a participant. This network may require a TURN relay.');
          closePeer(peerId);
        } else if (peer.connectionState === 'closed') {
          closePeer(peerId);
        }
      };
      return peer;
    },
    [closePeer, send, userId],
  );

  const applyPendingCandidates = useCallback(async (peerId: string, peer: RTCPeerConnection) => {
    const candidates = pendingCandidatesRef.current.get(peerId) || [];
    pendingCandidatesRef.current.delete(peerId);
    for (const candidate of candidates) {
      await peer.addIceCandidate(candidate);
    }
  }, []);

  const handleSignal = useCallback(
    async (signal: SignalPayload) => {
      const call = activeCallRef.current;
      if (!call || signal.callId !== call.callId || signal.to !== userId) return;
      const peer = makePeer(signal.from);

      if (signal.description) {
        await peer.setRemoteDescription(signal.description);
        await applyPendingCandidates(signal.from, peer);
        if (signal.description.type === 'offer') {
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          await send('signal', {
            callId: call.callId,
            from: userId || '',
            to: signal.from,
            description: peer.localDescription?.toJSON(),
          });
        }
      } else if (signal.candidate) {
        if (peer.remoteDescription) {
          await peer.addIceCandidate(signal.candidate);
        } else {
          const candidates = pendingCandidatesRef.current.get(signal.from) || [];
          candidates.push(signal.candidate);
          pendingCandidatesRef.current.set(signal.from, candidates);
        }
      }
    },
    [applyPendingCandidates, makePeer, send, userId],
  );

  const joinParticipant = useCallback(
    async (peerId: string, callId: string) => {
      if (!userId || peerId === userId) return;
      const peer = makePeer(peerId);
      if (userId.localeCompare(peerId) >= 0 || peer.signalingState !== 'stable') return;
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await send('signal', {
        callId,
        from: userId,
        to: peerId,
        description: peer.localDescription?.toJSON(),
      });
    },
    [makePeer, send, userId],
  );

  useEffect(() => {
    if (!tripId || !userId || !supabase) {
      channelReadyRef.current = false;
      channelRef.current = null;
      return;
    }
    const client = supabase;
    const channel = client.channel(`trip-calls:${tripId}`, { config: { private: true } });
    channelRef.current = channel;
    channel.on('broadcast', { event: 'call-invite' }, ({ payload }) => {
      const invite = payload as CallInvite;
      if (invite.hostId !== userId && !activeCallRef.current) updateIncomingCall(invite);
    });
    channel.on('broadcast', { event: 'call-join' }, ({ payload }) => {
      const data = payload as { callId: string; participant: CallParticipant; participants: CallParticipant[] };
      const call = activeCallRef.current;
      const roster = mergeParticipants(data.participants || [], [data.participant]);
      if (call?.callId !== data.callId) {
        const pending = incomingCallRef.current;
        if (pending?.callId === data.callId) {
          updateIncomingCall({
            ...pending,
            participants: mergeParticipants(pending.participants, roster),
          });
        }
        return;
      }
      if (
        !participantsRef.current.some((member) => member.userId === data.participant.userId) &&
        participantsRef.current.length >= MAX_PARTICIPANTS
      ) {
        void send('call-full', { callId: data.callId, to: data.participant.userId }).catch(
          (error: unknown) => console.error('Could not reject extra call participant:', error),
        );
        return;
      }
      const updatedRoster = mergeParticipants(participantsRef.current, roster);
      updateParticipants(updatedRoster);
      void persistCallRoster(call.callId, updatedRoster.map((member) => member.userId))
        .catch((error: unknown) => console.error('Could not persist call participants:', error));
      void send('call-roster', { callId: call.callId, participants: updatedRoster }).catch(
        (error: unknown) => console.error('Could not update call participants:', error),
      );
      for (const member of updatedRoster) {
        void joinParticipant(member.userId, call.callId).catch((error: unknown) => {
          console.error('Could not establish peer connection:', error);
          setCallError('Could not connect to a participant. The network may require a TURN relay.');
        });
      }
    });
    channel.on('broadcast', { event: 'call-roster' }, ({ payload }) => {
      const data = payload as { callId: string; participants: CallParticipant[] };
      const call = activeCallRef.current;
      const roster = data.participants || [];
      if (call?.callId === data.callId) {
        updateParticipants(mergeParticipants(participantsRef.current, roster));
        for (const member of roster) {
          void joinParticipant(member.userId, call.callId).catch((error: unknown) => {
            console.error('Could not establish peer connection:', error);
            setCallError('Could not connect to a participant. The network may require a TURN relay.');
          });
        }
        return;
      }
      const pending = incomingCallRef.current;
      if (pending?.callId === data.callId) {
        updateIncomingCall({
          ...pending,
          participants: mergeParticipants(pending.participants, roster),
        });
      }
    });
    channel.on('broadcast', { event: 'call-leave' }, ({ payload }) => {
      const data = payload as { callId: string; userId: string };
      const call = activeCallRef.current;
      if (call?.callId !== data.callId) return;
      closePeer(data.userId);
      const roster = participantsRef.current.filter((member) => member.userId !== data.userId);
      updateParticipants(roster);
      void persistCallRoster(call.callId, roster.map((member) => member.userId))
        .catch((error: unknown) => console.error('Could not persist call participants:', error));
    });
    channel.on('broadcast', { event: 'call-end' }, ({ payload }) => {
      const data = payload as { callId: string };
      const active = activeCallRef.current;
      const incoming = incomingCallRef.current;
      const known = lastKnownCallRef.current;
      if (
        active?.callId === data.callId
        || incoming?.callId === data.callId
        || known?.callId === data.callId
      ) {
        setLastCallState({
          callId: data.callId,
          startedAt: active?.startedAt
            || incoming?.startedAt
            || known?.startedAt
            || Date.now(),
          participantIds: Array.from(new Set([
            ...(known?.callId === data.callId ? known.participantIds : []),
            ...participantsRef.current.map((member) => member.userId),
            ...(incoming?.callId === data.callId
              ? incoming.participants.map((member) => member.userId)
              : []),
          ])),
          activeParticipantIds: [],
          ended: true,
        });
      }
      if (incoming?.callId === data.callId) updateIncomingCall(null);
      void client.from('call_sessions')
        .update({ ended_at: new Date().toISOString(), participants: [] })
        .eq('call_id', data.callId)
        .is('ended_at', null)
        .then(({ error }) => {
          if (error) console.error('Could not persist call end:', error);
        });
      if (activeCallRef.current?.callId === data.callId) clearCall();
    });
    channel.on('broadcast', { event: 'call-full' }, ({ payload }) => {
      const data = payload as { callId: string; to: string };
      if (data.to === userId && incomingCallRef.current?.callId === data.callId) {
        updateIncomingCall(null);
        setCallError('This call already has six participants.');
      } else if (data.to === userId && activeCallRef.current?.callId === data.callId) {
        clearCall();
        setCallError('This call already has six participants.');
      }
    });
    channel.on('broadcast', { event: 'signal' }, ({ payload }) => {
      void handleSignal(payload as SignalPayload).catch((error: unknown) => {
        console.error('WebRTC signaling failed:', error);
        setCallError('Could not connect the call. Check your network and try again.');
      });
    });
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        channelReadyRef.current = true;
        void client.from('call_sessions')
          .select('call_id, kind, host_id, started_at, participants')
          .eq('trip_id', tripId)
          .is('ended_at', null)
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle()
          .then(async ({ data, error }) => {
            if (error) {
              console.error('Could not check for an active call:', error);
              return;
            }
            if (!data || activeCallRef.current || incomingCallRef.current) return;
            const ids = Array.from(new Set([data.host_id, ...(data.participants || [])]));
            const { data: profiles, error: profilesError } = await client
              .from('profiles')
              .select('id, display_name, avatar_url, color')
              .in('id', ids);
            if (profilesError) {
              console.error('Could not load active call participants:', profilesError);
              return;
            }
            const members = (profiles || []).map((member) => ({
              userId: member.id,
              profile: { ...member, display_name: member.display_name || 'Trip member' },
            }));
            const hostProfile = members.find((member) => member.userId === data.host_id)?.profile;
            if (!hostProfile || !members.some((member) => member.userId === userId)) return;
            updateIncomingCall({
              callId: data.call_id,
              kind: data.kind,
              hostId: data.host_id,
              hostProfile,
              startedAt: new Date(data.started_at).getTime(),
              participants: members,
            });
          });
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        channelReadyRef.current = false;
        console.error(`Call signaling channel failed: ${status}`);
      }
    });

    return () => {
      channelReadyRef.current = false;
      channelRef.current = null;
      updateIncomingCall(null);
      clearCall();
      void client.removeChannel(channel);
    };
  }, [
    tripId,
    userId,
    applyPendingCandidates,
    clearCall,
    closePeer,
    handleSignal,
    joinParticipant,
    updateActiveCall,
    updateIncomingCall,
    updateParticipants,
  ]);

  const getMedia = useCallback(async (kind: CallKind) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('This browser does not support secure audio/video calls.');
    }
    return navigator.mediaDevices.getUserMedia({
      audio: true,
      video: kind === 'video' ? { facingMode: 'user' } : false,
    });
  }, []);

  const startCall = useCallback(
    async (kind: CallKind, onlineMembers: CallParticipant[]) => {
      setCallError('');
      if (!channelReadyRef.current) {
        setCallError('Call service is connecting. Please try again in a moment.');
        return;
      }
      if (participantsRef.current.length >= MAX_PARTICIPANTS) {
        setCallError('Calls are limited to six participants.');
        return;
      }
      try {
        const stream = await getMedia(kind);
        const callId = Array.from(crypto.getRandomValues(new Uint32Array(4)))
          .map((value) => value.toString(16).padStart(8, '0'))
          .join('');
        const startedAt = Date.now();
        const me = { userId: userId || '', profile: userProfile };
        const roster = [me];
        localStreamRef.current = stream;
        setLocalStream(stream);
        updateParticipants(roster);
        updateActiveCall({ callId, kind, hostId: userId || '', startedAt });
        lastKnownCallRef.current = { callId, startedAt, participantIds: [userId || ''] };
        setLastCallState(null);
        updateIncomingCall(null);
        if (supabase && tripId) {
          const { error } = await supabase.from('call_sessions').insert({
            call_id: callId,
            trip_id: tripId,
            kind,
            host_id: userId,
            started_at: new Date(startedAt).toISOString(),
            participants: [userId],
            participant_history: [userId],
          });
          if (error) throw error;
        }
        await send('call-invite', {
          callId,
          kind,
          hostId: userId,
          hostProfile: userProfile,
          startedAt,
          participants: roster,
          invitees: onlineMembers.map((member) => member.userId),
        });
      } catch (error) {
        console.error('Could not start call:', error);
        setCallError(error instanceof Error ? error.message : 'Could not start the call.');
        clearCall();
      }
    },
    [clearCall, getMedia, send, tripId, updateActiveCall, updateIncomingCall, updateParticipants, userId, userProfile],
  );

  const acceptCall = useCallback(async () => {
    const invite = incomingCallRef.current;
    if (!invite || !userId) return;
    setCallError('');
    if (invite.participants.length >= MAX_PARTICIPANTS) {
      updateIncomingCall(null);
      setCallError('This call already has six participants.');
      try {
        await send('call-full', { callId: invite.callId, to: userId });
      } catch (error) {
        console.error('Could not notify caller that the call is full:', error);
      }
      return;
    }
    try {
      const stream = await getMedia(invite.kind);
      const me = { userId, profile: userProfile };
      const roster = [...invite.participants, me];
      localStreamRef.current = stream;
      setLocalStream(stream);
      updateParticipants(roster);
      updateActiveCall({
        callId: invite.callId,
        kind: invite.kind,
        hostId: invite.hostId,
        startedAt: invite.startedAt,
      });
      lastKnownCallRef.current = {
        callId: invite.callId,
        startedAt: invite.startedAt,
        participantIds: roster.map((member) => member.userId),
      };
      setLastCallState(null);
      updateIncomingCall(null);
      if (supabase) {
        await persistCallRoster(invite.callId, roster.map((member) => member.userId));
      }
      await send('call-join', {
        callId: invite.callId,
        participant: me,
        participants: roster,
      });
      await Promise.all(
        invite.participants.map((participant) => joinParticipant(participant.userId, invite.callId)),
      );
    } catch (error) {
      console.error('Could not join call:', error);
      setCallError(error instanceof Error ? error.message : 'Could not join the call.');
      clearCall();
    }
  }, [
    clearCall,
    getMedia,
    joinParticipant,
    send,
    updateActiveCall,
    updateIncomingCall,
    updateParticipants,
    userId,
    userProfile,
  ]);

  const declineCall = useCallback(() => updateIncomingCall(null), [updateIncomingCall]);

  const leaveCall = useCallback(async () => {
    const call = activeCallRef.current;
    if (!call) return;
    const remaining = participantsRef.current.filter((member) => member.userId !== userId);
    const known = lastKnownCallRef.current;
    setLastCallState({
      callId: call.callId,
      startedAt: call.startedAt,
      participantIds: Array.from(new Set([
        ...(known?.callId === call.callId ? known.participantIds : []),
        ...participantsRef.current.map((member) => member.userId),
      ])),
      activeParticipantIds: remaining.map((member) => member.userId),
      ended: remaining.length === 0,
    });
    try {
      if (remaining.length === 0) {
        await send('call-end', { callId: call.callId });
        if (supabase) {
          await finishCallSession(call.callId, participantsRef.current.map((member) => member.userId));
        }
      } else {
        if (supabase) {
          await persistCallRoster(call.callId, remaining.map((member) => member.userId));
        }
        await send('call-leave', { callId: call.callId, userId });
      }
    } catch (error) {
      console.error('Could not notify other call participants:', error);
    } finally {
      clearCall();
    }
  }, [clearCall, send, userId]);

  const joinCall = useCallback(async (callId: string) => {
    if (!supabase || !tripId || !userId) {
      setCallError('Call joining requires a connected trip.');
      return;
    }
    const deadline = Date.now() + 5000;
    while (!channelReadyRef.current && Date.now() < deadline) {
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
    if (!channelReadyRef.current) {
      setCallError('Call service is still connecting. Try joining again.');
      return;
    }
    const { data, error } = await supabase.from('call_sessions')
      .select('call_id, kind, host_id, started_at, participants, participant_history, ended_at')
      .eq('call_id', callId)
      .eq('trip_id', tripId)
      .maybeSingle();
    if (error) {
      setCallError(`Could not join the call: ${error.message}`);
      return;
    }
    if (!data) {
      setCallError('This call has ended.');
      return;
    }
    if (data.ended_at) {
      setLastCallState({
        callId,
        startedAt: new Date(data.started_at).getTime(),
        participantIds: data.participant_history || [],
        activeParticipantIds: [],
        ended: true,
      });
      return;
    }
    const ids = Array.from(new Set([data.host_id, ...(data.participants || [])]));
    const { data: profiles, error: profilesError } = await supabase.from('profiles')
      .select('id, display_name, avatar_url, color')
      .in('id', ids);
    if (profilesError) {
      setCallError(`Could not load call participants: ${profilesError.message}`);
      return;
    }
    const roster = (profiles || []).map((member) => ({
      userId: member.id,
      profile: { ...member, display_name: member.display_name || 'Trip member' },
    }));
    const hostProfile = roster.find((member) => member.userId === data.host_id)?.profile;
    if (!hostProfile) {
      setCallError('The call host profile could not be loaded.');
      return;
    }
    updateIncomingCall({
      callId: data.call_id,
      kind: data.kind,
      hostId: data.host_id,
      hostProfile,
      startedAt: new Date(data.started_at).getTime(),
      participants: roster,
    });
    await acceptCall();
  }, [acceptCall, tripId, updateIncomingCall, userId]);

  const toggleMicrophone = useCallback(() => {
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !track.enabled;
    });
    return localStreamRef.current?.getAudioTracks().some((track) => track.enabled) ?? false;
  }, []);

  const toggleCamera = useCallback(() => {
    localStreamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = !track.enabled;
    });
    return localStreamRef.current?.getVideoTracks().some((track) => track.enabled) ?? false;
  }, []);

  return {
    incomingCall,
    activeCall,
    participants,
    localStream,
    remoteStreams,
    callError,
    lastCallState,
    clearCallError: () => setCallError(''),
    startCall,
    acceptCall,
    declineCall,
    joinCall,
    leaveCall,
    toggleMicrophone,
    toggleCamera,
  };
}

export type GroupCallManager = ReturnType<typeof useGroupCall>;
