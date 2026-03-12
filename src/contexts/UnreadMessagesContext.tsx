import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { API_BASE_URL } from "@/lib/api";

interface UnreadMessagesContextType {
  totalUnread: number;
  conversationUnreads: Record<string, number>;
  refreshUnreads: () => Promise<void>;
  clearConversationUnread: (convoId: string) => void;
}

const UnreadMessagesContext = createContext<UnreadMessagesContextType | undefined>(undefined);

export const UnreadMessagesProvider = ({ children }: { children: ReactNode }) => {
  const { user, isAuthenticated } = useAuth();
  const [conversationUnreads, setConversationUnreads] = useState<Record<string, number>>({});

  const refreshUnreads = useCallback(async () => {
    if (!isAuthenticated || !user?.id) {
      setConversationUnreads({});
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/chat/sidebar?user_id=${user.id}`, { credentials: "include" });
      const data = await res.json();
      if (data.success && data.data) {
        const unreads: Record<string, number> = {};
        (data.data as any[]).forEach((c: any) => {
          if (c.unread > 0) unreads[c.id] = c.unread;
        });
        setConversationUnreads(unreads);
      }
    } catch (err) {
      console.error("Failed to fetch unread msg count:", err);
    }
  }, [isAuthenticated, user?.id]);

  const clearConversationUnread = useCallback((convoId: string) => {
    setConversationUnreads(prev => {
      const next = { ...prev };
      delete next[convoId];
      return next;
    });
  }, []);

  // Poll every 15s
  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      setConversationUnreads({});
      return;
    }
    refreshUnreads();
    const interval = setInterval(refreshUnreads, 15000);
    return () => clearInterval(interval);
  }, [isAuthenticated, user?.id, refreshUnreads]);

  const totalUnread = Object.values(conversationUnreads).reduce((sum, n) => sum + n, 0);

  return (
    <UnreadMessagesContext.Provider value={{ totalUnread, conversationUnreads, refreshUnreads, clearConversationUnread }}>
      {children}
    </UnreadMessagesContext.Provider>
  );
};

export const useUnreadMessages = () => {
  const context = useContext(UnreadMessagesContext);
  if (!context) throw new Error("useUnreadMessages must be used within UnreadMessagesProvider");
  return context;
};
