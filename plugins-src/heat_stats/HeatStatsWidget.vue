<script setup lang="ts">
import { computed, provide } from "vue";
import "fuse_ui/ui/tokens.css";
import eRateWidget from "./ui/eRateWidget.vue";
import { I18N, createI18n } from "./ui/i18n.mjs";

interface Widget {
  id: string;
  digits: number;
  pad: number;
}

const props = defineProps<{
  data: Record<string, unknown>;
  assetBase?: string;
}>();

provide(
  I18N,
  createI18n({
    get locale() {
      const v = props.data?.locale;
      return typeof v === "string" && v ? v : "en";
    },
    get messages() {
      return (props.data?.messages as Record<string, string> | undefined) ?? {};
    },
  }),
);

const widget = computed(() => {
  const v = props.data?.widget;
  return v && typeof v === "object" ? (v as Widget) : null;
});

const view = computed(() => {
  const v = props.data?.rate;
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
});
</script>

<template>
  <eRateWidget v-if="widget" :widget="widget" :view="view" />
</template>
