/**
 * An element's box, read once per frame instead of once per pointer event.
 *
 * `getBoundingClientRect` forces layout, and a pointermove burst can fire a
 * dozen times between frames. The effects only need the box to turn client
 * coordinates into local ones, so the answer is cached and refreshed when
 * something that could have moved it happens - or after a frame, which covers
 * transforms nothing here observes.
 */
const MAX_AGE_MS = 16;

export function createRectCache(element) {
  let rect = element.getBoundingClientRect();
  let read = performance.now();
  let stale = false;

  const invalidate = () => {
    stale = true;
  };

  // Capture: a scroll on any ancestor moves the element, and scroll doesn't bubble.
  window.addEventListener("scroll", invalidate, { capture: true, passive: true });
  window.addEventListener("resize", invalidate, { passive: true });
  const observer = new ResizeObserver(invalidate);
  observer.observe(element);

  return {
    get current() {
      const now = performance.now();
      if (stale || now - read >= MAX_AGE_MS) {
        rect = element.getBoundingClientRect();
        read = now;
        stale = false;
      }
      return rect;
    },
    invalidate,
    destroy() {
      window.removeEventListener("scroll", invalidate, { capture: true });
      window.removeEventListener("resize", invalidate);
      observer.disconnect();
    },
  };
}
