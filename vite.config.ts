import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' keeps asset paths relative, so the same build works on Railway,
// GitHub Pages, or inside a Capacitor shell later.
export default defineConfig({
  base: './',
  plugins: [react()],
});
