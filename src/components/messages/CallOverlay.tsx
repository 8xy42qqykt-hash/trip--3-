import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
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

function getTileAspectRatio(stream: MediaStream | null, audioOnly: boolean, cameraEnabled: boolean) {
  if (audioOnly || !cameraEnabled) return 1;
  const aspectRatio = stream?.getVideoTracks()[0]?.getSettings().aspectRatio;
  return typeof aspectRatio === 'number' && Number.isFinite(aspectRatio) && aspectRatio > 0
    ? aspectRatio
    : 16 / 9;
}

function getOptimalGridLayout(aspectRatios: number[], width: number, height: number) {
  const gap = 12;
  let bestLayout = { columns: 1, tileWidth: 0, area: 0 };

  for (let columns = 1; columns <= aspectRatios.length; columns += 1) {
    const rows = Math.ceil(aspectRatios.length / columns);
    let rowHeightFactor = 0;
    for (let row = 0; row < rows; row += 1) {
      const ratiosInRow = aspectRatios.slice(row * columns, (row + 1) * columns);
      rowHeightFactor += Math.max(...ratiosInRow.map((ratio) => 1 / ratio));
    }

    const widthLimited = (width - gap * (columns - 1)) / columns;
    const heightLimited = (height - gap * (rows - 1)) / rowHeightFactor;
    const tileWidth = Math.max(0, Math.min(widthLimited, heightLimited));
    const area = tileWidth ** 2 * aspectRatios.reduce((sum, ratio) => sum + 1 / ratio, 0);
    if (area > bestLayout.area) bestLayout = { columns, tileWidth, area };
  }

  return { columns: bestLayout.columns, tileWidth: bestLayout.tileWidth, gap };
}

const VideoTile: React.FC<{
  profile: CallParticipant['profile'];
  stream: MediaStream | null;
  playbackMuted: boolean;
  microphoneMuted: boolean;
  cameraEnabled: boolean;
  aspectRatio: number;
  audioOnly: boolean;
  local?: boolean;
  spotlight?: boolean;
  onClick?: () => void;
}> = ({
  profile,
  stream,
  playbackMuted,
  microphoneMuted,
  cameraEnabled,
  aspectRatio,
  audioOnly,
  local = false,
  spotlight = false,
  onClick,
}) => {
  const { t } = useLanguage();
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [needsPlaybackTap, setNeedsPlaybackTap] = useState(false);
  const videoEnabled = !audioOnly && cameraEnabled;

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
      className="relative w-full min-w-0 overflow-hidden rounded-2xl bg-[#1c1c20] text-left"
      style={{
        aspectRatio: audioOnly || !cameraEnabled
          ? '1 / 1'
          : aspectRatio,
      }}
    >
      {stream && !audioOnly ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={playbackMuted}
          className={`absolute inset-0 h-full w-full bg-black object-contain ${local ? 'scale-x-[-1]' : ''} ${
            videoEnabled ? '' : 'opacity-0'
          }`}
        />
      ) : stream ? (
        <audio
          ref={audioRef}
          autoPlay
          muted={playbackMuted}
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
      <div className={`${stream && videoEnabled ? 'hidden' : 'flex'} absolute inset-0 items-center justify-center`}>
        <Avatar
          name={profile.display_name}
          avatarUrl={profile.avatar_url}
          color={profile.color}
          size={spotlight ? 88 : 64}
        />
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-3 pb-3 pt-8">
        <span className="text-sm font-semibold text-white">{profile.display_name}</span>
        {microphoneMuted && <MicrophoneSlash size={15} className="ml-2 inline text-white/80" />}
      </div>
    </div>
  );
};

export const CallOverlay: React.FC<CallOverlayProps> = ({ call, userId }) => {
  const { t } = useLanguage();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [spotlightId, setSpotlightId] = useState<string | null>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const stageRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!call.activeCall) {
      setElapsedSeconds(0);
      return;
    }
    const updateDuration = () => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - call.activeCall!.startedAt) / 1000)));
    };
    updateDuration();
    const timer = window.setInterval(updateDuration, 1000);
    return () => window.clearInterval(timer);
  }, [call.activeCall]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const updateSize = () => setStageSize({ width: stage.clientWidth, height: stage.clientHeight });
    const observer = new ResizeObserver(updateSize);
    observer.observe(stage);
    updateSize();
    return () => observer.disconnect();
  }, [call.activeCall?.callId]);

  useEffect(() => {
    setSpotlightId(null);
  }, [call.activeCall?.callId]);

  if (call.activeCall) {
    const audioOnly = call.activeCall.kind === 'audio';
    const localParticipant = call.participants.find((member) => member.userId === userId);
    const others = call.participants.filter((member) => member.userId !== userId);
    const tiles = [
      ...(localParticipant
        ? [{
            participant: localParticipant,
            stream: call.localStream,
            playbackMuted: true,
            microphoneMuted: call.participantMediaStates[localParticipant.userId]?.microphoneMuted ?? false,
            cameraEnabled: !audioOnly
              && (call.participantMediaStates[localParticipant.userId]?.cameraEnabled ?? true),
          }]
        : []),
      ...others.map((participant) => ({
        participant,
        stream: call.remoteStreams[participant.userId] || null,
        playbackMuted: false,
        microphoneMuted: call.participantMediaStates[participant.userId]?.microphoneMuted ?? false,
        cameraEnabled: !audioOnly
          && (call.participantMediaStates[participant.userId]?.cameraEnabled ?? true),
      })),
    ].map((tile) => ({
      ...tile,
      aspectRatio: getTileAspectRatio(tile.stream, audioOnly, tile.cameraEnabled),
    }));
    const spotlight = tiles.find(({ participant }) => participant.userId === spotlightId);
    const stageWidth = Math.max(0, (stageSize.width || window.innerWidth) - 24);
    const stageHeight = Math.max(0, (stageSize.height || window.innerHeight * 0.68) - 16);
    const gridLayout = getOptimalGridLayout(
      tiles.map((tile) => tile.aspectRatio),
      stageWidth,
      stageHeight,
    );
    const spotlightOthers = tiles.filter(({ participant }) => participant.userId !== spotlightId);
    const thumbnailGap = 8;
    const thumbnailMaxHeight = Math.min(88, stageHeight * 0.22);
    const thumbnailWidth = spotlightOthers.length > 0
      ? Math.max(0, Math.min(
          (stageWidth - thumbnailGap * (spotlightOthers.length - 1)) / spotlightOthers.length,
          thumbnailMaxHeight * Math.min(...spotlightOthers.map((tile) => tile.aspectRatio)),
        ))
      : 0;
    const thumbnailHeight = spotlightOthers.length > 0
      ? Math.max(...spotlightOthers.map((tile) => thumbnailWidth / tile.aspectRatio))
      : 0;
    const spotlightWidth = spotlight
      ? Math.max(0, Math.min(
          stageWidth,
          (stageHeight - thumbnailHeight - (spotlightOthers.length > 0 ? 12 : 0)) * spotlight.aspectRatio,
        ))
      : 0;
    const localMediaState = userId ? call.participantMediaStates[userId] : undefined;
    const isMicrophoneOn = !(localMediaState?.microphoneMuted ?? false);
    const isCameraOn = localMediaState?.cameraEnabled ?? !audioOnly;
    const layoutTransition = { type: 'spring' as const, stiffness: 300, damping: 30 };

    return createPortal((
      <section className="fixed inset-0 z-[9990] flex h-[100dvh] w-screen flex-col overflow-hidden bg-black text-white">
        <header
          className="flex shrink-0 justify-center px-4 pb-2"
          style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)' }}
        >
          <div className="text-sm font-medium tabular-nums text-white/75">{formatDuration(elapsedSeconds)}</div>
        </header>

        {call.callError && (
          <div className="mx-3 mb-2 flex shrink-0 items-center justify-between rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-200">
            <span>{call.callError}</span>
            <button type="button" onClick={call.clearCallError} aria-label={t('Dismiss call error')}>×</button>
          </div>
        )}

        <main
          ref={stageRef}
          className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-3 py-2"
        >
          {spotlight ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3">
              <motion.div
                layout
                transition={{ layout: layoutTransition }}
                className="flex min-h-0 w-full flex-1 items-center justify-center"
              >
                <motion.div
                  layout
                  transition={{ layout: layoutTransition }}
                  style={{ width: spotlightWidth }}
                >
                  <VideoTile
                    profile={spotlight.participant.profile}
                    stream={spotlight.stream}
                    playbackMuted={spotlight.playbackMuted}
                    microphoneMuted={spotlight.microphoneMuted}
                    cameraEnabled={spotlight.cameraEnabled}
                    aspectRatio={spotlight.aspectRatio}
                    local={spotlight.participant.userId === userId}
                    audioOnly={audioOnly}
                    spotlight
                    onClick={() => setSpotlightId(null)}
                  />
                </motion.div>
              </motion.div>
              {spotlightOthers.length > 0 && (
                <motion.div
                  layout
                  transition={{ layout: layoutTransition }}
                  className="flex shrink-0 items-center justify-center"
                  style={{ gap: thumbnailGap }}
                >
                  <AnimatePresence initial={false}>
                    {spotlightOthers.map((tile) => (
                      <motion.div
                        key={tile.participant.userId}
                        layout
                        initial={{ opacity: 0, scale: 0.94 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.94 }}
                        transition={{ layout: layoutTransition, opacity: { duration: 0.18 } }}
                        style={{ width: thumbnailWidth }}
                      >
                        <VideoTile
                          profile={tile.participant.profile}
                          stream={tile.stream}
                          playbackMuted={tile.playbackMuted}
                          microphoneMuted={tile.microphoneMuted}
                          cameraEnabled={tile.cameraEnabled}
                          aspectRatio={tile.aspectRatio}
                          local={tile.participant.userId === userId}
                          audioOnly={audioOnly}
                          onClick={() => setSpotlightId(tile.participant.userId)}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </motion.div>
              )}
            </div>
          ) : (
            <motion.div
              layout
              transition={{ layout: layoutTransition }}
              className="grid content-center justify-items-center"
              style={{
                gridTemplateColumns: `repeat(${gridLayout.columns}, ${gridLayout.tileWidth}px)`,
                gap: gridLayout.gap,
              }}
            >
              <AnimatePresence initial={false}>
                {tiles.map((tile) => (
                  <motion.div
                    key={tile.participant.userId}
                    layout
                    initial={{ opacity: 0, scale: 0.94 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.94 }}
                    transition={{ layout: layoutTransition, opacity: { duration: 0.18 } }}
                    style={{ width: gridLayout.tileWidth }}
                  >
                    <VideoTile
                      profile={tile.participant.profile}
                      stream={tile.stream}
                      playbackMuted={tile.playbackMuted}
                      microphoneMuted={tile.microphoneMuted}
                      cameraEnabled={tile.cameraEnabled}
                      aspectRatio={tile.aspectRatio}
                      local={tile.participant.userId === userId}
                      audioOnly={audioOnly}
                      onClick={() => setSpotlightId((current) => (
                        current === tile.participant.userId ? null : tile.participant.userId
                      ))}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          )}
          {others.length === 0 && (
            <div className="absolute bottom-3 left-0 right-0 text-center text-xs text-slate-400">
              {t('Waiting for others to join…')}
            </div>
          )}
        </main>

        <footer
          className="flex shrink-0 items-center justify-center gap-4 px-4 pt-2"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <button
            type="button"
            onClick={call.toggleMicrophone}
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
              onClick={call.toggleCamera}
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
