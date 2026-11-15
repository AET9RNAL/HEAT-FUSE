export interface RectCache {
  readonly current: DOMRect;
  invalidate(): void;
  destroy(): void;
}

export function createRectCache(element: Element): RectCache;
