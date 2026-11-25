import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load .env so the Groww token is available to the dev server (not the client bundle).
  const env = loadEnv(mode, process.cwd(), '');
  const growwToken = env.VITE_GROWW_API_TOKEN ?? '';

  return {
    plugins: [react()],
    server: {
      port: 3100,
      proxy: {
        // Free Yahoo Finance chart data (same endpoint the yfinance Python lib uses).
        '/yahoo-api': {
          target: 'https://query1.finance.yahoo.com',
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/yahoo-api/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader(
                'User-Agent',
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
              );
              proxyReq.setHeader('Accept', 'application/json');
            });
          },
        },
        // Browser calls /groww-api/... ; the dev server forwards to api.groww.in
        // and injects auth headers so the token never reaches the client.
        '/groww-api': {
          target: 'https://api.groww.in',
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/groww-api/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              if (growwToken) {
                proxyReq.setHeader('Authorization', `Bearer ${growwToken}`);
              }
              proxyReq.setHeader('X-API-VERSION', '1.0');
              proxyReq.setHeader('Accept', 'application/json');
            });
          },
        },
      },
    },
  };
});
