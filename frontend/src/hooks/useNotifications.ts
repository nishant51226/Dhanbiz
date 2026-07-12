import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  fetchNotificationInbox,
  fetchNotificationUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
} from "../api/client";
import { getApiBase } from "../constants";
import type { InboxNotificationRow } from "../types/api";
import { playNotificationSound, installNotificationSoundUnlock, primeNotificationSound } from "../utils/notificationSound";

function notificationsSocketUrl(apiBase: string): string {
  const base = apiBase.trim() || (typeof window !== "undefined" ? window.location.origin : "");
  const u = new URL(base);
  return `${u.origin}/notifications`;
}

export function useNotifications(token: string | null, _userId: string | null) {
  const apiBase = getApiBase();
  const [items, setItems] = useState<InboxNotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const refreshRef = useRef<() => Promise<void>>(async () => {});

  const refresh = useCallback(async () => {
    if (!token) {
      setItems([]);
      setUnreadCount(0);
      return;
    }
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [inbox, count] = await Promise.all([
        fetchNotificationInbox(apiBase, headers, { limit: 40 }),
        fetchNotificationUnreadCount(apiBase, headers),
      ]);
      setItems(inbox.items);
      setUnreadCount(count.unread_count);
    } finally {
      setLoading(false);
    }
  }, [apiBase, token]);

  refreshRef.current = refresh;

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!token) return;
    return installNotificationSoundUnlock();
  }, [token]);

  useEffect(() => {
    if (!token) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      return;
    }
    const socket = io(notificationsSocketUrl(apiBase), {
      auth: { token },
      // Polling only — avoids connect/disconnect churn when an outer TLS proxy
      // blocks the polling→websocket upgrade (common behind double nginx).
      transports: ["polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });
    socketRef.current = socket;

    const onRealtimeNotification = (row: InboxNotificationRow) => {
      setItems((prev) => {
        if (prev.some((p) => p.id === row.id)) return prev;
        setUnreadCount((c) => c + 1);
        void playNotificationSound();
        return [row, ...prev];
      });
    };

    // Sync inbox after reconnect so notifications missed while offline still appear.
    let isFirstConnect = true;
    const onConnect = () => {
      if (isFirstConnect) {
        isFirstConnect = false;
        return;
      }
      void refreshRef.current();
    };

    socket.on("notification", onRealtimeNotification);
    socket.on("connect", onConnect);
    return () => {
      socket.off("notification", onRealtimeNotification);
      socket.off("connect", onConnect);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [apiBase, Boolean(token)]);

  // Keep handshake auth fresh for the next automatic reconnect (no forced disconnect).
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !token) return;
    socket.auth = { token };
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const pollUnread = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const headers = { Authorization: `Bearer ${token}` };
        const count = await fetchNotificationUnreadCount(apiBase, headers);
        setUnreadCount(count.unread_count);
      } catch {
        // ignore transient poll errors
      }
    };
    const id = window.setInterval(() => void pollUnread(), 20_000);
    return () => window.clearInterval(id);
  }, [apiBase, token]);

  const markRead = useCallback(
    async (id: string) => {
      if (!token) return;
      const headers = { Authorization: `Bearer ${token}` };
      const row = await markNotificationRead(apiBase, headers, id);
      setItems((prev) => prev.map((p) => (p.id === id ? row : p)));
      setUnreadCount((c) => Math.max(0, c - 1));
    },
    [apiBase, token],
  );

  const markAllRead = useCallback(async () => {
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    await markAllNotificationsRead(apiBase, headers);
    setItems((prev) => prev.map((p) => ({ ...p, read_at: p.read_at ?? new Date().toISOString() })));
    setUnreadCount(0);
  }, [apiBase, token]);

  return { items, unreadCount, loading, refresh, markRead, markAllRead, primeNotificationSound };
}
