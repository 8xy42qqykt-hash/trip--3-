import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import { defineConfig, loadEnv } from 'vite';
import dotenv from 'dotenv';

// Load .env and .env.local if present
dotenv.config();
dotenv.config({ path: '.env.local' });

// Custom plugin to guarantee 404.html and .nojekyll are always generated in dist for GitHub Pages
function githubPagesHelperPlugin() {
  return {
    name: 'github-pages-helper',
    closeBundle() {
      try {
        const distDir = path.resolve(process.cwd(), 'dist');
        const indexPath = path.join(distDir, 'index.html');
        const fallbackPath = path.join(distDir, '404.html');
        const nojekyllPath = path.join(distDir, '.nojekyll');
        if (fs.existsSync(indexPath) && !fs.existsSync(fallbackPath)) {
          fs.copyFileSync(indexPath, fallbackPath);
        }
        if (!fs.existsSync(nojekyllPath)) {
          fs.writeFileSync(nojekyllPath, '');
        }
      } catch (e) {
        // Non-blocking
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // 1. Determine base URL path:
  // - VITE_BASE_PATH set by configure-pages or user
  // - GITHUB_REPOSITORY (e.g. "photoflow/trip.app" -> "/trip.app/")
  // - Fallback to relative './' for local preview
  let base = './';
  if (process.env.VITE_BASE_PATH) {
    base = process.env.VITE_BASE_PATH;
    if (!base.endsWith('/')) base += '/';
  } else if (process.env.GITHUB_REPOSITORY) {
    const parts = process.env.GITHUB_REPOSITORY.split('/');
    const repo = parts[1];
    if (repo && !repo.endsWith('.github.io')) {
      base = `/${repo}/`;
    } else {
      base = '/';
    }
  }

  // 2. Resolve Supabase credentials (from env, or fallback to configured project credentials)
  const defaultUrl = 'https://ujjxhhjthwjmmgrbqkur.supabase.co';
  const defaultAnonKey =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqanhoaGp0aHdqbW1ncmJxa3VyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzNTA3MTgsImV4cCI6MjEwNzkyNjcxOH0.HyKOa6Y6CeVYig1X7bK798BDf241aRuo41dkiM0ygJA';

  const supabaseUrl =
    process.env.VITE_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    env.VITE_SUPABASE_URL ||
    env.SUPABASE_URL ||
    defaultUrl;

  const supabaseAnonKey =
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_KEY ||
    env.VITE_SUPABASE_ANON_KEY ||
    env.SUPABASE_ANON_KEY ||
    env.SUPABASE_KEY ||
    defaultAnonKey;

  return {
    base,
    plugins: [react(), tailwindcss(), githubPagesHelperPlugin()],
    resolve: {
      alias: {
        '@': path.resolve('.'),
      },
    },
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey),
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
