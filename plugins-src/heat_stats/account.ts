/**
 * The HEAT Stats account: sign-in, sign-up, recovery, Discord, and local-only mode.
 */
import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import type { FuseContext } from "@fuse/plugin-sdk";
import { createHeatStatsClient } from "./supabase.js";

/** Where the service returns the browser. The host routes it to this plugin by id. */
const CALLBACK_URL = "fuse://plugin/heat_stats/auth";

/**
 * local: no account, everything stays on this PC.
 * awaitingCode: signed up, waiting for the emailed confirmation code.
 * awaitingReset: asked for a password reset, waiting for the emailed code.
 * recovering: the code checked out, and the new password is next.
 */
export type AccountState = "signedOut" | "local" | "signedIn" | "awaitingCode" | "awaitingReset" | "recovering";

/** What the window is allowed to know. No tokens, ever. */
export interface AccountView {
  state: AccountState;
  email: string | null;
  userId: string | null;
  busy: boolean;
  error: string | null;
}

export interface AccountHooks {
  onChange(view: AccountView): void;
  /** Signed in, or signed out: the sync engine starts and stops on this. */
  onSession(session: Session | null): void;
}

function readable(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "That email and password don't match.";
  if (m.includes("email not confirmed")) return "Confirm your email first - check your inbox.";
  if (m.includes("user already registered")) return "There's already an account with that email.";
  if (m.includes("token has expired") || m.includes("expired")) return "That code has expired. Ask for a new one.";
  if (m.includes("rate limit") || m.includes("too many")) return "Too many attempts. Wait a minute and try again.";
  if (m.includes("network") || m.includes("fetch")) return "Couldn't reach HEAT Stats. Check your connection.";
  return message;
}

export class Account {
  private readonly client: SupabaseClient;
  private state: AccountState = "signedOut";
  private user: User | null = null;
  private busy = false;
  private error: string | null = null;
  /** False until the first auth event lands, so the first adopt always starts the engines. */
  private adopted = false;
  /** The email a sign-up or recovery is waiting on, so the window can show it. */
  private pending: string | null = null;

  constructor(
    private readonly ctx: FuseContext,
    private readonly hooks: AccountHooks,
  ) {
    this.client = createHeatStatsClient(ctx);
  }

  /** Restores a stored session, or else the choice the player made last time. */
  async start(): Promise<void> {
    this.client.auth.onAuthStateChange((_event, session) => this.adopt(session));
    this.ctx.links.onCallback((url) => void this.onCallback(url));

    const { data } = await this.client.auth.getSession();
    if (data.session) {
      this.adopt(data.session);
      return;
    }
    // don't ask again
    this.state = this.ctx.config.get("account_local", false) ? "local" : "signedOut";
    this.push();
  }

  get view(): AccountView {
    return {
      state: this.state,
      email: this.user?.email ?? this.pending,
      userId: this.user?.id ?? null,
      busy: this.busy,
      error: this.error,
    };
  }

  private push(): void {
    this.hooks.onChange(this.view);
  }

  /**
   * supabase-js reports more than sign-in and sign-out: a rotated token, a new password and a
   * restored session all arrive here. Only a change of account restarts sync, because the rest
   * would read the whole history again for nothing.
   */
  private adopt(session: Session | null): void {
    const sameUser = this.adopted && (session?.user.id ?? null) === (this.user?.id ?? null);
    this.adopted = true;
    this.user = session?.user ?? null;
    this.state = session ? "signedIn" : this.ctx.config.get("account_local", false) ? "local" : "signedOut";
    if (session) {
      this.pending = null;
      this.error = null;
    }
    this.push();
    if (!sameUser) this.hooks.onSession(session);
  }

  /** Every call routes through here so busy and error handling stay uniform. */
  private async attempt(what: string, run: () => Promise<void>): Promise<boolean> {
    if (this.busy) return false;
    this.busy = true;
    this.error = null;
    this.push();
    try {
      await run();
      return true;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.error = readable(message);
      this.ctx.logger.warning(`heat_stats: ${what} failed: ${message}`);
      return false;
    } finally {
      this.busy = false;
      this.push();
    }
  }

  async signIn(email: string, password: string): Promise<boolean> {
    return this.attempt("sign in", async () => {
      const { error } = await this.client.auth.signInWithPassword({ email, password });
      if (error) throw error;
    });
  }

  async signUp(email: string, password: string): Promise<boolean> {
    return this.attempt("sign up", async () => {
      const { data, error } = await this.client.auth.signUp({ email, password });
      if (error) throw error;
      // Supabase returns an existing address with no identities
      if (data.user && data.user.identities?.length === 0) {
        throw new Error("There's already an account with that email.");
      }
      this.pending = email;
      this.state = "awaitingCode";
    });
  }

  async confirm(code: string): Promise<boolean> {
    const email = this.pending;
    if (!email) return false;
    return this.attempt("confirm email", async () => {
      const { error } = await this.client.auth.verifyOtp({ email, token: code, type: "signup" });
      if (error) throw error;
    });
  }

  async resendCode(): Promise<boolean> {
    const email = this.pending;
    if (!email) return false;
    return this.attempt("resend code", async () => {
      const { error } = await this.client.auth.resend({ email, type: "signup" });
      if (error) throw error;
    });
  }

  /** Emails a recovery code. `confirmRecovery` takes it. */
  async recover(email: string): Promise<boolean> {
    return this.attempt("password recovery", async () => {
      const { error } = await this.client.auth.resetPasswordForEmail(email);
      if (error) throw error;
      this.pending = email;
      this.state = "awaitingReset";
    });
  }

  /** A correct code signs the player in, which is what `setPassword` needs. */
  async confirmRecovery(code: string): Promise<boolean> {
    const email = this.pending;
    if (!email) return false;
    return this.attempt("confirm recovery code", async () => {
      const { error } = await this.client.auth.verifyOtp({ email, token: code, type: "recovery" });
      if (error) throw error;
      // The sign-in sets "signedIn", and the new password is still due.
      this.state = "recovering";
    });
  }

  /** Leaves the code screen, for a player who mistyped the email. */
  cancelRecovery(): void {
    if (this.state !== "awaitingReset") return;
    this.pending = null;
    this.error = null;
    this.state = this.ctx.config.get("account_local", false) ? "local" : "signedOut";
    this.push();
  }

  /** `resend` has no recovery type, so a second request carries the new code. */
  async resendRecovery(): Promise<boolean> {
    const email = this.pending;
    if (!email) return false;
    return this.attempt("resend recovery code", async () => {
      const { error } = await this.client.auth.resetPasswordForEmail(email);
      if (error) throw error;
    });
  }

  /** Works only while a recovery code or link holds the session. */
  async setPassword(password: string): Promise<boolean> {
    return this.attempt("set password", async () => {
      const { error } = await this.client.auth.updateUser({ password });
      if (error) throw error;
      // updateUser raises no auth event, so the state moves on here.
      if (this.user) this.state = "signedIn";
    });
  }

  /** Opens Discord in the browser. The code returns to the callback, and only this module holds its verifier. */
  async signInWithDiscord(): Promise<boolean> {
    return this.attempt("Discord sign in", async () => {
      const { data, error } = await this.client.auth.signInWithOAuth({
        provider: "discord",
        options: { redirectTo: CALLBACK_URL, skipBrowserRedirect: true },
      });
      if (error) throw error;
      if (!data.url) throw new Error("Discord sign-in is unavailable right now.");
      // The host opens a link only just after a button press in the window.
      const opened = await this.ctx.links.open(data.url);
      if (!opened) throw new Error("Couldn't open your browser. Try again from the window.");
    });
  }

  /** Any `fuse://plugin/heat_stats/...` link opened on this PC lands here. */
  private async onCallback(url: string): Promise<void> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return;
    }

    const params = new URLSearchParams(parsed.search || parsed.hash.replace(/^#/, ""));
    const failure = params.get("error_description") ?? params.get("error");
    if (failure) {
      this.error = readable(decodeURIComponent(failure.replace(/\+/g, " ")));
      this.push();
      return;
    }
    const code = params.get("code");
    if (!code) return;

    const recovering = params.get("type") === "recovery";
    await this.attempt("sign in", async () => {
      const { error } = await this.client.auth.exchangeCodeForSession(code);
      if (error) throw error;
      if (recovering) this.state = "recovering";
    });
  }

  /** No account: matches stay on this PC until they choose otherwise. */
  useLocal(): void {
    this.ctx.config.set("account_local", true);
    this.state = "local";
    this.error = null;
    this.push();
  }

  /** Leaves local mode and asks to sign in. Nothing local is deleted. */
  leaveLocal(): void {
    this.ctx.config.set("account_local", false);
    if (this.state === "local") this.state = "signedOut";
    this.push();
  }

  async signOut(): Promise<boolean> {
    return this.attempt("sign out", async () => {
      const { error } = await this.client.auth.signOut();
      if (error) throw error;
      this.ctx.config.set("account_local", false);
    });
  }

  /** Removes the account and everything attached to it, on the service's side. */
  async deleteAccount(): Promise<boolean> {
    return this.attempt("delete account", async () => {
      const { error } = await this.client.functions.invoke("delete-account", { method: "POST" });
      if (error) throw error;
      await this.client.auth.signOut();
    });
  }

  /** For the sync engine: uploads and profile reads go through this. */
  get api(): SupabaseClient {
    return this.client;
  }

  dismissError(): void {
    if (!this.error) return;
    this.error = null;
    this.push();
  }
}
