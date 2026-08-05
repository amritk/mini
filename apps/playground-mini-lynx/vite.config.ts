import { defineConfig } from 'vite'

export default defineConfig({
  resolve: {
    extensions: ['.tsx', '.ts', '.jsx', '.js', '.json'],
  },
  build: {
    target: 'es2022',
  },
})
