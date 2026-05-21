"use client";

import React, { useEffect, useState } from "react";

export default function Home() {
  const [WorldView, setWorldView] = useState<any>(null);

  useEffect(() => {
    // Mock the dc object exactly as before so it's globally available
    if (typeof window !== "undefined") {
      (window as any).dc = {
        app: {
          vault: { 
            adapter: { 
              getFullPath: (p: string) => p, 
              basePath: '',
              exists: async (p: string) => {
                if (p.includes('.js') || p.includes('script_cache')) return false;
                return true;
              },
              read: async (p: string) => "",
              write: async (p: string, content: string) => {},
              mkdir: async (p: string) => {},
              getResourcePath: (p: string) => p,
            },
            getFileByPath: async (p: string) => ({}),
            getResourcePath: (p: any) => p,
          },
          workspace: { activeLeaf: null },
          commands: {
            commands: {},
            executeCommandById: () => false,
            execute: () => false
          }
        },
        resolvePath: () => '',
        Icon: ({ icon, style }: any) => <span style={style} className={`icon icon-${icon}`} />
      };

      // Expose 'app' globally as some files reference 'app' directly instead of 'dc.app'
      (window as any).app = (window as any).dc.app;

      // Import App.jsx which will pass through our dc-loader
      import("../../../src/App.jsx").then((module) => {
        setWorldView(() => module.WorldView);
      });
    }
  }, []);

  if (!WorldView) {
    return <div style={{ width: "100%", height: "100vh", background: "#000", color: "#fff", display: "flex", justifyContent: "center", alignItems: "center" }}>Initializing Sovereign System...</div>;
  }

  return (
    <main style={{ width: "100%", height: "100vh", overflow: "hidden", background: "#000" }}>
      <WorldView folderPath="" dc={(window as any).dc} />
    </main>
  );
}
