import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    port: 5173,
    /**
     * 有些编辑器与自动化工具写文件时先落一个临时目录、再原子改名
     * （形如 `.<文件名>.<pid>.<guid>.tmpdir/<文件名>.tmp`）。
     * chokidar 一旦去 watch 这种正在被占用的临时文件就会抛 EBUSY，
     * 而 vite 的 watcher 是整进程级的——dev server 会直接退出。
     * 这些中间产物没有任何监听价值，直接忽略掉。
     */
    watch: { ignored: (path: string) => path.includes('.tmpdir') },
    proxy: {
      // 开发环境把 /api 代理到 Node 服务端
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  },
  build: {
    target: 'es2020',
    outDir: 'dist'
  }
});
