import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@prediction-market/sdk': path.resolve(__dirname, '../sdk/src/index.ts'),
    },
  },
  define: {
    'process.env': {},
  },
});
