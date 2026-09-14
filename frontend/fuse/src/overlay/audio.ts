/**
 * Plugin audio on the stage window. Each file is fetched and decoded once; every
 * play gets its own source + gain so sounds overlap, loop and stop by id, and a
 * master gain carries the user's volume and mute.
 */

export interface AudioPlay {
  id: string;
  /** Owning plugin, for stop-all. */
  source: string;
  url: string;
  volume: number;
  loop: boolean;
  rate: number;
}

interface Playing {
  node: AudioBufferSourceNode;
  source: string;
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let masterVolume = 1;
let masterMuted = false;
const buffers = new Map<string, Promise<AudioBuffer | null>>();
/** Plays waiting on their file; a stop that lands first removes them. */
const pending = new Map<string, string>();
const playing = new Map<string, Playing>();

/** Created on first use; the stage window allows autoplay, so it starts running. */
function graph(): { ctx: AudioContext; master: GainNode } {
  if (!ctx || !master) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = masterMuted ? 0 : masterVolume;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return { ctx, master };
}

function load(url: string): Promise<AudioBuffer | null> {
  let p = buffers.get(url);
  if (!p) {
    p = fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then((bytes) => graph().ctx.decodeAudioData(bytes))
      .catch((e: unknown) => {
        console.error(`[audio] ${url}:`, e);
        // Forget the failure so a later play can retry.
        buffers.delete(url);
        return null;
      });
    buffers.set(url, p);
  }
  return p;
}

export function preloadAudio(urls: string[]): void {
  for (const url of urls) void load(url);
}

export async function playAudio(play: AudioPlay): Promise<void> {
  pending.set(play.id, play.source);
  const buffer = await load(play.url);
  if (!pending.delete(play.id) || !buffer) return;

  const { ctx: ac, master: out } = graph();
  const node = ac.createBufferSource();
  node.buffer = buffer;
  node.loop = play.loop;
  node.playbackRate.value = play.rate;
  const gain = ac.createGain();
  gain.gain.value = play.volume;
  node.connect(gain).connect(out);
  node.onended = () => {
    if (playing.get(play.id)?.node === node) playing.delete(play.id);
  };
  playing.set(play.id, { node, source: play.source });
  node.start();
}

export function stopAudio(id: string): void {
  pending.delete(id);
  const p = playing.get(id);
  if (!p) return;
  playing.delete(id);
  try {
    p.node.stop();
  } catch {
    /* already ended */
  }
}

/** Every sound, or only one plugin's. */
export function stopAllAudio(source?: string): void {
  for (const [id, owner] of pending) if (!source || owner === source) pending.delete(id);
  for (const [id, p] of playing) if (!source || p.source === source) stopAudio(id);
}

export function setAudioMaster(volume: number, muted: boolean): void {
  masterVolume = Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 1;
  masterMuted = muted;
  // A short ramp, so a volume drag doesn't click.
  if (ctx && master) master.gain.setTargetAtTime(masterMuted ? 0 : masterVolume, ctx.currentTime, 0.02);
}
