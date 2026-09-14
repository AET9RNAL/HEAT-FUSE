import { inject, reactive, type Directive, type InjectionKey } from "vue";

const SHOW_DELAY = 420;
const GAP = 8;

export const tip = reactive({
  text: "",
  x: 0,
  y: 0,
  /** Placement relative to the anchor; flips up when the box would run off-screen. */
  below: true,
  visible: false,
});

let timer: number | null = null;

function clearTimer(): void {
  if (timer !== null) {
    window.clearTimeout(timer);
    timer = null;
  }
}

export function hideTip(): void {
  clearTimer();
  tip.visible = false;
}

function showFor(el: HTMLElement, text: string): void {
  const box = el.getBoundingClientRect();
  // Rough height guess - the box is one or two lines and only needs to pick a side.
  const below = box.bottom + GAP + 48 < window.innerHeight;
  tip.text = text;
  tip.below = below;
  tip.x = Math.round(box.left + box.width / 2);
  tip.y = Math.round(below ? box.bottom + GAP : box.top - GAP);
  tip.visible = true;
}

export const vTip: Directive<HTMLElement, string | undefined> = {
  mounted(el, binding) {
    const enter = (): void => {
      const text = el.dataset.tip ?? "";
      if (!text) return;
      clearTimer();
      timer = window.setTimeout(() => showFor(el, text), SHOW_DELAY);
    };
    const leave = (): void => hideTip();
    el.dataset.tip = binding.value ?? "";
    el.addEventListener("pointerenter", enter);
    el.addEventListener("pointerleave", leave);
    el.addEventListener("pointerdown", leave);
    (el as HTMLElement & { _tipCleanup?: () => void })._tipCleanup = () => {
      el.removeEventListener("pointerenter", enter);
      el.removeEventListener("pointerleave", leave);
      el.removeEventListener("pointerdown", leave);
    };
  },
  updated(el, binding) {
    el.dataset.tip = binding.value ?? "";
    if (tip.visible && !binding.value) hideTip();
  },
  unmounted(el) {
    (el as HTMLElement & { _tipCleanup?: () => void })._tipCleanup?.();
    hideTip();
  },
};

type TipDirective = Directive<HTMLElement, string | undefined>;

/** Lets a host swap the tip directive shared controls use; the App panel provides its own. */
export const TIP_DIRECTIVE: InjectionKey<TipDirective> = Symbol("tipDirective");

export function useTipDirective(): TipDirective {
  return inject(TIP_DIRECTIVE, vTip);
}
