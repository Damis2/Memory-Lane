import { spawn } from "child_process";
import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args);
    const chunks = [];
    let stderr = "";
    proc.stdout.on("data", (d) => chunks.push(d));
    proc.stderr.on("data", (d) => {
      stderr += d;
    });
    proc.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(stderr.slice(0, 500) || `${cmd} exited with code ${code}`));
    });
    proc.on("error", reject);
  });
}

// Grabs a single frame to use as the thumbnail/poster image. Tries 1
// second in (skips solid-color intros on some phone videos); falls back
// to the very first frame for clips shorter than that.
export async function extractVideoFrame(inputPath) {
  const buildArgs = (seek) => [
    "-ss", String(seek),
    "-i", inputPath,
    "-frames:v", "1",
    "-vf", "scale=480:-1",
    "-f", "image2pipe",
    "-vcodec", "mjpeg",
    "pipe:1",
  ];
  try {
    return await run(ffmpegPath, buildArgs(1));
  } catch {
    return run(ffmpegPath, buildArgs(0));
  }
}

export async function getVideoDurationSeconds(inputPath) {
  try {
    const out = await run(ffprobeStatic.path, [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      inputPath,
    ]);
    const seconds = parseFloat(out.toString().trim());
    return Number.isFinite(seconds) ? Math.round(seconds) : null;
  } catch {
    return null;
  }
}
