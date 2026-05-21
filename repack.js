const fs = require('fs');
const path = require('path');

const componentPath = './D.q.world888.component.md';

const files = {
  // ── UI ───────────────────────────────────────────────────────────────────
  'ViewComponent':        'src/App.jsx',
  'LoadingConfirmation':  'src/LoadingConfirmation.jsx',
  'ScreenModeHelper':     'src/ScreenModeHelper.jsx',
  'SpherePipSpawner':     'src/SpherePipSpawner.jsx',

  // ── Orchestrators ────────────────────────────────────────────────────────
  'WorldLogic':           'src/WorldLogic.js',
  'Engine':               'src/Engine.js',

  // ── Engine core ──────────────────────────────────────────────────────────
  'EventBus':             'src/EventBus.js',

  // ── Data ─────────────────────────────────────────────────────────────────
  'PlayerState':          'src/PlayerState.js',
  'MovementConfig':       'src/MovementConfig.js',

  // ── Systems ──────────────────────────────────────────────────────────────
  'InputSystem':          'src/InputSystem.js',
  'PhysicsSystem':        'src/PhysicsSystem.js',
  'MovementSystem':       'src/MovementSystem.js',
  'CameraSystem':         'src/CameraSystem.js',
  'RenderSystem':         'src/RenderSystem.js',
  'MultiplayerSystem':    'src/MultiplayerSystem.js',

  // ── Loaders / Helpers ────────────────────────────────────────────────────
  'SceneLoader':          'src/SceneLoader.js',
  'LoadScript':           'src/LoadScript.js',
  'PaneLogic':            'src/PaneLogic.js',
  'PreventDefaultInputs': 'src/PreventDefaultInputs.js',

  // ── Legacy (kept for web-src bundle compat — not used in Datacore path) ──
  'HavokPhysics':          'src/HavokPhysics.js',
  'CharacterConstants ':   'src/CharacterConstants.js',
  'CharacterLogic':        'src/CharacterLogic.js',
  'CharacterVelocity':     'src/CharacterVelocity.js',
  'CameraLogic':           'src/CameraLogic.js',
  'Multiplayer':           'src/Multiplayer.js',
};

try {
  let mdContent = fs.readFileSync(componentPath, 'utf8');

  for (const [header, srcPath] of Object.entries(files)) {
    const absoluteSrcPath = './' + srcPath;
    if (!fs.existsSync(absoluteSrcPath)) {
      console.warn(`⚠️ Source file ${srcPath} does not exist. Skipping.`);
      continue;
    }

    let srcContent = fs.readFileSync(absoluteSrcPath, 'utf8');

    // 1. Replace activeFile and folderPath definitions with fileName
    srcContent = srcContent.replace(
      /const\s+activeFile\s*=\s*dc\.resolvePath\([^)]+\)[^;]*;/g,
      'const fileName = dc.resolvePath("D.q.world888.component.md");'
    );
    srcContent = srcContent.replace(
      /const\s+folderPath\s*=\s*activeFile\.substring[^;]*;/g,
      ''
    );

    // 2. Replace local dc.require imports with headerLink imports
    srcContent = srcContent.replace(
      /await\s+dc\.require\(\s*folderPath\s*\+\s*["']\/src\/([A-Za-z0-9_]+)\.(jsx?|tsx?)["']\s*\)/g,
      'await dc.require(dc.headerLink(fileName, "$1"))'
    );

    // 3. Specifically for ViewComponent, apply glbBasePath transformation
    if (header === 'ViewComponent') {
      const targetGlbPattern = /\/\/ Memoize glbBasePath to prevent unnecessary re-renders\s+const glbBasePath = useMemo\(\(\) => \{\s+return `\$\{folderPath\}\/assets\/glb\/`;\s+\}, \[\]\);/;
      const replacementGlb = `// Get current file path to construct relative GLB path (memoized to prevent re-renders)
  const currentFilePath = dc.resolvePath("WORLD 888");
  
  // Memoize glbBasePath to prevent unnecessary re-renders
  const glbBasePath = useMemo(() => {
    // Extract the directory path and construct the path to assets/glb
    // Current path is like: "_RESOURCES/DATACORE/_DONE/WORLD 888/WORLD 888.md"
    // We want: "_RESOURCES/DATACORE/_DONE/WORLD 888/assets/glb/"
    const componentDir = currentFilePath ? currentFilePath.substring(0, currentFilePath.lastIndexOf('/')) : '_RESOURCES/DATACORE/_DONE/WORLD 888';
    const path = \`\${componentDir}/assets/glb/\`;
    return path;
  }, [currentFilePath]);`;

      srcContent = srcContent.replace(targetGlbPattern, replacementGlb);
    }

    // 4. Update the corresponding section inside D.q.world888.component.md
    // Escape header for regex (handling potential trailing spaces like in 'CharacterConstants ')
    const escapedHeader = header.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&').trim();
    // Match: # HeaderName\n\n```[lang]\n[code]\n```
    const sectionRegex = new RegExp(
      `(# ${escapedHeader}\\s*\\n\\s*\\n\`\`\`[a-z]*\\n)([\\s\\S]*?)(\\n\`\`\`)`,
      'i'
    );

    if (sectionRegex.test(mdContent)) {
      mdContent = mdContent.replace(sectionRegex, `$1${srcContent}$3`);
      console.log(`✅ Repacked section: # ${header.trim()} (from ${srcPath})`);
    } else {
      console.error(`❌ Could not find section in MD: # ${header}`);
    }
  }

  fs.writeFileSync(componentPath, mdContent, 'utf8');
  console.log(`\n🎉 Successfully packaged D.q.world888.component.md!`);
} catch (err) {
  console.error('Repacking failed:', err.message);
  process.exit(1);
}
