import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    base: '/admin/',
    plugins: [react()],
    build: {
        outDir: '../app/web_admin/dist',
        emptyOutDir: true,
    },
    server: {
        host: '127.0.0.1',
        port: 5173,
        proxy: {
            '/bridge': {
                target: 'http://127.0.0.1:8090',
                changeOrigin: true,
            },
        },
    },
});