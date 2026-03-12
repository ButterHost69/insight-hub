import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { Search, PenSquare, Bell, Moon, Sun, Menu, X, LogOut, User, MessageSquare } from "lucide-react";
import { useTheme } from "next-themes";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { useUnreadMessages } from "@/contexts/UnreadMessagesContext";
import AuthGuardButton from "@/components/AuthGuardButton";
import { API_BASE_URL } from "@/lib/api";

const Header = () => {
  const { theme, setTheme } = useTheme();
  const { user, isAuthenticated, logout } = useAuth();
  const { totalUnread: unreadMsgCount } = useUnreadMessages();
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch unread notification count
  useEffect(() => {
    if (isAuthenticated && user?.id) {
      const fetchUnread = async () => {
        try {
          const res = await fetch(`${API_BASE_URL}/notifications/unread-count?user_id=${user.id}`);
          const data = await res.json();
          if (data.success) {
            setUnreadCount(data.data.count);
          }
        } catch (err) {
          console.error("Failed to fetch unread count:", err);
        }
      };
      fetchUnread();
      const interval = setInterval(fetchUnread, 30000);
      return () => clearInterval(interval);
    } else {
      setUnreadCount(0);
    }
  }, [isAuthenticated, user?.id]);

  // Fetch unread message count from chat sidebar
  useEffect(() => {
    if (isAuthenticated && user?.id) {
      const fetchUnreadMsgs = async () => {
        try {
          const res = await fetch(`${API_BASE_URL}/chat/sidebar?user_id=${user.id}`, { credentials: "include" });
          const data = await res.json();
          if (data.success && data.data) {
            const total = (data.data as any[]).reduce((sum: number, c: any) => sum + (c.unread || 0), 0);
            setUnreadMsgCount(total);
          }
        } catch (err) {
          console.error("Failed to fetch unread msg count:", err);
        }
      };
      fetchUnreadMsgs();
      const interval = setInterval(fetchUnreadMsgs, 15000);
      return () => clearInterval(interval);
    } else {
      setUnreadMsgCount(0);
    }
  }, [isAuthenticated, user?.id]);

  const getInitials = () => {
    if (user?.fullName) {
      return user.fullName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    }
    return user?.username?.charAt(0).toUpperCase() || "U";
  };

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        {/* Logo */}
        <a href="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <span className="font-display text-lg font-bold text-primary-foreground">I</span>
          </div>
          <span className="font-display text-xl font-bold text-foreground">Inkwell</span>
        </a>

        {/* Desktop Nav */}
        <nav className="hidden items-center gap-8 md:flex">
          <a href="/" className="text-sm font-medium text-foreground transition-colors hover:text-primary">
            Home
          </a>
          <Link to="/explore" className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary">
            Explore
          </Link>
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* Search */}
          <AnimatePresence>
            {searchOpen && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 240, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <Input
                  placeholder="Search articles..."
                  className="h-9 bg-secondary text-sm"
                  autoFocus
                />
              </motion.div>
            )}
          </AnimatePresence>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-muted-foreground hover:text-foreground"
            onClick={() => setSearchOpen(!searchOpen)}
          >
            {searchOpen ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
          </Button>

          {/* Theme toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-muted-foreground hover:text-foreground"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>

          {/* Notifications */}
          <Button
            variant="ghost"
            size="icon"
            className="relative h-9 w-9 text-muted-foreground hover:text-foreground"
            asChild
          >
            <Link to="/notifications">
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary animate-pulse" />
              )}
            </Link>
          </Button>

          {/* Messages */}
          <Button
            variant="ghost"
            size="icon"
            className="relative h-9 w-9 text-muted-foreground hover:text-foreground"
            asChild
          >
            <Link to="/messages">
              <MessageSquare className="h-4 w-4" />
              {unreadMsgCount > 0 && (
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary animate-pulse" />
              )}
            </Link>
          </Button>

          {/* Write */}
          <AuthGuardButton size="sm" className="flex-1 gap-2">
            <PenSquare className="h-4 w-4" />
            Write
          </AuthGuardButton>

          {/* Auth: User Icon or Sign In */}
          {isAuthenticated ? (
            <div className="relative hidden md:block" ref={userMenuRef}>
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-sm font-bold text-primary-foreground shadow-md transition-all hover:shadow-lg hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-background"
              >
                {getInitials()}
              </button>
              <AnimatePresence>
                {userMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 mt-2 w-64 overflow-hidden rounded-xl border border-border bg-card shadow-xl"
                  >
                    <div className="border-b border-border px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-sm font-bold text-primary-foreground">
                          {getInitials()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {user?.fullName || user?.username}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
                        </div>
                      </div>
                    </div>
                    <div className="p-1.5">
                      <Link
                        to="/profile"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                      >
                        <User className="h-4 w-4" />
                        Profile
                      </Link>
                      <button
                        onClick={() => {
                          logout();
                          setUserMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10"
                      >
                        <LogOut className="h-4 w-4" />
                        Sign Out
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <Button variant="outline" size="sm" className="hidden md:flex" asChild>
              <Link to="/signin">Sign In</Link>
            </Button>
          )}

          {/* Mobile menu */}
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-border md:hidden"
          >
            <div className="container mx-auto flex flex-col gap-4 px-4 py-4">
              <a href="/" className="text-sm font-medium text-foreground">Home</a>
              <Link to="/explore" className="text-sm font-medium text-muted-foreground">Explore</Link>
              <div className="flex gap-2 pt-2">
                <AuthGuardButton size="sm" className="flex-1 gap-2">
                  <PenSquare className="h-4 w-4" />
                  Write
                </AuthGuardButton>
                {isAuthenticated ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 gap-2"
                    onClick={() => {
                      logout();
                      setMobileMenuOpen(false);
                    }}
                  >
                    <LogOut className="h-4 w-4" />
                    Sign Out
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" className="flex-1" asChild>
                    <Link to="/signin">Sign In</Link>
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};

export default Header;

