import { useState, useEffect, useRef } from "react";
import { MessageSquare, Send, Search, ArrowLeft, Pencil, Trash2, X, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useUnreadMessages } from "@/contexts/UnreadMessagesContext";
import { toast } from "sonner";
import { API_BASE_URL } from "@/lib/api";

interface Conversation {
  id: string;
  name: string;
  lastMessage: string;
  time: string;
  unread: number;
  online: boolean;
}

interface Message {
  id: string;
  text: string;
  sender: "me" | "them";
  time: string;
  isEdited?: boolean;
}

const Messages = () => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConvo, setSelectedConvo] = useState<Conversation | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedConvoRef = useRef<Conversation | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [contextMenuId, setContextMenuId] = useState<string | null>(null);

  // 1. Fetch Sidebar (Following list + metadata)
  useEffect(() => {
    if (!user?.id) return;
    const fetchSidebar = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/chat/sidebar?user_id=${user.id}`, { credentials: "include" });
        const data = await res.json();
        if (data.success) {
          setConversations(data.data || []);
        }
      } catch (err) {
        console.error("Error fetching sidebar:", err);
      }
    };
    fetchSidebar();
    const interval = setInterval(fetchSidebar, 30000); // Refresh every 30s for online status
    return () => clearInterval(interval);
  }, [user?.id]);

  // 2. Fetch Messages when conversation selected
  useEffect(() => {
    if (!user?.id || !selectedConvo?.id) return;
    const fetchMessages = async () => {
      try {
        // Fetch messages which also marks them as read
        const msgsRes = await fetch(`${API_BASE_URL}/chat/messages?user_id_1=${user.id}&user_id_2=${selectedConvo.id}`, { credentials: "include" });
        const msgsData = await msgsRes.json();
        if (msgsData.success) {
          const formatted = (msgsData.data || []).map((m: any) => ({
            id: m.id,
            text: m.content,
            sender: m.sender_id === user.id ? "me" : "them",
            time: new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isEdited: m.is_edited || false
          }));
          setMessages(prev => ({ ...prev, [selectedConvo.id]: formatted }));
          
          // Clear local unread count
          setConversations(prev => prev.map(c => 
            c.id === selectedConvo.id ? { ...c, unread: 0 } : c
          ));
        }
      } catch (err) {
        console.error("Error fetching messages:", err);
      }
    };
    fetchMessages();
  }, [user?.id, selectedConvo?.id]);

  // 3. Setup Real-time Stream via WebSocket
  useEffect(() => {
    if (!user?.id) return;

    // Derive WS URL from API_BASE_URL (e.g. http://localhost:6969 -> ws://localhost:6969)
    const wsUrl = API_BASE_URL.replace(/^http/, "ws") + `/chat/stream?user_id=${user.id}`;
    
    console.log("🔌 Connecting to Chat WebSocket:", wsUrl);
    const socket = new WebSocket(wsUrl);

    socket.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      console.log("📩 WS event:", msg);

      // Handle control events (delete, edit)
      if (msg.type === "delete") {
        // Remove the deleted message from all conversations
        setMessages(prev => {
          const updated = { ...prev };
          for (const key of Object.keys(updated)) {
            updated[key] = updated[key].filter(m => m.id !== msg.message_id);
          }
          return updated;
        });
        return;
      }

      if (msg.type === "edit") {
        // Update the edited message in all conversations
        setMessages(prev => {
          const updated = { ...prev };
          for (const key of Object.keys(updated)) {
            updated[key] = updated[key].map(m =>
              m.id === msg.message_id ? { ...m, text: msg.content, isEdited: true } : m
            );
          }
          return updated;
        });
        return;
      }

      // Regular new message
      if (msg.receiver_id === user.id) {
        const formattedMsg: Message = {
          id: msg.id,
          text: msg.content,
          sender: "them",
          time: new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        
        setMessages(prev => ({
          ...prev,
          [msg.sender_id]: [...(prev[msg.sender_id] || []), formattedMsg]
        }));

        // Update sidebar last message and unread count
        setConversations(prev => prev.map(c => {
          if (c.id === msg.sender_id) {
            const isCurrent = selectedConvoRef.current?.id === c.id;
            
            // If actively viewing this conversation, mark as read in DB immediately
            if (isCurrent) {
              fetch(`${API_BASE_URL}/chat/read`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ user_id: user.id, other_id: c.id })
              }).catch(err => console.error("Failed to auto-read:", err));
            }

            return {
              ...c,
              lastMessage: msg.content,
              time: "Just now",
              unread: isCurrent ? 0 : (c.unread || 0) + 1
            };
          }
          return c;
        }));
      }
    };

    socket.onerror = (error) => console.error("❌ WebSocket error:", error);
    socket.onclose = () => console.log("🔌 WebSocket disconnected");

    return () => socket.close();
  }, [user?.id]);

  // Keep ref synced with state
  useEffect(() => {
    selectedConvoRef.current = selectedConvo;
  }, [selectedConvo]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
        scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, selectedConvo]);

  const filtered = conversations.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const currentMessages = selectedConvo ? messages[selectedConvo.id] || [] : [];

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedConvo || !user?.id) return;
    
    const content = newMessage.trim();
    setNewMessage("");

    try {
      const res = await fetch(`${API_BASE_URL}/chat/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          sender_id: user.id,
          receiver_id: selectedConvo.id,
          content: content
        })
      });
      const data = await res.json();
      if (data.success) {
        const msg: Message = {
          id: data.data.id,
          text: data.data.content,
          sender: "me",
          time: new Date(data.data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setMessages((prev) => ({
          ...prev,
          [selectedConvo.id]: [...(prev[selectedConvo.id] || []), msg],
        }));
        
        // Update sidebar last message
        setConversations(prev => prev.map(c => 
            c.id === selectedConvo.id ? { ...c, lastMessage: content, time: "Just now" } : c
        ));
      } else {
        toast.error("Failed to send message");
      }
    } catch (err) {
      toast.error("Connection error");
    }
  };

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase();

  const handleDelete = async (msgId: string) => {
    if (!user?.id || !selectedConvo) return;
    try {
      const res = await fetch(`${API_BASE_URL}/chat/message`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message_id: msgId, sender_id: user.id, receiver_id: selectedConvo.id })
      });
      const data = await res.json();
      if (data.success) {
        setMessages(prev => ({
          ...prev,
          [selectedConvo.id]: (prev[selectedConvo.id] || []).filter(m => m.id !== msgId)
        }));
        toast.success("Message deleted");
      } else {
        toast.error(data.message || "Failed to delete");
      }
    } catch { toast.error("Connection error"); }
    setContextMenuId(null);
  };

  const handleEditStart = (msg: Message) => {
    setEditingId(msg.id);
    setEditText(msg.text);
    setContextMenuId(null);
  };

  const handleEditSave = async () => {
    if (!editingId || !editText.trim() || !user?.id || !selectedConvo) return;
    try {
      const res = await fetch(`${API_BASE_URL}/chat/message`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message_id: editingId, sender_id: user.id, receiver_id: selectedConvo.id, new_content: editText.trim() })
      });
      const data = await res.json();
      if (data.success) {
        setMessages(prev => ({
          ...prev,
          [selectedConvo.id]: (prev[selectedConvo.id] || []).map(m =>
            m.id === editingId ? { ...m, text: editText.trim(), isEdited: true } : m
          )
        }));
        toast.success("Message edited");
      } else {
        toast.error(data.message || "Failed to edit");
      }
    } catch { toast.error("Connection error"); }
    setEditingId(null);
    setEditText("");
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="container mx-auto flex flex-1 overflow-hidden px-4 py-6" style={{ maxHeight: "calc(100vh - 4rem)" }}>
        <div className="flex w-full overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          {/* Sidebar */}
          <div className={cn(
            "w-full flex-col border-r border-border md:flex md:w-80",
            selectedConvo ? "hidden" : "flex"
          )}>
            <div className="border-b border-border p-4">
              <div className="mb-3 flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary" />
                <h2 className="font-display text-lg font-bold text-foreground">Messages</h2>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search conversations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 bg-secondary pl-9 text-sm"
                />
              </div>
            </div>
            <ScrollArea className="flex-1">
              {filtered.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-muted-foreground">No friends found. Follow some users to chat!</div>
              ) : (
                filtered.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedConvo(c)}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/50",
                      selectedConvo?.id === c.id && "bg-secondary"
                    )}
                  >
                    <div className="relative">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-xs font-bold text-primary-foreground">
                        {getInitials(c.name)}
                      </div>
                      {c.online && (
                        <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card bg-green-500" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <p className="truncate text-sm font-semibold text-foreground">{c.name}</p>
                        <span className="shrink-0 text-xs text-muted-foreground">{c.time}</span>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{c.lastMessage || "No messages yet"}</p>
                    </div>
                    {c.unread > 0 && (
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                        {c.unread}
                      </span>
                    )}
                  </button>
                ))
              )}
            </ScrollArea>
          </div>

          {/* Chat area */}
          <div className={cn(
            "flex-1 flex-col",
            selectedConvo ? "flex" : "hidden md:flex"
          )}>
            {selectedConvo ? (
              <>
                <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 md:hidden"
                    onClick={() => setSelectedConvo(null)}
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <div className="relative">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-xs font-bold text-primary-foreground">
                      {getInitials(selectedConvo.name)}
                    </div>
                    {selectedConvo.online && (
                      <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-card bg-green-500" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{selectedConvo.name}</p>
                    <p className="text-xs text-muted-foreground">{selectedConvo.online ? "Online" : "Offline"}</p>
                  </div>
                </div>

                <ScrollArea className="flex-1 p-4" onClick={() => setContextMenuId(null)}>
                  <div className="space-y-3">
                    {currentMessages.map((m, i) => (
                      <motion.div
                        key={m.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.01 }}
                        className={cn("group relative flex", m.sender === "me" ? "justify-end" : "justify-start")}
                      >
                        {/* Context menu trigger - only for own messages */}
                        {m.sender === "me" && !editingId && (
                          <div className="mr-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                            <button onClick={(e) => { e.stopPropagation(); setContextMenuId(contextMenuId === m.id ? null : m.id); }} className="rounded p-1 hover:bg-secondary">
                              <Pencil className="h-3 w-3 text-muted-foreground" />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); handleDelete(m.id); }} className="rounded p-1 hover:bg-destructive/10">
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </button>
                          </div>
                        )}

                        {/* Context menu */}
                        {contextMenuId === m.id && m.sender === "me" && (
                          <div className="absolute right-0 top-0 z-10 -translate-y-full rounded-lg border border-border bg-card p-1 shadow-lg">
                            <button onClick={() => handleEditStart(m)} className="flex w-full items-center gap-2 rounded px-3 py-1.5 text-xs hover:bg-secondary">
                              <Pencil className="h-3 w-3" /> Edit
                            </button>
                            <button onClick={() => handleDelete(m.id)} className="flex w-full items-center gap-2 rounded px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10">
                              <Trash2 className="h-3 w-3" /> Delete
                            </button>
                          </div>
                        )}

                        <div
                          className={cn(
                            "max-w-[75%] rounded-2xl px-4 py-2.5",
                            m.sender === "me"
                              ? "bg-primary text-primary-foreground"
                              : "bg-secondary text-foreground shadow-sm"
                          )}
                        >
                          {editingId === m.id ? (
                            <div className="flex items-center gap-2">
                              <input
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                className="w-full rounded bg-primary-foreground/20 px-2 py-1 text-sm text-primary-foreground outline-none"
                                autoFocus
                                onKeyDown={(e) => { if (e.key === "Enter") handleEditSave(); if (e.key === "Escape") { setEditingId(null); setEditText(""); } }}
                              />
                              <button onClick={handleEditSave} className="rounded p-1 hover:bg-primary-foreground/20"><Check className="h-3 w-3" /></button>
                              <button onClick={() => { setEditingId(null); setEditText(""); }} className="rounded p-1 hover:bg-primary-foreground/20"><X className="h-3 w-3" /></button>
                            </div>
                          ) : (
                            <p className="text-sm leading-relaxed">{m.text}</p>
                          )}
                          <div className={cn("mt-1 flex items-center gap-1 text-[10px]", m.sender === "me" ? "text-primary-foreground/60" : "text-muted-foreground")}>
                            <span>{m.time}</span>
                            {m.isEdited && <span>(edited)</span>}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                    <div ref={scrollRef} />
                  </div>
                </ScrollArea>

                <div className="border-t border-border p-4">
                  <form
                    onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
                    className="flex items-center gap-2"
                  >
                    <Input
                      placeholder="Type a message..."
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      className="flex-1 bg-secondary"
                    />
                    <Button type="submit" size="icon" disabled={!newMessage.trim()}>
                      <Send className="h-4 w-4" />
                    </Button>
                  </form>
                </div>
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-secondary mb-4">
                    <MessageSquare className="h-10 w-10 opacity-20" />
                </div>
                <h3 className="text-lg font-display font-semibold text-foreground mb-1">Your Messages</h3>
                <p className="text-sm">Select a conversation to start chatting</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Messages;
