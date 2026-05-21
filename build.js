const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

// Plugin to mock the "dc" global object for the web bundle
// and intercept `await dc.require()` calls to turn them into static imports or inline them.
const dcMockPlugin = {
  name: 'dc-mock-plugin',
  setup(build) {
    // Intercept any file loaded from src/
    build.onLoad({ filter: /\.jsx?$/ }, async (args) => {
      let contents = await fs.promises.readFile(args.path, 'utf8');
      
      // Replace: const { X } = await dc.require(folderPath + "/src/Y.js");
      // With: import { X } from './Y.js';
      
      // Since esbuild doesn't allow top-level await in CommonJS easily, 
      // we'll transform `await dc.require(...)` into standard dynamic imports or static imports.
      // Actually, since these are in the global scope of the file, we can replace them with static imports.
      
      // Regex to match: const { X, Y } = await dc.require(folderPath + "/src/Z.js");
      // or: const { X } = await dc.require(folderPath + "/src/Z.jsx");
      const requireRegex = /(?:const|let|var)\s+\{([^}]+)\}\s*=\s*await\s+dc\.require\([^"']*(["'][^"']+["'])\s*\);?/g;
      
      contents = contents.replace(requireRegex, (match, imports, pathString) => {
        // extract the actual filename, e.g. "/src/WorldLogic.js" -> "./WorldLogic.js"
        const cleanPath = pathString.replace(/['"]/g, '').split('/').pop();
        return `import {${imports}} from './${cleanPath}';`;
      });

      // Strip `dc.resolvePath` and `dc.app.vault` usages at the top level
      contents = contents.replace(/const activeFile = dc\.resolvePath.*/g, 'const activeFile = ""; const folderPath = "";');
      contents = contents.replace(/const folderPath = activeFile.*/g, '');
      
      // For all files, replace any dc destructured hooks with React imports
      contents = contents.replace(/const\s+\{\s*([A-Za-z0-9_,\s]+)\s*\}\s*=\s*dc;/g, (match, imports) => {
        // If it looks like it contains hooks (e.g. useState, useRef), convert to import
        if (imports.includes('useState') || imports.includes('useEffect') || imports.includes('useRef') || imports.includes('useCallback') || imports.includes('useMemo')) {
          return `import { ${imports.replace(/preact/g, '').replace(/h,\s*/g, '').replace(/render,\s*/g, '').trim()} } from "react";`;
        }
        return match;
      });

      // Strip out preact specific stuff
      contents = contents.replace(/const\s+\{\s*h,\s*render\s*\}\s*=\s*dc\.preact;/g, '');
      contents = contents.replace(/\/\*\*\s*@jsx\s+h\s*\*\//g, '');

      // Convert top-level returns that break ES module bundling into proper ES exports
      contents = contents.replace(/^return\s+(\{[^}]+\});\s*$/gm, 'export $1;');

      return {
        contents,
        loader: args.path.endsWith('.jsx') ? 'jsx' : 'js',
      };
    });
  },
};

esbuild.build({
  entryPoints: ['web-src/index.jsx'],
  bundle: true,
  outfile: 'assets/bundle.js',
  format: 'iife',
  globalName: 'World888App',
  plugins: [dcMockPlugin],
  jsx: 'automatic',
  define: {
    'process.env.NODE_ENV': '"production"',
    'dc': 'window.dc'
  },
  loader: { '.js': 'jsx' },
}).then(() => {
  console.log('✅ Web bundle built successfully to assets/bundle.js');
}).catch(() => process.exit(1));
