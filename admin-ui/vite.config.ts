import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
    base: '/admin/',
    plugins: [react(), tailwindcss()],
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
                ws: true,
            },
        },
    },
});