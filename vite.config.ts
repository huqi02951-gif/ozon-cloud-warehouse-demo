import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    rollupOptions: {
      input: Object.fromEntries([
        'index.html', 'guides/index.html', 'guides/fulfillment.html',
        'guides/sku-mapping.html', 'guides/inventory.html', 'guides/returns.html',
        'about.html', 'privacy.html', '404.html',
      ].map((path) => [path, fileURLToPath(new URL(path, import.meta.url))])),
    },
  },
});
