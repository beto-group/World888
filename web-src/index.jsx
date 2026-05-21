import React from 'react';
import { createRoot } from 'react-dom/client';
import { WorldView } from '../src/App.jsx';

const LucideIcon = ({ icon, style }) => {
  const [svgContent, setSvgContent] = React.useState('');
  const color = style?.color || 'currentColor';
  const size = style?.fontSize || style?.width || '20px';
  
  React.useEffect(() => {
    let active = true;
    fetch(`https://unpkg.com/lucide-static@latest/icons/${icon}.svg`)
      .then(res => {
        if (!res.ok) throw new Error();
        return res.text();
      })
      .then(text => {
        if (active) {
          let modified = text;
          if (!modified.includes('stroke=')) {
            modified = modified.replace('<svg ', `<svg stroke="${color}" `);
          } else {
            modified = modified.replace(/stroke="[^"]*"/, `stroke="${color}"`);
          }
          modified = modified.replace(/width="[^"]*"/, `width="${size}"`);
          modified = modified.replace(/height="[^"]*"/, `height="${size}"`);
          setSvgContent(modified);
        }
      })
      .catch(() => {
        if (active) {
          setSvgContent(`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></svg>`);
        }
      });
    return () => { active = false; };
  }, [icon, color, size]);

  const isSpinning = icon === 'loader';

  return (
    <span 
      style={{ 
        display: 'inline-flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        width: size, 
        height: size,
        animation: isSpinning ? 'spin 2s linear infinite' : undefined,
        ...style,
        color: undefined
      }}
      dangerouslySetInnerHTML={{ __html: svgContent }}
    />
  );
};

window.dc = {
  app: {
    vault: {
      adapter: {
        getFullPath: (p) => p,
        basePath: ''
      }
    },
    workspace: {
      activeLeaf: null
    },
    commands: {
      commands: {},
      executeCommandById: () => false,
      execute: () => false
    }
  },
  resolvePath: () => '',
  Icon: LucideIcon
};

// Parse passcode from URL query param
const urlParams = new URLSearchParams(window.location.search);
const urlPasscode = urlParams.get('passcode');
if (urlPasscode) {
  localStorage.setItem('w888_passcode', urlPasscode.trim().toUpperCase());
}
const initialPasscode = urlPasscode
  ? urlPasscode.trim().toUpperCase()
  : localStorage.getItem('w888_passcode') || null;

// Mark server as online — we're inside the web client served BY the server
window.__w888_online = true;

// Mount the same WorldView component used in Obsidian
const container = document.getElementById('root');
const root = createRoot(container);
root.render(<WorldView folderPath="" dc={window.dc} initialPasscode={initialPasscode} />);
