import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
import { useLanguage } from '../../context/LanguageContext';

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
  local?: boolean;
  spotlight?: boolean;
  onClick?: () => void;
}> = ({ profile, stream, muted = false, audioOnly, local = false, spotlight = false, onClick }) => {
  const { t } = useLanguage();
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
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (onClick && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          onClick();
        }
      }}
      aria-label={`${t(spotlight ? 'Return to call grid from' : 'Spotlight')}: ${profile.display_name}`}
      className={`relative min-w-0 overflow-hidden rounded-2xl bg-[#1c1c20] text-left transition-[flex-basis,transform] duration-300 ease-out ${
        audioOnly ? 'aspect-square' : 'aspect-video'
      }`}
      style={{
        aspectRatio: audioOnly
          ? '1 / 1'
          : stream?.getVideoTracks()[0]?.getSettings().aspectRatio || '16 / 9',
      }}
    >
      {stream && !audioOnly ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted}
          className={`absolute inset-0 h-full w-full bg-black object-contain ${local ? 'scale-x-[-1]' : ''}`}
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
          onClick={(event) => {
            event.stopPropagation();
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
          {t('Tap to enable')} {t(audioOnly ? 'audio' : 'video')}
        </button>
      )}
      <div className={`${stream && !audioOnly ? 'hidden' : 'flex'} absolute inset-0 items-center justify-center`}>
        <Avatar
          name={profile.display_name}
          avatarUrl={profile.avatar_url}
          color={profile.color}
          size={spotlight ? 88 : 64}
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
  const { t } = useLanguage();
  const [isMicrophoneOn, setIsMicrophoneOn] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [spotlightId, setSpotlightId] = useState<string | null>(null);

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
    const spotlight = tiles.find(({ participant }) => participant.userId === spotlightId);
    const columnLimit = window.innerWidth < 640 ? 2 : 3;
    const columns = Math.min(columnLimit, Math.max(1, Math.ceil(Math.sqrt(tiles.length))));

    return createPortal((
      <section className="fixed inset-0 z-[9990] flex h-[100dvh] w-screen flex-col overflow-hidden bg-black text-white">
        <header
          className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-4 pb-4"
          style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)' }}
        >
          <div>
            <div className="text-base font-bold">
              {call.activeCall.kind === 'video' ? 'Video call' : 'Voice call'}
            </div>
            <div className="text-xs text-slate-400">
              {formatDuration(elapsedSeconds)} · {call.participants.map((member) => member.profile.display_name).join(', ')}
            </div>
          </div>
        </header>

        {call.callError && (
          <div className="mb-3 flex items-center justify-between rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-200">
            <span>{call.callError}</span>
            <button type="button" onClick={call.clearCallError} aria-label={t('Dismiss call error')}>×</button>
          </div>
        )}

        <main className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto px-3 py-4">
          {spotlight ? (
            <div className="mx-auto w-full max-w-5xl space-y-3">
              <VideoTile
                profile={spotlight.participant.profile}
                stream={spotlight.stream}
                muted={spotlight.muted}
                local={spotlight.participant.userId === userId}
                audioOnly={call.activeCall.kind === 'audio'}
                spotlight
                onClick={() => setSpotlightId(null)}
              />
              <div className="flex gap-2 overflow-x-auto pb-1">
                {tiles.filter(({ participant }) => participant.userId !== spotlightId).map(({ participant, stream, muted }) => (
                  <div key={participant.userId} className="w-28 shrink-0">
                    <VideoTile
                      profile={participant.profile}
                      stream={stream}
                      muted={muted}
                      local={participant.userId === userId}
                      audioOnly={call.activeCall!.kind === 'audio'}
                      onClick={() => setSpotlightId(participant.userId)}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div
              className="mx-auto grid w-full max-w-6xl content-center justify-items-center gap-3"
              style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
            >
              {tiles.map(({ participant, stream, muted }) => (
                <div
                  key={participant.userId}
                  className="w-full min-w-0 max-w-2xl transition-[width,transform] duration-300 ease-out"
                >
                  <VideoTile
                    profile={participant.profile}
                    stream={stream}
                    muted={muted}
                    local={participant.userId === userId}
                    audioOnly={call.activeCall!.kind === 'audio'}
                    onClick={() => setSpotlightId((current) => current === participant.userId ? null : participant.userId)}
                  />
                </div>
              ))}
            </div>
          )}
          {others.length === 0 && (
            <div className="py-2 text-center text-xs text-slate-400">{t('Waiting for others to join…')}</div>
          )}
        </main>

        <footer
          className="flex shrink-0 items-center justify-center gap-4 border-t border-white/10 px-4 pt-4"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)' }}
        >
          <button
            type="button"
            onClick={() => setIsMicrophoneOn(call.toggleMicrophone())}
            aria-label={t(isMicrophoneOn ? 'Mute microphone' : 'Unmute microphone')}
            className={`flex h-11 w-11 items-center justify-center rounded-full ${
              isMicrophoneOn ? 'bg-white/15' : 'bg-red-500'
            }`}
          >
            {isMicrophoneOn ? <Microphone size={24} /> : <MicrophoneSlash size={24} />}
          </button>
          {call.activeCall.kind === 'video' && (
            <button
              type="button"
              onClick={() => setIsCameraOn(call.toggleCamera())}
              aria-label={t(isCameraOn ? 'Turn camera off' : 'Turn camera on')}
              className={`flex h-11 w-11 items-center justify-center rounded-full ${
                isCameraOn ? 'bg-white/15' : 'bg-red-500'
              }`}
            >
              {isCameraOn ? <VideoCamera size={24} /> : <VideoCameraSlash size={24} />}
            </button>
          )}
          <button
            type="button"
            onClick={() => void call.leaveCall()}
            aria-label={t('Leave call')}
            className="flex h-11 w-14 items-center justify-center rounded-full bg-red-600 text-white"
          >
            <PhoneDisconnect size={26} weight="fill" />
          </button>
        </footer>
      </section>
    ), document.body);
  }

  if (call.incomingCall) {
    return createPortal((
      <section
        className="fixed inset-0 z-[9990] flex h-[100dvh] w-screen flex-col items-center justify-center bg-black px-6 text-center text-white"
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <Avatar
          name={call.incomingCall.hostProfile.display_name}
          avatarUrl={call.incomingCall.hostProfile.avatar_url}
          color={call.incomingCall.hostProfile.color}
          size={88}
          className="mb-5"
        />
        <h2 className="text-2xl font-bold text-white">
          {call.incomingCall.hostProfile.display_name} {t('is calling')}
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          {t(call.incomingCall.kind === 'video' ? 'Video call' : 'Voice call')} · {t('up to 6 people')}
        </p>
        {call.callError && <p className="mt-3 text-sm text-red-300">{call.callError}</p>}
        <div className="mt-8 flex justify-center gap-6">
          <button
            type="button"
            onClick={call.declineCall}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600"
            aria-label={t('Decline call')}
          >
            <PhoneDisconnect size={28} weight="fill" />
          </button>
          <button
            type="button"
            onClick={() => void call.acceptCall()}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500"
            aria-label={t('Accept call')}
          >
            <Phone size={28} weight="fill" />
          </button>
        </div>
      </section>
    ), document.body);
  }

  return null;
};
