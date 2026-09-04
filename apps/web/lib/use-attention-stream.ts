"use client";

import { useEffect, useRef } from "react";
import type { AttentionResult } from "@ledger/core";
import { WS_URL } from "./config";

interface AttentionMessage {
  type: "attention";
  data: AttentionResult;
}

/**
 * Keeps one WebSocket connection open for live per-symbol updates and
 * reconciles the desired symbol list whenever the watchlist changes,
 * without ever tearing the socket down. Reconnects with backoff on drop.
 */
export function useAttentionStream(symbols: string[], onUpdate: (result: AttentionResult) => void) {
  const socketRef = useRef<WebSocket | null>(null);
  const symbolsRef = useRef<string[]>(symbols);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    let cancelled = false;
    let retryDelay = 1000;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      if (cancelled) return;
      const socket = new WebSocket(WS_URL);
      socketRef.current = socket;

      socket.onopen = () => {
        retryDelay = 1000;
        socket.send(JSON.stringify({ type: "subscribe", symbols: symbolsRef.current }));
      };

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as AttentionMessage;
          if (message.type === "attention") onUpdateRef.current(message.data);
        } catch {
          // Ignore malformed frames.
        }
      };

      socket.onclose = () => {
        if (cancelled) return;
        retryTimer = setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 15000);
      };
    };

    connect();

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      socketRef.current?.close();
    };
    // Connect once; symbol changes are pushed via the ref + effect below rather than reconnecting.
  }, []);

  useEffect(() => {
    symbolsRef.current = symbols;
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "subscribe", symbols }));
    }
  }, [symbols]);
}
