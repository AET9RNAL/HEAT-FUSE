<script setup lang="ts">
import { motion } from 'motion-v'
import Icons from './Icons.vue'
import { useI18n } from '../composables/useI18n'
import AppLogoFull from '../assets/icons/app-logo-full.svg'

const { t } = useI18n()
const closeWindow    = () => window.appAPI?.closeWindow()
const minimizeWindow = () => window.appAPI?.minimizeWindow()
const maximizeWindow = () => window.appAPI?.maximizeWindow()
</script>

<template>
  <header class="titlebar" role="banner">
    <div class="logo-holder">
      <img :src="AppLogoFull" class="app-logo" alt="HEAT FUSE" />
    </div>
    <div class="controls" role="group" :aria-label="t('apptitlebar.windowControls')">
      <button type="button" class="btn" :title="t('apptitlebar.minimize')" @click="minimizeWindow">
        <Icons kind="minimize" size="small" />
      </button>
      <button type="button" class="btn" :title="t('apptitlebar.maximize')" @click="maximizeWindow">
        <Icons kind="maximize" size="small" />
      </button>
      <motion.button
        type="button"
        class="btn close"
        :title="t('apptitlebar.close')"
        :aria-label="t('apptitlebar.close')"
        :whileHover="{
          boxShadow: ['0 0 10px #ef4444', '0 0 30px #ef4444', '0 0 10px #ef4444'],
          transition: { duration: 3, repeat: Infinity, ease: 'easeInOut' },
        }"
        @click="closeWindow"
      >
        <Icons kind="cross" size="small" />
      </motion.button>
    </div>
  </header>
</template>

<style scoped>
.titlebar {
  -webkit-app-region: drag;
  position: relative;
  z-index: 9999;
  height: 48px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--base-900);
  user-select: none;
}
.app-logo {
  height: 32px;
  width: auto;
  -webkit-user-drag: none;
  user-select: none;
  pointer-events: none;
}
.logo-holder {
  margin: var(--space-3) 0 0 var(--space-3);
  display: flex;
  align-items: flex-start;
  align-self: flex-start;
}



.controls {
  -webkit-app-region: no-drag;
  display: flex;
  align-items: flex-start;
  align-self: flex-start;
}

.btn {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-main);
  cursor: pointer;
}

.btn.close:hover { background: #ef4444; }
.btn:focus { outline: none; }
.btn:focus-visible { box-shadow: 0 0 0 2px #ef4444; outline: none; }
</style>
