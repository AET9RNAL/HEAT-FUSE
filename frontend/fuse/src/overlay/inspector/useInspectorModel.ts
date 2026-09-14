/**
 * Value plumbing between the inspector's controls and the runtime.
 *
 * A control being dragged keeps a local value so it tracks the pointer at frame
 * rate while `live` writes fly; the runtime's echo only takes over once the edit
 * commits. Built-in sections bypass the socket entirely and run their own
 * get/set against the selected overlay's rect.
 */
import { computed, reactive, type ComputedRef } from "vue";
import { inspectorSchemas, inspectorValues, sendInspectorAction, sendInspectorSet } from "../overlayClient";
import { evalWhen, type InputPhase, type InspectorControl, type InspectorSection } from "./types";

/** Local overrides for controls under an active edit, keyed `overlayId::controlId`. */
const localEdits = reactive(new Map<string, unknown>());
const editing = reactive(new Set<string>());

function slot(overlayId: string, controlId: string): string {
  return `${overlayId}::${controlId}`;
}

export interface BuiltinSource {
  /** Sections rendered above the plugin's own, with their own value handlers. */
  sections: InspectorSection[];
  /** Extra values for `when` predicates that have no control of their own. */
  feed?: Record<string, unknown>;
  get(controlId: string): unknown;
  set(controlId: string, value: unknown, phase: InputPhase): void;
  action(controlId: string, payload?: unknown): void;
}

export interface InspectorModel {
  sections: ComputedRef<InspectorSection[]>;
  values: ComputedRef<Record<string, unknown>>;
  valueOf(control: InspectorControl): unknown;
  visible(control: InspectorControl): boolean;
  disabled(control: InspectorControl): boolean;
  set(control: InspectorControl, value: unknown, phase: InputPhase): void;
  action(control: InspectorControl, payload?: unknown): void;
  beginEdit(control: InspectorControl): void;
  endEdit(control: InspectorControl): void;
}

export function useInspectorModel(
  overlayId: ComputedRef<string | null>,
  builtin: ComputedRef<BuiltinSource | null>,
): InspectorModel {
  const isBuiltin = (c: InspectorControl): boolean => Boolean("builtin" in c && c.builtin);

  const sections = computed<InspectorSection[]>(() => {
    const own = builtin.value?.sections ?? [];
    const id = overlayId.value;
    const plugin = id ? (inspectorSchemas.get(id)?.sections ?? []) : [];
    return [...own, ...plugin].sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
  });

  const values = computed<Record<string, unknown>>(() => {
    const id = overlayId.value;
    const out: Record<string, unknown> = { ...(id ? (inspectorValues.get(id) ?? {}) : {}) };
    const source = builtin.value;
    if (source) {
      Object.assign(out, source.feed ?? {});
      for (const section of source.sections) {
        for (const c of section.controls) {
          if (c.id) out[c.id] = source.get(c.id);
        }
      }
    }
    if (id) {
      for (const [k, v] of localEdits) {
        const [oid, cid] = k.split("::");
        if (oid === id && cid) out[cid] = v;
      }
    }
    return out;
  });

  function valueOf(control: InspectorControl): unknown {
    if (!control.id) return undefined;
    return values.value[control.id];
  }

  function visible(control: InspectorControl): boolean {
    if (control.type === "divider") return true;
    return evalWhen(control.when, values.value);
  }

  function disabled(control: InspectorControl): boolean {
    if (control.type === "divider") return false;
    return control.disabledWhen ? evalWhen(control.disabledWhen, values.value) : false;
  }

  function set(control: InspectorControl, value: unknown, phase: InputPhase): void {
    const id = overlayId.value;
    if (!control.id || !id) return;
    if (isBuiltin(control)) {
      builtin.value?.set(control.id, value, phase);
      return;
    }
    const key = slot(id, control.id);
    if (phase === "commit") localEdits.delete(key);
    else localEdits.set(key, value);
    sendInspectorSet(id, control.id, value, phase);
  }

  function action(control: InspectorControl, payload?: unknown): void {
    const id = overlayId.value;
    if (!control.id || !id) return;
    if (isBuiltin(control)) {
      builtin.value?.action(control.id, payload);
      return;
    }
    sendInspectorAction(id, control.id, payload);
  }

  function beginEdit(control: InspectorControl): void {
    const id = overlayId.value;
    if (!control.id || !id) return;
    editing.add(slot(id, control.id));
  }

  function endEdit(control: InspectorControl): void {
    const id = overlayId.value;
    if (!control.id || !id) return;
    const key = slot(id, control.id);
    editing.delete(key);
    localEdits.delete(key);
  }

  return { sections, values, valueOf, visible, disabled, set, action, beginEdit, endEdit };
}
