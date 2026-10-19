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
  const channelRef = useRef<RealtimeChannel | null>(null);
  const channelReadyRef = useRef(false);
  const activeCallRef = useRef<ActiveCall | null>(null);
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
      if (activeCallRef.current?.callId !== data.callId) return;
      closePeer(data.userId);
      updateParticipants(participantsRef.current.filter((member) => member.userId !== data.userId));
    });
    channel.on('broadcast', { event: 'call-end' }, ({ payload }) => {
      const data = payload as { callId: string };
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
        updateIncomingCall(null);
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
    [clearCall, getMedia, send, updateActiveCall, updateIncomingCall, updateParticipants, userId, userProfile],
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
      updateIncomingCall(null);
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
    try {
      if (call.hostId === userId) {
        await send('call-end', { callId: call.callId });
      } else {
        await send('call-leave', { callId: call.callId, userId });
      }
    } catch (error) {
      console.error('Could not notify other call participants:', error);
    } finally {
      clearCall();
    }
  }, [clearCall, send, userId]);

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
    clearCallError: () => setCallError(''),
    startCall,
    acceptCall,
    declineCall,
    leaveCall,
    toggleMicrophone,
    toggleCamera,
  };
}

export type GroupCallManager = ReturnType<typeof useGroupCall>;
