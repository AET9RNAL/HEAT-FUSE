import { onBeforeUnmount, onMounted, ref, type Ref } from "vue";

export function cutClipPath(cut: number): string {
  const c = `${cut}px`;
  return `polygon(${c} 0%, 100% 0%, 100% calc(100% - ${c}), calc(100% - ${c}) 100%, 0% 100%, 0% ${c})`;
}

/** Reactive SVG polygon points tracing `cutClipPath(cut)` on `el`. */
export function useClipStroke(el: Ref<HTMLElement | null>, cut: number): Ref<string> {
  const points = ref("");
  let ro: ResizeObserver | null = null;

  function update(w: number, h: number): void {
    if (!w || !h) {
      points.value = "";
      return;
    }
    const cx = (cut / w) * 100;
    const cy = (cut / h) * 100;
    points.value = `${cx},0 100,0 100,${100 - cy} ${100 - cx},100 0,100 0,${cy}`;
  }

  onMounted(() => {
    if (!el.value) return;
    ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const box = entry.borderBoxSize?.[0];
      update(
        box ? box.inlineSize : entry.contentRect.width,
        box ? box.blockSize : entry.contentRect.height,
      );
    });
    ro.observe(el.value);
  });

  onBeforeUnmount(() => ro?.disconnect());
  return points;
}
