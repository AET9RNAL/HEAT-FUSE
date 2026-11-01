/**
 * The stage tour: its steps, when it starts, and the DEMO overlay it teaches with.
 * The App keeps "seen". The runtime relays it as `stageSettings.tour`.
 */
import { computed, ref, watch } from "vue";
import { useI18n } from "../composables/useI18n";
import { cancelFtue, ftue, startFtue, type FtueStep, type FtueTour } from "../directives/vFtue";
import {
  connected,
  formatCombo,
  hostHotkeys,
  hostState,
  isObsMode,
  localOverlayIds,
  localPlugins,
  overlays,
  primaryDisplay,
  sendStageTourDone,
  stagePlugins,
  stageSettings,
} from "./overlayClient";
import { clearSelection, pluginListOpen, selectOverlay, selectedId } from "./stageState";
import type { HostState, OverlayDescriptor, StagePlugin } from "./types";

// "__" keeps the ids clear of real plugin ids.
export const DEMO_PLUGIN_ID = "__demo";
export const DEMO_OVERLAY_ID = "__demo:DEMO";
const DEMO_SIZE = { w: 320, h: 180 };

/** The DEMO overlay's click counter. It resets at each tour. */
export const demoCount = ref(0);

interface StageStep extends Omit<FtueStep, "title" | "body" | "sample"> {
  key: string;
  /** Host states the step accepts. A switch to any other state cancels the tour. Default: calibrate. */
  states?: HostState[];
  /** The step shows the DEMO overlay, so the card marks it. */
  demo?: boolean;
  /** The step needs Ctrl+I, which does nothing while a plugin is in setup calibration. */
  modeSwitch?: boolean;
}

const selectDemo = (): void => selectOverlay(DEMO_OVERLAY_ID);
const openList = (): void => { pluginListOpen.value = true; };
const closeList = (): void => { pluginListOpen.value = false; };

// A stage with no overlay plugins locks at launch. A locked stage takes no input, so this prompt waits for the hotkey.
// It keeps the game clear, because the user may be playing.
const UNLOCK: StageStep = {
  key: "unlock",
  dim: false,
  states: ["locked", "calibrate"],
  advanceWhen: () => hostState.value === "calibrate",
};

const STEPS: StageStep[] = [
  { key: "welcome", before: ensureDemo },
  { key: "overlay", target: "stage-overlay", side: "right", interactive: true, demo: true },
  { key: "info", target: "stage-overlay-info", side: "top", demo: true },
  { key: "perms", target: "stage-perms", side: "top", interactive: true, demo: true },
  { key: "inspector", target: "stage-inspector", side: "left", demo: true, before: selectDemo },
  { key: "toolbar", target: "stage-toolbar", side: "top", before: closeList },
  { key: "plugins", target: "stage-plugins", side: "right", before: openList },
  { key: "done", target: "stage-done", side: "top", align: "end", before: closeList },
  {
    key: "interactive",
    target: "stage-overlay",
    side: "right",
    demo: true,
    modeSwitch: true,
    states: ["calibrate", "interactive"],
    advanceWhen: () => hostState.value === "interactive",
  },
  {
    key: "click",
    target: "stage-demo-count",
    side: "right",
    demo: true,
    modeSwitch: true,
    interactive: true,
    noBack: true,
    // Ctrl+L from interactive goes to calibrate, and the next step then moves on by itself.
    states: ["interactive", "locked", "calibrate"],
  },
  {
    key: "leave",
    modeSwitch: true,
    noBack: true,
    states: ["interactive", "locked", "calibrate"],
    advanceWhen: () => hostState.value === "calibrate",
  },
  { key: "help", target: "stage-help", side: "top", align: "end", noBack: true },
];

function demoOverlay(): OverlayDescriptor {
  const d = primaryDisplay.value ?? { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
  return {
    overlayId: DEMO_OVERLAY_ID,
    pluginId: DEMO_PLUGIN_ID,
    kind: "demo",
    assetUrl: "",
    size: { ...DEMO_SIZE },
    artboard: null,
    stateMachine: null,
    viewModel: null,
    rect: {
      x: Math.round(d.x + (d.w - DEMO_SIZE.w) / 2),
      y: Math.round(d.y + (d.h - DEMO_SIZE.h) / 2),
      w: DEMO_SIZE.w,
      h: DEMO_SIZE.h,
    },
    visible: true,
    interactive: true,
    inputs: {},
  };
}

// Labels and descriptions match runtime/src/host/permissions.ts. Not editable, so no consent request goes out.
function demoPlugin(): StagePlugin {
  const { t } = useI18n();
  return {
    plugin_id: DEMO_PLUGIN_ID,
    name: t("stagetour.demo.name"),
    version: "1.0.0",
    status: "active",
    is_core: false,
    requires_calibration: false,
    calibration_stages: 1,
    current_stage: 0,
    state: "calibrate",
    in_setup: false,
    overlay_ids: [DEMO_OVERLAY_ID],
    permissions: [
      {
        id: "network",
        label: "Networking",
        description: "Connect to the internet and to local services on this PC.",
        level: "dangerous",
        icon: "cloud",
        state: "prompt",
        reason: t("stagetour.demo.networkReason"),
        editable: false,
      },
      {
        id: "storage",
        label: "Local storage",
        description: "Keep its own data on this PC.",
        level: "normal",
        icon: "folder",
        state: "granted",
        reason: t("stagetour.demo.storageReason"),
        editable: false,
      },
    ],
  };
}

/** Adds the DEMO frame once per tour, after the unlock, so it never sits over a locked game. */
function ensureDemo(): void {
  if (overlays.has(DEMO_OVERLAY_ID)) return;
  localOverlayIds.add(DEMO_OVERLAY_ID);
  overlays.set(DEMO_OVERLAY_ID, demoOverlay());
  localPlugins.value = [demoPlugin()];
}

function removeDemo(): void {
  if (selectedId.value === DEMO_OVERLAY_ID) clearSelection();
  overlays.delete(DEMO_OVERLAY_ID);
  localOverlayIds.delete(DEMO_OVERLAY_ID);
  localPlugins.value = [];
  pluginListOpen.value = false;
}

/** The steps of the tour that runs now. */
let activeSteps: StageStep[] = [];

function build(steps: StageStep[], t: (key: string, params?: Record<string, string>) => string): FtueTour {
  const keys = { lock: formatCombo(hostHotkeys.lock), interactive: formatCombo(hostHotkeys.interactive) };
  return {
    id: "stage-intro",
    steps: steps.map(({ key, states: _states, demo, modeSwitch: _modeSwitch, ...step }) => ({
      ...step,
      title: t(`stagetour.${key}.title`, keys),
      body: t(`stagetour.${key}.body`, keys),
      sample: demo,
    })),
  };
}

/** True from a finished tour until the runtime confirms the App's "seen", so the tour does not start again. */
const awaitingSeen = ref(false);

// The engine clears ftue.tour before this run's clean-up. Without this flag, the start watcher sees no tour and starts a new one.
const running = ref(false);

async function runStageTour(): Promise<void> {
  if (ftue.tour || running.value || isObsMode()) return;
  running.value = true;
  try {
    const { t } = useI18n();
    demoCount.value = 0;
    // Ctrl+I does nothing during setup calibration, so those steps cannot finish.
    const canSwitch = !stagePlugins.value.some((p) => p.in_setup);
    const steps = STEPS.filter((s) => canSwitch || !s.modeSwitch);
    activeSteps = hostState.value === "locked" ? [UNLOCK, ...steps] : steps;
    const result = await startFtue(build(activeSteps, t));
    activeSteps = [];
    removeDemo();
    if (result === "cancelled") return;
    if (stageSettings.tour) awaitingSeen.value = true;
    sendStageTourDone();
  } finally {
    running.value = false;
  }
}

/** The toolbar help button: the tour starts at once, with no "seen" check. */
export function replayStageTour(): void {
  void runStageTour();
}

let started = false;

/** Call once from the stage app. */
export function initStageTour(): void {
  if (started) return;
  started = true;

  const shouldStart = computed(
    () =>
      !isObsMode() &&
      connected.value &&
      stageSettings.tour &&
      !awaitingSeen.value &&
      (hostState.value === "calibrate" || hostState.value === "locked") &&
      !ftue.tour &&
      !running.value,
  );
  watch(shouldStart, (go) => { if (go) void runStageTour(); }, { immediate: true });

  watch(() => stageSettings.tour, (show) => { if (!show) awaitingSeen.value = false; });

  watch(hostState, (state) => {
    const step = activeSteps[ftue.index];
    if (!ftue.tour || !step) return;
    if (!(step.states ?? ["calibrate"]).includes(state)) cancelFtue();
  });

  watch(connected, (isConnected) => { if (!isConnected) cancelFtue(); });
}
