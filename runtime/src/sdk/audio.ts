/**
 * Plugin audio: sounds from a plugin's own assets, played on the stage window.
 * OBS browser sources stay silent - OBS already captures desktop audio.
 */

export interface PlayOptions {
  /** 0..1, scaled by the user's master volume. Defaults to 1. */
  volume?: number;
  loop?: boolean;
  /** Playback speed, 0.25..4. Defaults to 1. */
  rate?: number;
}

export interface PluginAudio {
  /** Fetch and decode ahead of time, so the first `play` starts without a delay. */
  preload(assets: string[]): void;
  /** Play an `.mp3` / `.wav` / `.ogg` from the plugin's assets. Returns an id for `stop`, or "" when refused. */
  play(asset: string, opts?: PlayOptions): string;
  stop(id: string): void;
  stopAll(): void;
}
