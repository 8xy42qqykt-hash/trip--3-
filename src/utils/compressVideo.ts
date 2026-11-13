import coreURL from '@ffmpeg/core?url';
import wasmURL from '@ffmpeg/core/wasm?url';

export const MAX_VIDEO_UPLOAD_BYTES = 50 * 1024 * 1024;
const TARGET_VIDEO_BYTES = 47 * 1024 * 1024;

let ffmpegPromise: Promise<import('@ffmpeg/ffmpeg').FFmpeg> | null = null;

const loadFFmpeg = async () => {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const { FFmpeg } = await import('@ffmpeg/ffmpeg');
      const ffmpeg = new FFmpeg();
      await ffmpeg.load({ coreURL, wasmURL });
      return ffmpeg;
    })().catch((error: unknown) => {
      ffmpegPromise = null;
      throw error;
    });
  }
  return ffmpegPromise;
};

const getVideoMetadata = (file: File): Promise<{ duration: number; width: number; height: number }> => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'metadata';
  video.onloadedmetadata = () => {
    URL.revokeObjectURL(url);
    if (Number.isFinite(video.duration) && video.duration > 0) {
      resolve({ duration: video.duration, width: video.videoWidth, height: video.videoHeight });
    } else {
      reject(new Error('Could not read the video duration.'));
    }
  };
  video.onerror = () => {
    URL.revokeObjectURL(url);
    reject(new Error('Could not read the selected video.'));
  };
  video.src = url;
});

export async function compressVideo(file: File): Promise<File> {
  const { duration, width, height } = await getVideoMetadata(file);
  const ffmpeg = await loadFFmpeg();
  const inputExtension = file.name.split('.').pop()?.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'video';
  const inputPath = `input.${inputExtension}`;
  const outputPath = 'compressed.mp4';

  try {
    await ffmpeg.writeFile(inputPath, new Uint8Array(await file.arrayBuffer()));
    const targetTotalBitrate = Math.floor((TARGET_VIDEO_BYTES * 8) / duration);
    const audioBitrate = Math.min(96_000, Math.max(16_000, Math.floor(targetTotalBitrate * 0.35)));
    const targetBitrate = Math.max(16_000, targetTotalBitrate - audioBitrate);
    const maxDimension = targetBitrate < 900_000
      ? 960
      : targetBitrate < 1_800_000 ? 1280
        : targetBitrate < 5_000_000 ? 1920 : Math.max(width, height);
    const scaleFilter = Math.max(width, height) > maxDimension
      ? `scale=w='min(${maxDimension},iw)':h='min(${maxDimension},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2`
      : null;

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const videoBitrate = Math.floor(targetBitrate * (0.78 ** attempt));
      const args = [
        '-i', inputPath,
        '-map', '0:v:0',
        '-map', '0:a:0?',
        ...(scaleFilter ? ['-vf', scaleFilter] : []),
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-b:v', String(videoBitrate),
        '-maxrate', String(videoBitrate),
        '-bufsize', String(videoBitrate * 2),
        '-c:a', 'aac',
        '-b:a', String(audioBitrate),
        '-movflags', '+faststart',
        '-y', outputPath,
      ];
      await ffmpeg.exec(args);

      const output = await ffmpeg.readFile(outputPath);
      if (typeof output === 'string') throw new Error('Video compression returned invalid data.');
      if (output.byteLength <= MAX_VIDEO_UPLOAD_BYTES) {
        const outputBuffer = new ArrayBuffer(output.byteLength);
        new Uint8Array(outputBuffer).set(output);
        return new File([outputBuffer], `${file.name.replace(/\.[^.]+$/, '') || 'video'}.mp4`, {
          type: 'video/mp4',
          lastModified: Date.now(),
        });
      }
      await ffmpeg.deleteFile(outputPath);
    }

    throw new Error('The compressed video is still larger than 50 MB. Choose a shorter video.');
  } finally {
    for (const path of [inputPath, outputPath]) {
      try {
        await ffmpeg.deleteFile(path);
      } catch (error) {
        console.warn(`Could not clean up temporary video file ${path}:`, error);
      }
    }
  }
}
