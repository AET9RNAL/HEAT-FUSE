import { defineConfig } from 'vite'
import path from 'node:path'
import electron from 'vite-plugin-electron/simple'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

const isRelease = process.env.RELEASE === 'true'

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    __RELEASE__: JSON.stringify(isRelease),
  },
  build: {
    rollupOptions: {
      input: {
        // Control app (existing) + the transparent overlay stage window.
        main: path.join(__dirname, 'index.html'),
        overlay: path.join(__dirname, 'overlay.html'),
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
