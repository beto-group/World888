// Force Datacore hot-reload
const Multiplayer = (() => {
  const CHANNEL_NAME = "obsidian-world-builder-sync";

  function initialize({ scene, canvasRef, characterComponents, passcode }) {
    return new Promise((resolve, reject) => {
      // --- Initial Checks ---
      if (typeof BroadcastChannel === "undefined") {
        //console.error("Multiplayer: BroadcastChannel API not supported.");
        return reject(new Error("BroadcastChannel not supported."));
      }
      if (!scene || scene.isDisposed) {
        // console.error("Multiplayer: Scene is invalid or disposed during initialization.");
         return reject(new Error("Invalid scene for Multiplayer init."));
      }
      // Optional check for characterComponents if strictly required at init
      // if (!characterComponents) { ... }

      const instanceId = (
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
              const r = Math.random() * 16 | 0;
              return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
            })
      );
      const logPrefix = `Multiplayer [${instanceId.slice(-6)}]:`;
      //console.log(`${logPrefix} Initializing...`);

      let channel = null;
      let isCleanedUp = false; // Flag to prevent multiple cleanups
      let stateSendInterval = null;
      let pruneInterval = null;
      let beforeRenderObserver = null;
      let sceneDisposeObserver = null; // To track the observer added *by* this module

      const remotePlayers = new Map();

      try {
          channel = new BroadcastChannel(CHANNEL_NAME);
          //console.log(`${logPrefix} BroadcastChannel "${CHANNEL_NAME}" created.`);
      } catch (err) {
          console.error(`${logPrefix} Failed to create BroadcastChannel:`, err);
          // Ensure potential partial resources are cleaned if channel fails
          // (though unlikely anything substantial exists yet)
          isCleanedUp = true; // Mark as cleaned up to prevent further actions
          reject(new Error(`Failed to create BroadcastChannel: ${err.message}`));
          return; // Stop execution
      }

      // --- Cleanup Function ---
      // Defined FIRST so it can be referenced by observers etc.
      const cleanup = () => {
         if (isCleanedUp) {
              // console.log(`${logPrefix} Cleanup already called.`); // Keep logs minimal
              return;
         }
         isCleanedUp = true; // Set flag immediately to prevent re-entry and stop processing
         //console.log(`${logPrefix} Cleaning up multiplayer instance...`);

         // --- FIX: Detach listener and close channel EARLY ---
         if (channel) {
             //console.log(`${logPrefix} Detaching BroadcastChannel listeners...`);
             channel.onmessage = null;       // Remove the listener FIRST to stop receiving messages
             channel.onmessageerror = null;  // Remove error listener too
             // We'll close the channel later after attempting to send PLAYER_LEFT
         } else {
              console.log(`${logPrefix} Channel was already null during cleanup.`);
         }
         // --- End Fix ---

         // Stop intervals
         if (stateSendInterval) {
            clearInterval(stateSendInterval); stateSendInterval = null;
            console.log(`${logPrefix} State send interval cleared.`);
         }
         if (pruneInterval) {
            clearInterval(pruneInterval); pruneInterval = null;
            console.log(`${logPrefix} Prune interval cleared.`);
         }


         // Remove observers - Safely check if scene still exists and observers are valid
         // Note: The scene might be disposed already if cleanup was triggered by scene.dispose
         if (scene && !scene.isDisposed()) {
             if (beforeRenderObserver) {
                 scene.onBeforeRenderObservable.remove(beforeRenderObserver);
                 beforeRenderObserver = null;
                //  console.log(`${logPrefix} BeforeRender observer removed.`);
             }
             // Remove the specific observer added by *this* initialize function
             if (sceneDisposeObserver) {
                 scene.onDisposeObservable.remove(sceneDisposeObserver);
                 sceneDisposeObserver = null;
                //  console.log(`${logPrefix} Internal SceneDispose observer removed.`);
             }
         } else {
            //  console.log(`${logPrefix} Scene already disposed or null, skipping observer removal.`);
         }
         // Clear local observer variables regardless
         beforeRenderObserver = null;
         sceneDisposeObserver = null;


         // Attempt to notify others (best effort, might fail if channel is closing/closed)
         const leaveMessage = { type: "PLAYER_LEFT", senderId: instanceId };
         try {
             if (channel && typeof channel.postMessage === 'function') {
                // console.log(`${logPrefix} Attempting to send PLAYER_LEFT message...`); // Reduce noise
                channel.postMessage(leaveMessage);
             }
         } catch (err) {
             // This error is more likely now, and acceptable.
             console.warn(`${logPrefix} Could not send leave message during cleanup (may be expected if channel closing):`, err.message);
         } finally {
             // --- Close channel definitively here ---
             if (channel) {
                //  console.log(`${logPrefix} Closing BroadcastChannel.`);
                 channel.close();
                 channel = null; // Nullify reference
             }
         }


         // Dispose all remote player meshes
         //console.log(`${logPrefix} Disposing ${remotePlayers.size} remote player meshes...`);
         remotePlayers.forEach((playerData, playerId) => {
              if (playerData.mesh && !playerData.mesh.isDisposed()) {
                 // console.log(`${logPrefix} Disposing mesh for remote player ${playerId.slice(-6)}`); // Reduce noise
                 playerData.mesh.dispose();
              }
         });
         remotePlayers.clear(); // Clear the map
        //  console.log(`${logPrefix} Remote players map cleared.`);

         // Nullify other potential references if needed (though component unmount handles scope)
         // scene = null; // Scene reference comes from outside
         // characterComponents = null; // Ref comes from outside

         //console.log(`${logPrefix} Multiplayer cleanup finished.`);
      };


      // --- Mesh Creation ---
      // (No changes needed in this function)
      const getOrCreateRemotePlayerMesh = (playerId, initialState) => {
         if (isCleanedUp) { console.warn(`${logPrefix} getOrCreateRemotePlayerMesh called after cleanup.`); return null; }
         if (!scene || scene.isDisposed) {
             console.error(`${logPrefix} getOrCreateRemotePlayerMesh: Scene is disposed! Player ID: ${playerId}`);
             return null;
         }
         if (remotePlayers.has(playerId)) {
             return remotePlayers.get(playerId).mesh;
         }

         //console.log(`${logPrefix} Creating mesh for remote player ${playerId.slice(-6)}`);
         // ... (rest of mesh creation logic is fine) ...
         const remoteCapsule = window.BABYLON.MeshBuilder.CreateCapsule(
            `remotePlayer_${playerId}`,
            { height: 1.8, radius: 0.6, subdivisions: 4 },
            scene
         );
         remoteCapsule.isVisible = true;
         const startPos = new window.BABYLON.Vector3(0, 5, 0); // Default start pos
         if (initialState?.position) {
             try {
                 // Ensure position data is valid before copying
                 startPos.copyFromFloats(initialState.position.x, initialState.position.y + 0.1, initialState.position.z); // Start slightly above reported pos
             } catch (posError) {
                  console.warn(`${logPrefix} Error applying initial position for ${playerId.slice(-6)}:`, posError);
                  // Keep default startPos
             }
         }
         remoteCapsule.position = startPos;


         const material = new window.BABYLON.StandardMaterial(`remotePlayerMat_${playerId}`, scene);
         material.diffuseColor = new window.BABYLON.Color3(0.1, 0.2, 0.8); // Blueish
         material.emissiveColor = new window.BABYLON.Color3(0.1, 0.2, 0.8); // Glow slightly
         material.alpha = 0.85; // Slightly transparent
         remoteCapsule.material = material;
         remoteCapsule.checkCollisions = false; // Remote players don't collide locally
         remoteCapsule.isPickable = false; // Not interactable


         remotePlayers.set(playerId, {
            mesh: remoteCapsule,
            targetPosition: remoteCapsule.position.clone(),
            targetRotation: initialState?.rotation || 0, // Use provided or default
            lastUpdateTime: Date.now()
         });
          //console.log(`${logPrefix} Mesh created for ${playerId.slice(-6)}. Total remote players: ${remotePlayers.size}`);
         return remoteCapsule;
      };


      // --- State Sending ---
      // (No changes needed in this function)
      const sendPlayerState = () => {
        // Added check for characterComponents validity within the interval
        if (isCleanedUp || !channel || !characterComponents?.displayCapsule || !characterComponents?.camera) {
            // If cleanup started or components missing, stop sending
            // console.log(`${logPrefix} Skipping sendPlayerState (cleaned up or components missing).`); // Reduce noise
            return;
        }
        if (!scene || scene.isDisposed) {
            console.warn(`${logPrefix} sendPlayerState: Scene disposed, triggering cleanup.`);
            cleanup(); // Trigger cleanup if scene disappears unexpectedly
            return;
        }
        try {
            const position = characterComponents.displayCapsule.position;
            const rotation = characterComponents.camera.rotation.y; // Assuming Y is yaw
            const message = {
                type: "UPDATE_STATE",
                senderId: instanceId,
                timestamp: Date.now(), // Optional: add timestamp
                payload: {
                  position: { x: position.x, y: position.y, z: position.z },
                  rotation: rotation
                }
            };
            channel.postMessage(message);
        } catch (err) {
             console.error(`${logPrefix} Error sending state:`, err);
             // Consider stopping interval or attempting reconnect on specific errors
             if (err.name === 'InvalidStateError' && !isCleanedUp) {
                 console.error(`${logPrefix} BroadcastChannel seems closed unexpectedly. Triggering cleanup.`);
                 cleanup();
             }
        }
      };


      // --- Message Handling ---
      const handleMessage = (message) => {
        if (isCleanedUp || !scene || scene.isDisposed) {
           if (!isCleanedUp) cleanup();
           return;
        }
        
        if (!message || !message.senderId || message.senderId === instanceId) {
          return;
        }

        const now = Date.now();
        const senderId = message.senderId;

        switch (message.type) {
          case "UPDATE_STATE": {
            const payload = message.payload;
            if (!payload || !payload.position) {
                break;
            }

            let playerData = remotePlayers.get(senderId);

            if (!playerData) {
                const newMesh = getOrCreateRemotePlayerMesh(senderId, payload);
                if (!newMesh) break;
                playerData = remotePlayers.get(senderId);
                if (!playerData) break;
            }

            try {
                playerData.targetPosition = new window.BABYLON.Vector3(payload.position.x, payload.position.y, payload.position.z);
                playerData.targetRotation = (typeof payload.rotation === 'number') ? payload.rotation : playerData.targetRotation;
                playerData.lastUpdateTime = now;
            } catch (updateErr) {
                 console.warn(`${logPrefix} Error applying state update:`, updateErr);
            }
            break;
          }

          case "PLAYER_LEFT": {
            const playerData = remotePlayers.get(senderId);
            if (playerData) {
              if (playerData.mesh && !playerData.mesh.isDisposed()) {
                   playerData.mesh.dispose();
              }
              remotePlayers.delete(senderId);
            }
            break;
          }
        }
      };

      channel.onmessage = (event) => {
        handleMessage(event.data);
      };

      channel.onmessageerror = (event) => {
        if (!isCleanedUp) {
            console.error(`${logPrefix} BroadcastChannel message error:`, event);
        }
      };

      // --- World888 Server SSE Bridge ---
      let serverHost = (typeof window !== 'undefined' && window.location) ? window.location.hostname : 'localhost';
      if (serverHost === 'obsidian.md' || !serverHost) {
        serverHost = 'localhost';
      }
      const W888_SERVER = `http://${serverHost}:8885`;
      
      const requestSecure = async (url, options = {}) => {
        try {
          if (typeof window !== 'undefined' && typeof window.require === 'function') {
            const obsidian = window.require('obsidian');
            if (obsidian && typeof obsidian.requestUrl === 'function') {
              const reqOptions = {
                url: url,
                method: options.method || 'GET',
                headers: options.headers || {},
                body: typeof options.body === 'object' ? JSON.stringify(options.body) : options.body
              };
              const res = await obsidian.requestUrl(reqOptions);
              return {
                ok: res.status >= 200 && res.status < 300,
                status: res.status,
                json: async () => res.json,
                text: async () => res.text
              };
            }
          }
        } catch (_) {}
        return fetch(url, options);
      };

      let sseSource = null;
      let sseSendInterval = null;
      let isConnectedToSSE = false;

      const connectSSE = () => {
        try {
          const passcodeParam = passcode ? `&passcode=${encodeURIComponent(passcode)}` : '';
          sseSource = new EventSource(`${W888_SERVER}/events?id=${encodeURIComponent(instanceId)}${passcodeParam}`);
          sseSource.onmessage = (e) => {
            if (isCleanedUp) return;
            try {
              const msg = JSON.parse(e.data);
              if (msg) {
                handleMessage(msg);
              }
            } catch (_) {}
          };
          sseSource.onerror = () => {
            // Server not running yet — silent fail, browser auto-retries
          };
        } catch (_) {}
      };

      let consecutiveErrors = 0;
      let isPaused = false;
      const sendToServer = () => {
        if (isCleanedUp || !characterComponents?.displayCapsule || isPaused || !window.__w888_online) return;
        try {
          const pos = characterComponents.displayCapsule.position;
          const rot = characterComponents.camera?.rotation.y ?? 0;
          const passcodeParam = passcode ? `?passcode=${encodeURIComponent(passcode)}` : '';
          requestSecure(`${W888_SERVER}/sync${passcodeParam}`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'X-Passcode': passcode || ''
            },
            body: JSON.stringify({
              id:       instanceId,
              name:     `Player_${instanceId.slice(-4)}`,
              position: { x: pos.x, y: pos.y, z: pos.z },
              rotation: rot
            })
          }).then(res => {
            if (res.ok) {
              consecutiveErrors = 0;
            } else if (res.status === 401) {
              window.dispatchEvent(new CustomEvent('w888_auth_failed'));
            }
          }).catch(() => {
            consecutiveErrors++;
            if (consecutiveErrors > 1) { // 2 failures in a row
              isPaused = true;
              setTimeout(() => { consecutiveErrors = 0; isPaused = false; }, 3000); 
            }
          });
        } catch (_) {}
      };

      const disconnectSSE = () => {
        if (sseSendInterval) { clearInterval(sseSendInterval); sseSendInterval = null; }
        try {
          if (sseSource) { sseSource.close(); sseSource = null; }
          if (window.__w888_online) {
            const passcodeParam = passcode ? `?passcode=${encodeURIComponent(passcode)}` : '';
            requestSecure(`${W888_SERVER}/leave${passcodeParam}`, {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                'X-Passcode': passcode || ''
              },
              body: JSON.stringify({ id: instanceId })
            }).catch(() => {});
          }
        } catch (_) {}
      };

      const sseManagerInterval = setInterval(() => {
        if (isCleanedUp) return;
        if (window.__w888_online && !isConnectedToSSE) {
          isConnectedToSSE = true;
          connectSSE();
          sseSendInterval = setInterval(sendToServer, 80);
        } else if (!window.__w888_online && isConnectedToSSE) {
          isConnectedToSSE = false;
          disconnectSSE();
        }
      }, 500);

      // Include SSE cleanup in the main cleanup function
      const origCleanup = cleanup;
      const cleanupWithSSE = () => {
        clearInterval(sseManagerInterval);
        disconnectSSE();
        origCleanup(); // CRITICAL FIX: Actually call the original cleanup!
      };
      // Patch cleanup to also run SSE teardown
      scene.onDisposeObservable.addOnce(() => cleanupWithSSE());

      // --- Intervals & Observers ---
      const updateIntervalMs = 100; // Send state 10 times per second (BroadcastChannel)
      stateSendInterval = setInterval(sendPlayerState, updateIntervalMs);

      // Interpolation observer
      const interpolationFactor = 0.15; // Adjust for smoother/snappier movement
      if (scene && !scene.isDisposed) { // Check scene validity before adding observer
           beforeRenderObserver = scene.onBeforeRenderObservable.add(() => {
              if (isCleanedUp || !scene || scene.isDisposed) return; // Extra safety check

              remotePlayers.forEach((playerData, playerId) => {
                    if (!playerData.mesh || playerData.mesh.isDisposed()) {
                        // Mesh might have been disposed by PLAYER_LEFT or prune, remove from map
                        // console.warn(`${logPrefix} Interpolation: Mesh for ${playerId.slice(-6)} disposed. Removing.`); // Reduce noise
                        remotePlayers.delete(playerId);
                        return; // Skip to next player
                    }
                    // Interpolate position
                    if (playerData.targetPosition) {
                        playerData.mesh.position = window.BABYLON.Vector3.Lerp(
                            playerData.mesh.position,
                            playerData.targetPosition,
                            interpolationFactor
                        );
                    }
                    // Interpolate rotation (Y-axis only for capsule yaw)
                    if (playerData.targetRotation !== undefined) {
                        // Use Scalar.LerpAngle for correct angle interpolation (handles wrapping)
                        playerData.mesh.rotation.y = window.BABYLON.Scalar.LerpAngle(
                            playerData.mesh.rotation.y,
                            playerData.targetRotation,
                            interpolationFactor
                        );
                    }
              });
           });
           console.log(`${logPrefix} Interpolation observer added.`);
      } else {
          // console.error(`${logPrefix} Cannot add interpolation observer, scene invalid at init! This multiplayer instance may not function correctly.`);
           // Consider rejecting the promise if this observer is critical?
      }

      // Pruning interval for stale players
      const staleTimeoutMs = 10000; // 10 seconds
      pruneInterval = setInterval(() => {
          if (isCleanedUp) return; // Don't prune if cleaning up
          const now = Date.now();
          remotePlayers.forEach((playerData, playerId) => {
                if (now - playerData.lastUpdateTime > staleTimeoutMs) {
                    console.warn(`${logPrefix} Pruning stale player ${playerId.slice(-6)} (Last update: ${new Date(playerData.lastUpdateTime).toLocaleTimeString()}).`);
                    if (playerData.mesh && !playerData.mesh.isDisposed()) {
                         playerData.mesh.dispose();
                    }
                    remotePlayers.delete(playerId);
                }
          });
      }, staleTimeoutMs / 2); // Check every 5 seconds

      // Hook *local* cleanup into scene disposal using addOnce
      if (scene && !scene.isDisposed) {
          // Store the observer reference locally so we can remove it in cleanup
          sceneDisposeObserver = scene.onDisposeObservable.addOnce(() => {
            //   console.log(`${logPrefix} Scene dispose triggered internal cleanup.`);
              cleanup(); // Call the main cleanup function
              sceneDisposeObserver = null; // Clear the local ref after it fires
          });
          console.log(`${logPrefix} Added scene dispose observer for automatic cleanup.`);
      } else {
           console.warn(`${logPrefix} Scene invalid at init, cannot add dispose observer. Manual cleanup required.`);
      }


      // --- Resolve Promise ---
      //console.log(`${logPrefix} Initialization successful.`);
      resolve({
        isBroadcastChannel: true,
        instanceId: instanceId,
        cleanup: cleanup // Resolve with the specific cleanup function for this instance
      });

    }); // End Promise constructor
  } // End initialize function

  return { initialize };
})(); // End Multiplayer IIFE

return { Multiplayer };