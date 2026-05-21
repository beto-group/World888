const { useEffect, useRef, useState } = dc;

function preventDefaultInputs({ viewRef }) {
  const [isFocused, setIsFocused] = useState(false);
  const isFocusedRef = useRef(false);
  
  const originalCommandsRef = useRef(null);
  const originalExecuteCommandRef = useRef(null);
  const originalExecuteRef = useRef(null);

  const handleKeyDown = (event) => {
    if (!isFocusedRef.current) return; // Only block when focused

    const key = event.key.toLowerCase();
    const gameKeys = ['w','s','a','d','arrowup','arrowdown','arrowleft','arrowright',' ','shift','j','c','control','tab'];

    // Block all modifier key events (Ctrl, Meta, Alt)
    if (event.metaKey || event.ctrlKey || event.altKey) {
      // Allow game movement/action keys to propagate to the canvas even when a modifier is held.
      // We call preventDefault() to stop Obsidian shortcuts (like Ctrl+W closing the pane),
      // but do NOT call stopPropagation(), so Babylon.js can still read the 'w' key.
      if (gameKeys.includes(key)) {
        event.preventDefault();
        return;
      }
      event.stopPropagation();
      event.preventDefault();
      if (viewRef.current) {
        viewRef.current.focus();
      }
      return;
    }

    // Allow game movement/action keys to propagate to the canvas
    if (gameKeys.includes(key)) {
      return;
    }

    // Block all other key events within the scene to prevent command triggers
    if (viewRef.current && viewRef.current.contains(event.target)) {
      event.stopPropagation();
      event.preventDefault();
      viewRef.current.focus();
    }
  };

  const handleFocus = () => {
    if (!dc.app || !dc.app.commands) {
      console.warn('PreventDefaultInputs: dc.app or dc.app.commands unavailable');
      return;
    }

    if (isFocusedRef.current || originalCommandsRef.current !== null) {
      isFocusedRef.current = true;
      setIsFocused(true);
      return;
    }

    isFocusedRef.current = true;
    setIsFocused(true);

    // Store original command state
    if (!originalCommandsRef.current) {
      originalCommandsRef.current = { ...dc.app.commands.commands } || {};
    }
    if (!originalExecuteCommandRef.current) {
      originalExecuteCommandRef.current = dc.app.commands.executeCommandById;
    }
    if (!originalExecuteRef.current) {
      originalExecuteRef.current = dc.app.commands.execute;
    }

    // Disable all commands
    dc.app.commands.commands = {};

    // Override executeCommandById to block all commands
    dc.app.commands.executeCommandById = (commandId) => {
      return false;
    };

    // Override execute to block all commands
    dc.app.commands.execute = (command) => {
      return false;
    };

    // Add keydown listener
    document.addEventListener('keydown', handleKeyDown, { capture: true });
  };

  const restoreCommands = () => {
    if (!isFocusedRef.current && originalCommandsRef.current === null) return;
    
    isFocusedRef.current = false;
    setIsFocused(false);

    // Restore commands
    if (dc.app && dc.app.commands) {
      if (originalCommandsRef.current) {
        dc.app.commands.commands = { ...originalCommandsRef.current };
        originalCommandsRef.current = null;
      }
      if (originalExecuteCommandRef.current) {
        dc.app.commands.executeCommandById = originalExecuteCommandRef.current;
        originalExecuteCommandRef.current = null;
      }
      if (originalExecuteRef.current) {
        dc.app.commands.execute = originalExecuteRef.current;
        originalExecuteRef.current = null;
      }
    }

    // Remove keydown listener
    document.removeEventListener('keydown', handleKeyDown, { capture: true });
  };

  const handleBlur = () => {
    setTimeout(() => {
      if (!viewRef.current) return;
      const activeEl = document.activeElement;
      
      const focusStayingInside = activeEl && viewRef.current.contains(activeEl);
      const isNeutralElement = !activeEl || activeEl === document.body || activeEl === document.documentElement;
      
      if (focusStayingInside || isNeutralElement) {
        return;
      }
      
      restoreCommands();
    }, 50);
  };

  // Click-outside detection to help restore focus/commands
  const handleDocumentClick = (e) => {
    if (!isFocusedRef.current) return;
    
    const clickedInside = viewRef.current && viewRef.current.contains(e.target);
    if (!clickedInside) {
      restoreCommands();
    }
  };

  useEffect(() => {
    if (!isFocused) return;
    
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleDocumentClick, { capture: true });
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleDocumentClick, { capture: true });
    };
  }, [isFocused]);

  useEffect(() => {
    if (!dc.app) return;

    const viewElement = viewRef.current;
    if (viewElement) {
      viewElement.addEventListener('focus', handleFocus, { capture: true });
      viewElement.addEventListener('blur', handleBlur, { capture: true });
    }

    return () => {
      if (viewElement) {
        viewElement.removeEventListener('focus', handleFocus, { capture: true });
        viewElement.removeEventListener('blur', handleBlur, { capture: true });
      }
      if (isFocusedRef.current) {
        restoreCommands();
      }
    };
  }, [viewRef]);

  return { handleFocus, handleBlur, handleKeyDown };
}

return { preventDefaultInputs };