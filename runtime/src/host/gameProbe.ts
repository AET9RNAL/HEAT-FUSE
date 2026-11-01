/**
 * Asks the game's CoHTML debugger whether it is listening.
 */
import { logger } from "../log.js";

const PROBE_TIMEOUT_MS = 2000;
const RETRY_MS = 5000;
const NOTICE_AFTER_MS = 15_000;

export interface GameProbeState {
  port: number;
  reachable: boolean;
  checkedAt: number;
}

export async function probePort(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export class GameProbe {
  private port: number;
  private gameRunning = false;
  private reachable = false;
  private checkedAt = 0;
  private closedSince = 0;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  /**
   * @param onChange Called when the reachable flag or the notice verdict changes.
   *                 `notice` is true while the game runs and the port stays closed.
   */
  constructor(
    port: number,
    private onChange: (state: GameProbeState, notice: boolean) => void,
  ) {
    this.port = port;
  }

  state(): GameProbeState {
    return { port: this.port, reachable: this.reachable, checkedAt: this.checkedAt };
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.schedule(0);
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  setPort(port: number): void {
    if (port === this.port) return;
    this.port = port;
    this.reachable = false;
    this.closedSince = 0;
    this.checkedAt = 0;
    if (this.running) this.schedule(0);
  }

  setGameRunning(running: boolean): void {
    if (running === this.gameRunning) return;
    this.gameRunning = running;
    if (!running) this.closedSince = 0;
    if (this.running) this.schedule(0);
  }

  recheck(): void {
    if (this.running) this.schedule(0);
  }

  private schedule(delay: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.run(), delay);
    this.timer.unref();
  }

  private async run(): Promise<void> {
    if (!this.running) return;
    const wasReachable = this.reachable;
    const ok = await probePort(this.port);
    if (!this.running) return;

    this.reachable = ok;
    this.checkedAt = Date.now();

    if (ok) {
      this.closedSince = 0;
    } else if (this.gameRunning && this.closedSince === 0) {
      this.closedSince = this.checkedAt;
    }

    const notice = !ok && this.gameRunning && this.closedSince > 0 && this.checkedAt - this.closedSince >= NOTICE_AFTER_MS;
    if (ok !== wasReachable) {
      logger.info(`Game CDP port ${this.port} is ${ok ? "open" : "closed"}`);
    }
    this.onChange(this.state(), notice);

    this.schedule(ok ? RETRY_MS * 4 : RETRY_MS);
  }
}
