const { useState, useEffect } = dc;

function LoadingConfirmation({ onConfirm, onCancel }) {
  const [status, setStatus] = useState('checking'); // checking, ready, downloading
  const [assetsExist, setAssetsExist] = useState(false);

  // Check if assets already exist
  useEffect(() => {
    const checkAssets = async () => {
      try {
        const activeFile = dc.resolvePath("WORLD 888.md") || "_RESOURCES/DATACORE/_DONE/World888/WORLD 888.md";
        const folderPath = activeFile.substring(0, activeFile.lastIndexOf('/'));
        const glbFilePath = `${folderPath}/assets/glb/scene888.glb`;
        const catFilePath = `${folderPath}/assets/glb/cat.glb`;
        
        const adapter = dc.app.vault.adapter;
        let exists = false;
        if (adapter && typeof adapter.exists === 'function') {
          exists = (await adapter.exists(glbFilePath)) && (await adapter.exists(catFilePath));
        } else {
          // Browser environment fallback
          try {
            const res1 = await fetch('/glb/scene888.glb', { method: 'HEAD' });
            const res2 = await fetch('/glb/cat.glb', { method: 'HEAD' });
            exists = res1.ok && res2.ok;
          } catch (_) {
            exists = true; // Fallback to true to allow attempt
          }
        }
        
        setAssetsExist(exists);
        
        if (exists) {
          // Assets exist, automatically load the world
          console.log('[LoadingConfirmation] Assets found in cache, loading automatically...');
          setStatus('downloading');
          onConfirm();
        } else {
          // No assets, show the download prompt
          setStatus('ready');
        }
      } catch (error) {
        console.error('[LoadingConfirmation] Error checking assets:', error);
        setStatus('ready');
      }
    };
    
    checkAssets();
  }, []);

  const handleConfirm = async () => {
    setStatus('downloading');
    // Start the actual world loading
    onConfirm();
  };

  // If assets exist and we're auto-loading, show a simple loading message
  if (assetsExist && status === 'downloading') {
    return (
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#000000',
        zIndex: 10000
      }}>
        <div style={{
          background: '#0a0a0a',
          padding: '48px',
          borderRadius: '16px',
          textAlign: 'center',
          border: '1px solid rgba(139, 92, 246, 0.15)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8)'
        }}>
          <div style={{
            width: '80px',
            height: '80px',
            margin: '0 auto 24px',
            borderRadius: '50%',
            backgroundColor: '#000000',
            border: '2px solid rgba(139, 92, 246, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 30px rgba(139, 92, 246, 0.15)'
          }}>
            <dc.Icon 
              icon="loader" 
              style={{ 
                width: '40px', 
                height: '40px', 
                color: '#8b5cf6',
                animation: 'spin 2s linear infinite'
              }} 
            />
          </div>
          <div style={{ 
            color: '#ffffff',
            fontSize: '24px',
            fontWeight: '700',
            marginBottom: '12px'
          }}>
            Loading World 888
          </div>
          <div style={{ 
            color: 'rgba(255, 255, 255, 0.4)',
            fontSize: '13px'
          }}>
            Initializing environment...
          </div>
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      </div>
    );
  }

  // If still checking, show checking state
  if (status === 'checking') {
    return (
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#000000',
        zIndex: 10000
      }}>
        <div style={{
          background: '#0a0a0a',
          padding: '48px',
          borderRadius: '16px',
          textAlign: 'center',
          border: '1px solid rgba(139, 92, 246, 0.15)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8)'
        }}>
          <div style={{
            width: '80px',
            height: '80px',
            margin: '0 auto 24px',
            borderRadius: '50%',
            backgroundColor: '#000000',
            border: '2px solid rgba(139, 92, 246, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <dc.Icon 
              icon="search" 
              style={{ 
                width: '40px', 
                height: '40px', 
                color: '#8b5cf6'
              }} 
            />
          </div>
          <div style={{ 
            color: '#ffffff',
            fontSize: '24px',
            fontWeight: '700',
            marginBottom: '12px'
          }}>
            Checking Assets
          </div>
          <div style={{ 
            color: 'rgba(255, 255, 255, 0.4)',
            fontSize: '13px'
          }}>
            Verifying local cache...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#000000',
      zIndex: 10000
    }}>
      <div style={{
        background: '#0a0a0a',
        padding: '48px',
        borderRadius: '16px',
        maxWidth: '560px',
        width: '90%',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(139, 92, 246, 0.1)',
        border: '1px solid rgba(139, 92, 246, 0.15)',
        textAlign: 'center'
      }}>
        {/* Icon Section */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '24px',
          position: 'relative'
        }}>
          <div style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            backgroundColor: '#000000',
            border: '2px solid rgba(139, 92, 246, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            boxShadow: '0 0 30px rgba(139, 92, 246, 0.15)'
          }}>
            <dc.Icon 
              icon={status === 'ready' ? 'globe' : status === 'checking' ? 'search' : 'loader'} 
              style={{ 
                width: '40px', 
                height: '40px', 
                color: '#8b5cf6',
                animation: status === 'downloading' ? 'spin 2s linear infinite' : status === 'ready' ? 'pulse 2s ease-in-out infinite' : 'none'
              }} 
            />
          </div>
        </div>
        
        {/* Title */}
        <h2 style={{
          color: '#ffffff',
          fontSize: '32px',
          fontWeight: '700',
          marginBottom: '16px',
          letterSpacing: '-0.5px',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
          {status === 'ready' && 'World 888'}
          {status === 'checking' && 'Verifying Assets'}
          {status === 'downloading' && 'Loading World'}
        </h2>
        
        {/* Description */}
        <p style={{
          color: 'rgba(255, 255, 255, 0.5)',
          fontSize: '15px',
          lineHeight: '1.7',
          marginBottom: '32px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          maxWidth: '420px',
          margin: '0 auto 32px'
        }}>
          {status === 'ready' && 'Download and cache 3D assets for the immersive experience. Assets are stored locally for faster loading.'}
          {status === 'checking' && 'Checking asset availability and local cache...'}
          {status === 'downloading' && 'Downloading components and initializing environment...'}
        </p>

        {/* Info Box */}
        {status === 'ready' && (
          <div style={{
            backgroundColor: '#000000',
            border: '1px solid rgba(139, 92, 246, 0.15)',
            borderRadius: '12px',
            padding: '16px 20px',
            marginBottom: '32px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            textAlign: 'left'
          }}>
            <dc.Icon 
              icon="info" 
              style={{ 
                width: '18px', 
                height: '18px', 
                color: '#8b5cf6',
                flexShrink: 0,
                marginTop: '2px'
              }} 
            />
            <div style={{ flex: 1 }}>
              <div style={{
                color: '#8b5cf6',
                fontSize: '13px',
                fontWeight: '600',
                marginBottom: '6px',
                fontFamily: 'system-ui, -apple-system, sans-serif'
              }}>
                Asset Details
              </div>
              <div style={{
                color: 'rgba(255, 255, 255, 0.4)',
                fontSize: '13px',
                lineHeight: '1.6',
                fontFamily: 'system-ui, -apple-system, sans-serif'
              }}>
                Source: <span style={{ color: 'rgba(255, 255, 255, 0.6)' }}>beto.assets/DATACORE/WORLD888</span><br/>
                Cache: <span style={{ color: 'rgba(255, 255, 255, 0.6)' }}>assets/glb/</span>
              </div>
            </div>
          </div>
        )}

        {/* Buttons */}
        {status === 'ready' && (
          <div style={{
            display: 'flex',
            gap: '12px',
            justifyContent: 'center'
          }}>
            <button
              onClick={onCancel}
              style={{
                padding: '14px 28px',
                fontSize: '15px',
                borderRadius: '10px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                background: 'transparent',
                color: 'rgba(255, 255, 255, 0.6)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                fontWeight: '600',
                fontFamily: 'system-ui, -apple-system, sans-serif',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
              onMouseOver={(e) => {
                e.target.style.background = 'rgba(255, 255, 255, 0.05)';
                e.target.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                e.target.style.color = 'rgba(255, 255, 255, 0.9)';
              }}
              onMouseOut={(e) => {
                e.target.style.background = 'transparent';
                e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                e.target.style.color = 'rgba(255, 255, 255, 0.6)';
              }}
            >
              <dc.Icon icon="x" style={{ width: '16px', height: '16px' }} />
              Cancel
            </button>
            
            <button
              onClick={handleConfirm}
              style={{
                padding: '14px 32px',
                fontSize: '15px',
                borderRadius: '10px',
                border: '1px solid rgba(139, 92, 246, 0.3)',
                background: 'rgba(139, 92, 246, 0.15)',
                color: '#ffffff',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                fontWeight: '600',
                fontFamily: 'system-ui, -apple-system, sans-serif',
                boxShadow: '0 0 20px rgba(139, 92, 246, 0.2)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
              onMouseOver={(e) => {
                e.target.style.background = 'rgba(139, 92, 246, 0.25)';
                e.target.style.borderColor = 'rgba(139, 92, 246, 0.5)';
                e.target.style.boxShadow = '0 0 30px rgba(139, 92, 246, 0.3)';
                e.target.style.transform = 'translateY(-1px)';
              }}
              onMouseOut={(e) => {
                e.target.style.background = 'rgba(139, 92, 246, 0.15)';
                e.target.style.borderColor = 'rgba(139, 92, 246, 0.3)';
                e.target.style.boxShadow = '0 0 20px rgba(139, 92, 246, 0.2)';
                e.target.style.transform = 'translateY(0)';
              }}
            >
              <dc.Icon icon="download" style={{ width: '16px', height: '16px' }} />
              Load World
            </button>
          </div>
        )}

        {/* Loading State */}
        {(status === 'checking' || status === 'downloading') && (
          <div style={{
            marginTop: '8px',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '8px'
          }}>
            <div style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: '#8b5cf6',
              animation: 'bounce 1.4s infinite ease-in-out both',
              animationDelay: '-0.32s'
            }}></div>
            <div style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: '#8b5cf6',
              animation: 'bounce 1.4s infinite ease-in-out both',
              animationDelay: '-0.16s'
            }}></div>
            <div style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: '#8b5cf6',
              animation: 'bounce 1.4s infinite ease-in-out both'
            }}></div>
          </div>
        )}

        {/* Animations */}
        <style>{`
          @keyframes pulse {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.05); opacity: 0.9; }
          }
          
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          
          @keyframes bounce {
            0%, 80%, 100% { transform: scale(0); opacity: 0.3; }
            40% { transform: scale(1); opacity: 1; }
          }
        `}</style>
      </div>
    </div>
  );
}

return { LoadingConfirmation };