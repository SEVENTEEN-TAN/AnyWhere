import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

// Plugin to copy static files
function copyStaticFiles() {
  return {
    name: 'copy-static-files',
    closeBundle() {
      const distDir = resolve(__dirname, 'dist');
      
      // Copy manifest.json
      copyFileSync(
        resolve(__dirname, 'manifest.json'),
        resolve(distDir, 'manifest.json')
      );
      
      // Copy logo.png
      copyFileSync(
        resolve(__dirname, 'logo.png'),
        resolve(distDir, 'logo.png')
      );
      
      // Copy content scripts directory
      const copyDir = (src, dest) => {
        if (!existsSync(dest)) {
          mkdirSync(dest, { recursive: true });
        }
        const entries = readdirSync(src, { withFileTypes: true });
        for (const entry of entries) {
          const srcPath = join(src, entry.name);
          const destPath = join(dest, entry.name);
          if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
          } else {
            copyFileSync(srcPath, destPath);
          }
        }
      };
      
      copyDir(
        resolve(__dirname, 'content'),
        resolve(distDir, 'content')
      );
      
      copyDir(
        resolve(__dirname, 'lib'),
        resolve(distDir, 'lib')
      );
      
      copyDir(
        resolve(__dirname, 'services'),
        resolve(distDir, 'services')
      );

      // Copy sandbox/vendor (Critical: These are loaded via script tags, not bundled)
      copyDir(
        resolve(__dirname, 'sandbox/vendor'),
        resolve(distDir, 'sandbox/vendor')
      );
      
      console.log('✓ Static files copied to dist/');
    }
  };
}

export default defineConfig({
  plugins: [copyStaticFiles()],
  build: {
    rollupOptions: {
      input: {
        // HTML entries
        sandbox: resolve(__dirname, 'sandbox/index.html'),
        sidepanel: resolve(__dirname, 'sidepanel/index.html'),
        
        // Background Service Worker (must be a separate entry)
        background: resolve(__dirname, 'background/index.js'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          // Keep background script in background/ directory
          if (chunkInfo.name === 'background') {
            return 'background/index.js';
          }
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    },
    // Ensure background script is not code-split
    target: 'esnext',
    minify: false, // Disable minify for debugging
  },
  // Preserve module structure for Chrome extension
  resolve: {
    preserveSymlinks: true
  }
});
