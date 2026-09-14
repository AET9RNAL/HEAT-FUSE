import { defineConfig } from 'vite'
import path from 'node:path'
import electron from 'vite-plugin-electron/simple'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { collectSourceStats } from './scripts/source-stats.mjs'

const isRelease = process.env.RELEASE === 'true'

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    __RELEASE__: JSON.stringify(isRelease),
    __SOURCE_STATS__: JSON.stringify(collectSourceStats()),
  },
  build: {
    rollupOptions: {
      input: {
        // Control app (existing) + the transparent overlay stage window.
        main: path.join(__dirname, 'index.html'),
        overlay: path.join(__dirname, 'overlay.html'),
        splash: path.join(__dirname, 'splash.html'),
        // Permission consent card, drawn in its own view over the stage.
        consent: path.join(__dirname, 'consent.html'),
      },
    },
  },
  plugins: [
    vue(),
    !isRelease && vueDevTools(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          define: {
            __RELEASE__: JSON.stringify(isRelease),
          },
        },
      },
      preload: {
        input: path.join(__dirname, 'electron/preload.ts'),
      },
      renderer: process.env.NODE_ENV === 'test'
        ? undefined
        : {},
    }),
  ],
})
