"use client";

import { useEffect } from 'react';

interface ShortcutHandlers {
  onNewChat?: () => void;
  onFocusInput?: () => void;
  onCopyLastResponse?: () => void;
  onStopStreaming?: () => void;
  onSubmit?: () => void;
  onNavigateHistory?: (direction: 'up' | 'down') => void;
  onOpenSchemaViz?: () => void;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers): void {
  const {
    onNewChat,
    onFocusInput,
    onCopyLastResponse,
    onStopStreaming,
    onSubmit,
    onNavigateHistory,
    onOpenSchemaViz,
  } = handlers;

  // Cmd/Ctrl + K       → onNewChat
  // Cmd/Ctrl + /       → onFocusInput
  // Cmd/Ctrl + Shift+C → onCopyLastResponse
  // Escape             → onStopStreaming
  // Cmd/Ctrl + Enter   → onSubmit
  // Alt + ↑/↓          → onNavigateHistory
  // Cmd/Ctrl + Shift+S → onOpenSchemaViz

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;

      if (meta && e.key === 'k') {
        e.preventDefault();
        onNewChat?.();
        return;
      }

      if (meta && e.key === '/') {
        e.preventDefault();
        onFocusInput?.();
        return;
      }

      if (meta && e.shiftKey && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        onCopyLastResponse?.();
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        onStopStreaming?.();
        return;
      }

      if (meta && e.key === 'Enter') {
        e.preventDefault();
        onSubmit?.();
        return;
      }

      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        onNavigateHistory?.(e.key === 'ArrowUp' ? 'up' : 'down');
        return;
      }

      if (meta && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        onOpenSchemaViz?.();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    onNewChat,
    onFocusInput,
    onCopyLastResponse,
    onStopStreaming,
    onSubmit,
    onNavigateHistory,
    onOpenSchemaViz,
  ]);
}