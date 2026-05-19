/**
 * Loads a script either from a URL (with caching) or a local vault path.
 * If the source is a URL, it attempts to fetch the script, cache it locally
 * within the vault's adapter storage (e.g., .datacore/script_cache/),
 * and then loads it from the cache. Subsequent loads for the same URL
 * will use the cached version directly.
 *
 * @param {string} src - The URL or local vault path of the script.
 * @param {Function} [onload] - Optional callback function to execute when the script loads successfully.
 * @param {Function} [onerror] - Optional callback function to execute if loading fails.
 * @returns {Promise<HTMLScriptElement>} A promise that resolves with the script element when loaded, or rejects on error.
 */
async function loadScript(src, onload, onerror) {
  // Define a cache directory within Obsidian's hidden folder structure
  // Note: Using '.datacore' as an example, adjust if your plugin uses a different hidden dir
  const cacheDir = ".datacore/script_cache";
  // Simple check for URL format
  const isUrl = /^https?:\/\//.test(src);

  // --- Helper Function to Execute Script Content ---
  const executeScriptContent = (scriptContent, resolve, reject, scriptElement) => {
    try {
      scriptElement.textContent = scriptContent;
      document.body.appendChild(scriptElement);
    //   console.log(`Script executed from ${isUrl ? 'cache/network' : 'local path'}: ${src}`);
      if (onload) {
        onload(); // Call the original onload callback
      }
      resolve(scriptElement); // Resolve the promise with the script element
    } catch (execError) {
      console.error(`Error executing script content from ${src}:`, execError);
      if (onerror) {
        onerror(execError); // Call the original onerror callback
      }
      reject(execError); // Reject the promise
    }
  };

  return new Promise(async (resolve, reject) => {
    const scriptElement = document.createElement("script");
    scriptElement.async = true; // Keep async behavior

    try {
      if (isUrl) {
        // --- URL Handling (Fetch & Cache) ---

        // Generate a safe filename from the URL
        // Replace protocol, slashes, and common unsafe characters
        const safeFilename = src
          .replace(/^https?:\/\//, '')
          .replace(/[\/\\?%*:|"<>]/g, '_') + ".js"; // Add .js extension
        const cachePath = `${cacheDir}/${safeFilename}`;

        let scriptText = null;

        // 1. Check if the cached file exists
        const adapter = app.vault.adapter; // Get the adapter
        const cachedExists = await adapter.exists(cachePath);

        if (cachedExists) {
          // 2a. Load from cache
        //   console.log(`Loading script from cache: ${cachePath}`);
          try {
            scriptText = await adapter.read(cachePath);
          } catch (readError) {
            console.warn(`Failed to read cache file ${cachePath}, attempting refetch. Error:`, readError);
            // Proceed to fetch if cache read fails
          }
        }

        // 2b. Fetch from network if not cached or cache read failed
        if (scriptText === null) {
        //   console.log(`Fetching script from network: ${src}`);
          const response = await fetch(src);

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} for ${src}`);
          }
          scriptText = await response.text();

          // 3. Write to cache
          try {
            // Ensure cache directory exists
            if (!(await adapter.exists(cacheDir))) {
            //   console.log(`Creating script cache directory: ${cacheDir}`);
              await adapter.mkdir(cacheDir);
            }
            // console.log(`Writing script to cache: ${cachePath}`);
            await adapter.write(cachePath, scriptText);
          } catch (writeError) {
            // Log warning but proceed, as we have the script content anyway
            console.warn(`Failed to write script to cache ${cachePath}. Error:`, writeError);
          }
        }

        // 4. Execute the script content
        executeScriptContent(scriptText, resolve, reject, scriptElement);

      } else {
        // --- Local Vault Path Handling ---
        // console.log(`Loading script from local vault path: ${src}`);
        const adapter = app.vault.adapter;
        const localFileExists = await adapter.exists(src);

        if (!localFileExists) {
           throw new Error(`Local script file not found: ${src}`);
        }

        const scriptText = await adapter.read(src);
        executeScriptContent(scriptText, resolve, reject, scriptElement);
      }
    } catch (error) {
      // --- General Error Handling ---
      console.error(`Failed to load script ${src}:`, error);
      // Ensure script element is removed if appended prematurely or not needed
      if (scriptElement.parentNode) {
        scriptElement.parentNode.removeChild(scriptElement);
      }
      if (onerror) {
        onerror(error); // Call the original onerror callback
      }
      reject(error); // Reject the promise
    }
  });
}

return { loadScript };
