import { useState } from "react";
import { Bell, Heart, MessageCircle, UserPlus, BookOpen } from "lucide-react";
import { motion } from "framer-motion";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type NotificationType = "like" | "comment" | "follow" | "blog";

interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  time: string;
  read: boolean;
}

const mockNotifications: Notification[] = [
  { id: "1", type: "like", message: "John liked your blog \"Getting Started with Go\"", time: "2 min ago", read: false },
  { id: "2", type: "comment", message: "Sarah commented on your blog \"React Patterns\"", time: "15 min ago", read: false },
  { id: "3", type: "follow", message: "Alex started following you", time: "1 hour ago", read: false },
  { id: "4", type: "blog", message: "Mike published a new blog \"TypeScript Tips\"", time: "3 hours ago", read: true },
  { id: "5", type: "like", message: "Emma liked your comment", time: "5 hours ago", read: true },
  { id: "6", type: "follow", message: "Chris started following you", time: "1 day ago", read: true },
];

const typeIcon: Record<NotificationType, React.ReactNode> = {
  like: <Heart className="h-4 w-4 text-red-500" />,
  comment: <MessageCircle className="h-4 w-4 text-blue-500" />,
  follow: <UserPlus className="h-4 w-4 text-green-500" />,
  blog: <BookOpen className="h-4 w-4 text-primary" />,
};

const filters = ["All", "Likes", "Comments", "Follows"] as const;

const Notifications = () => {
  const [notifications, setNotifications] = useState(mockNotifications);
  const [activeFilter, setActiveFilter] = useState<string>("All");

  const filtered = notifications.filter((n) => {
    if (activeFilter === "All") return true;
    if (activeFilter === "Likes") return n.type === "like";
    if (activeFilter === "Comments") return n.type === "comment";
    if (activeFilter === "Follows") return n.type === "follow";
    return true;
  });

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const markRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto max-w-2xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bell className="h-6 w-6 text-primary" />
            <h1 className="font-display text-2xl font-bold text-foreground">Notifications</h1>
            {unreadCount > 0 && (
              <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground">
                {unreadCount}
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllRead} className="text-muted-foreground">
              Mark all read
            </Button>
          )}
        </div>

        <div className="mb-6 flex gap-2">
          {filters.map((f) => (
            <Button
              key={f}
              variant={activeFilter === f ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveFilter(f)}
              className="rounded-full"
            >
              {f}
            </Button>
          ))}
        </div>

        <div className="space-y-2">
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <Bell className="mx-auto mb-3 h-10 w-10 opacity-40" />
              <p>No notifications yet</p>
            </div>
          ) : (
            filtered.map((n, i) => (
              <motion.div
                key={n.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => markRead(n.id)}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-xl border border-border p-4 transition-colors hover:bg-secondary/50",
                  !n.read && "bg-primary/5 border-primary/20"
                )}
              >
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary">
                  {typeIcon[n.type]}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm text-foreground", !n.read && "font-medium")}>
                    {n.message}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{n.time}</p>
                </div>
                {!n.read && (
                  <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />
                )}
              </motion.div>
            ))
          )}
        </div>
      </main>
    </div>
  );
};

export default Notifications;
