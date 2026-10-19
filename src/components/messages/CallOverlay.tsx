import React, { useEffect, useRef, useState } from 'react';
import {
  Microphone,
  MicrophoneSlash,
  Phone,
  PhoneDisconnect,
  VideoCamera,
  VideoCameraSlash,
} from '@phosphor-icons/react';
import { Avatar } from '../common/Avatar';
import { CallParticipant, GroupCallManager } from './useGroupCall';

interface CallOverlayProps {
  call: GroupCallManager;
  userId?: string;
}

const formatDuration = (seconds: number) => {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainder = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
};

const VideoTile: React.FC<{
  profile: CallParticipant['profile'];
  stream: MediaStream | null;
  muted?: boolean;
  audioOnly: boolean;
}> = ({ profile, stream, muted = false, audioOnly }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [needsPlaybackTap, setNeedsPlaybackTap] = useState(false);

  useEffect(() => {
    const element = audioOnly ? audioRef.current : videoRef.current;
    if (element && element.srcObject !== stream) {
      element.srcObject = stream;
    }
    if (element && stream) {
      void element.play().then(
        () => setNeedsPlaybackTap(false),
        () => setNeedsPlaybackTap(true),
      );
    }
  }, [audioOnly, stream]);

  return (
    <div className="relative min-h-0 overflow-hidden rounded-3xl bg-[#1c1c20]">
      {stream && !audioOnly ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted}
          className="h-full min-h-40 w-full object-cover"
        />
      ) : stream ? (
        <audio
          ref={audioRef}
          autoPlay
          className="hidden"
        />
      ) : null}
      {needsPlaybackTap && (
        <button
          type="button"
          onClick={() => {
            const element = audioOnly ? audioRef.current : videoRef.current;
            if (element) {
              void element.play().then(
                () => setNeedsPlaybackTap(false),
                (error: unknown) => console.error('Could not start remote call playback:', error),
              );
            }
          }}
          className="absolute inset-x-3 top-3 rounded-xl bg-black/70 px-3 py-2 text-xs font-semibold text-white"
        >
          Tap to enable {audioOnly ? 'audio' : 'video'}
        </button>
      )}
      <div className={`${stream && !audioOnly ? 'hidden' : 'flex'} absolute inset-0 items-center justify-center`}>
        <Avatar
          name={profile.display_name}
          avatarUrl={profile.avatar_url}
          color={profile.color}
          size={88}
        />
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-3 pb-3 pt-8">
        <span className="text-sm font-semibold text-white">{profile.display_name}</span>
        {muted && <MicrophoneSlash size={15} className="ml-2 inline text-white/80" />}
      </div>
    </div>
  );
};

export const CallOverlay: React.FC<CallOverlayProps> = ({ call, userId }) => {
  const [isMicrophoneOn, setIsMicrophoneOn] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!call.activeCall) {
      setElapsedSeconds(0);
      setIsMicrophoneOn(true);
      setIsCameraOn(true);
      return;
    }
    const updateDuration = () => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - call.activeCall!.startedAt) / 1000)));
    };
    updateDuration();
    const timer = window.setInterval(updateDuration, 1000);
    return () => window.clearInterval(timer);
  }, [call.activeCall]);

  if (call.activeCall) {
    const localParticipant = call.participants.find((member) => member.userId === userId);
    const others = call.participants.filter((member) => member.userId !== userId);
    const tiles = [
      ...(localParticipant
        ? [{ participant: localParticipant, stream: call.localStream, muted: true }]
        : []),
      ...others.map((participant) => ({
        participant,
        stream: call.remoteStreams[participant.userId] || null,
        muted: false,
      })),
    ];

    return (
      <div
        className="fixed inset-0 z-[100] flex flex-col bg-[#08090c] px-4 pt-safe text-white"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
      >
        <header className="flex shrink-0 items-center justify-between py-4">
          <div>
            <div className="text-lg font-bold">
              {call.activeCall.kind === 'video' ? 'Video call' : 'Voice call'}
            </div>
            <div className="text-sm text-slate-400">
              {formatDuration(elapsedSeconds)} · {call.participants.length}/6 people
            </div>
          </div>
          <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300">
            Peer-to-peer
          </span>
        </header>

        {call.callError && (
          <div className="mb-3 flex items-center justify-between rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-200">
            <span>{call.callError}</span>
            <button type="button" onClick={call.clearCallError} aria-label="Dismiss call error">×</button>
          </div>
        )}

        <main
          className="grid min-h-0 flex-1 gap-3 overflow-y-auto"
          style={{
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(42vw, 220px), 1fr))',
            alignContent: 'center',
            gridAutoRows: 'minmax(160px, 1fr)',
          }}
        >
          {tiles.map(({ participant, stream, muted }) => (
            <VideoTile
              key={participant.userId}
              profile={participant.profile}
              stream={stream}
              muted={muted}
              audioOnly={call.activeCall!.kind === 'audio'}
            />
          ))}
          {others.length === 0 && (
            <div className="col-span-full py-5 text-center text-sm text-slate-400">
              Waiting for others to join…
            </div>
          )}
        </main>

        <footer className="flex shrink-0 items-center justify-center gap-4 py-6">
          <button
            type="button"
            onClick={() => setIsMicrophoneOn(call.toggleMicrophone())}
            aria-label={isMicrophoneOn ? 'Mute microphone' : 'Unmute microphone'}
            className={`flex h-14 w-14 items-center justify-center rounded-full ${
              isMicrophoneOn ? 'bg-white/15' : 'bg-red-500'
            }`}
          >
            {isMicrophoneOn ? <Microphone size={24} /> : <MicrophoneSlash size={24} />}
          </button>
          {call.activeCall.kind === 'video' && (
            <button
              type="button"
              onClick={() => setIsCameraOn(call.toggleCamera())}
              aria-label={isCameraOn ? 'Turn camera off' : 'Turn camera on'}
              className={`flex h-14 w-14 items-center justify-center rounded-full ${
                isCameraOn ? 'bg-white/15' : 'bg-red-500'
              }`}
            >
              {isCameraOn ? <VideoCamera size={24} /> : <VideoCameraSlash size={24} />}
            </button>
          )}
          <button
            type="button"
            onClick={() => void call.leaveCall()}
            aria-label="Leave call"
            className="flex h-14 w-16 items-center justify-center rounded-full bg-red-600 text-white"
          >
            <PhoneDisconnect size={26} weight="fill" />
          </button>
        </footer>
      </div>
    );
  }

  if (call.incomingCall) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-5 backdrop-blur-sm">
        <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#1c1c20] p-6 text-center shadow-2xl">
          <Avatar
            name={call.incomingCall.hostProfile.display_name}
            avatarUrl={call.incomingCall.hostProfile.avatar_url}
            color={call.incomingCall.hostProfile.color}
            size={72}
            className="mx-auto mb-4"
          />
          <h2 className="text-xl font-bold text-white">
            {call.incomingCall.hostProfile.display_name} is calling
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            {call.incomingCall.kind === 'video' ? 'Video call' : 'Voice call'} · up to 6 people
          </p>
          {call.callError && <p className="mt-3 text-sm text-red-300">{call.callError}</p>}
          <div className="mt-6 flex justify-center gap-5">
            <button
              type="button"
              onClick={call.declineCall}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600"
              aria-label="Decline call"
            >
              <PhoneDisconnect size={24} weight="fill" />
            </button>
            <button
              type="button"
              onClick={() => void call.acceptCall()}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500"
              aria-label="Accept call"
            >
              <Phone size={24} weight="fill" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (call.callError) {
    return (
      <div className="fixed bottom-5 left-4 right-4 z-[100] mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl border border-red-400/20 bg-[#202024]/95 px-4 py-3 text-sm text-red-200 shadow-xl backdrop-blur-xl">
        <span>{call.callError}</span>
        <button
          type="button"
          onClick={call.clearCallError}
          className="shrink-0 font-semibold text-white"
          aria-label="Dismiss call error"
        >
          Dismiss
        </button>
      </div>
    );
  }

  return null;
};
