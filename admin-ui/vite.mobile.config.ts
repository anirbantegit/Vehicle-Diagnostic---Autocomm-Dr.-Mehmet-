import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
    root: 'mobile',
    base: '/mobile/',
    plugins: [react(), tailwindcss()],
    build: {
        outDir: '../../app/web_mobile/dist',
        emptyOutDir: true,
    },
    server: {
        host: '0.0.0.0',
        port: 5175,
        proxy: {
            '/bridge': {
                target: 'http://127.0.0.1:8090',
                changeOrigin: true,
                ws: true,
            },
        },
    },
});
