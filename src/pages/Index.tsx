import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Filter, Github, ExternalLink, Sparkles, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import Header from "@/components/layout/Header";
import HeroSection from "@/components/home/HeroSection";
import BlogCard from "@/components/home/BlogCard";
import TrendingSidebar from "@/components/home/TrendingSidebar";
import { API_BASE_URL } from "@/lib/api";

type FilterType = "latest" | "popular" | "most-liked" | "most-commented";

const Index = () => {
  const [activeFilter, setActiveFilter] = useState<FilterType>("latest");
  const [blogs, setBlogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiMessages, setAiMessages] = useState<{ role: "user" | "ai"; text: string; blogs?: { title: string; slug: string }[] }[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiBuffering, setAiBuffering] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [aiMessages]);

  const handleAiSend = async () => {
    if (!aiPrompt.trim()) return;
    const userMsg = aiPrompt.trim();
    setAiMessages((prev) => [...prev, { role: "user", text: userMsg }]);
    setAiPrompt("");
    setAiLoading(true);
    setAiBuffering(false);

    const timer = setTimeout(() => {
      setAiBuffering(true);
    }, 3000);

    try {
      const res = await fetch(`${API_BASE_URL}/askAI?prompt=${encodeURIComponent(userMsg)}`);
      clearTimeout(timer);

      if (res.status === 200) {
        const data = await res.json();
        const responseText = data.response || data.message || data.data?.response || "No response received";
        const blogs = data.blogs || data.data?.blogs || [];
        setAiMessages((prev) => [
          ...prev,
          { role: "ai", text: responseText, blogs: blogs.length > 0 ? blogs : undefined },
        ]);
      } else if (res.status === 500) {
        setAiMessages((prev) => [
          ...prev,
          { role: "ai", text: "Server error. Please try again later." },
        ]);
      } else if (res.status === 404) {
        setAiMessages((prev) => [
          ...prev,
          { role: "ai", text: "Endpoint not found." },
        ]);
      } else if (res.status === 429) {
        setAiMessages((prev) => [
          ...prev,
          { role: "ai", text: "Too many requests. Please wait a moment." },
        ]);
      } else {
        const errorData = await res.json().catch(() => ({}));
        setAiMessages((prev) => [
          ...prev,
          { role: "ai", text: errorData.message || `Request failed with status ${res.status}` },
        ]);
      }
    } catch (err) {
      clearTimeout(timer);
      setAiMessages((prev) => [
        ...prev,
        { role: "ai", text: "Server unavailable. Please check your connection." },
      ]);
    } finally {
      setAiLoading(false);
    }
  };

  useEffect(() => {
    const fetchBlogs = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/blogs`);
        const data = await res.json();
        if (data.success) {
          setBlogs(data.data || []);
        }
      } catch (err) {
        console.error("Failed to fetch blogs:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchBlogs();
  }, []);

  const featuredBlogs = blogs.filter((b: any) => b.featured).slice(0, 2);
  const trendingBlogs = blogs.filter((b: any) => b.trending);

  const sortedBlogs = [...blogs].sort((a: any, b: any) => {
    switch (activeFilter) {
      case "popular": return b.views - a.views;
      case "most-liked": return b.likes - a.likes;
      case "most-commented": return b.comments - a.comments;
      default: return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
  });

  const filters: { key: FilterType; label: string }[] = [
    { key: "latest", label: "Latest" },
    { key: "popular", label: "Most Viewed" },
    { key: "most-liked", label: "Most Liked" },
    { key: "most-commented", label: "Most Commented" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <HeroSection />


      {/* Trending */}
      <section className="border-y border-border bg-secondary/30 py-12">
        <div className="container mx-auto px-4">
          <h2 className="font-display text-2xl font-bold text-foreground">Trending Now</h2>
          <p className="mt-1 text-sm text-muted-foreground">Most engaging stories this week</p>
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {trendingBlogs.map((blog, i) => (
              <BlogCard key={blog.title || i} blog={blog} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* Feed + Sidebar */}
      <section className="container mx-auto px-4 py-12">
        <div className="grid gap-10 lg:grid-cols-[1fr_340px]">
          {/* Feed */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="font-display text-2xl font-bold text-foreground">All Stories</h2>
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                {filters.map((f) => (
                  <Button
                    key={f.key}
                    variant={activeFilter === f.key ? "default" : "ghost"}
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setActiveFilter(f.key)}
                  >
                    {f.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              {sortedBlogs.map((blog, i) => (
                <BlogCard key={blog.title || i} blog={blog} index={i} />
              ))}
            </div>
          </div>

          {/* Sidebar */}
          <div className="hidden lg:block">
            <div className="sticky top-24">
              <TrendingSidebar />
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative overflow-hidden border-t border-border bg-card py-16">
        {/* Decorative gradient blob */}
        <div className="pointer-events-none absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-primary/5 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-accent/10 blur-3xl" />

        <div className="container relative mx-auto px-4">
          <div className="flex flex-col items-center gap-8">
            {/* Logo + tagline */}
            <div className="flex flex-col items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
                  <span className="font-display text-lg font-bold text-primary-foreground">I</span>
                </div>
                <span className="font-display text-xl font-bold text-foreground">Inkwell</span>
              </div>
              <p className="max-w-md text-center text-sm leading-relaxed text-muted-foreground">
                Where ideas breathe. Built for writers who think in ink and readers who live between the lines.
              </p>
            </div>

            {/* GitHub + bottom line */}
            <div className="flex flex-col items-center gap-4">
              <a
                href="https://github.com/prachin77/insight-hub"
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-2 rounded-full border border-border bg-secondary/50 px-5 py-2.5 text-sm text-muted-foreground transition-all hover:border-primary/50 hover:bg-primary/10 hover:text-foreground"
              >
                <Github className="h-4 w-4 transition-transform group-hover:scale-110" />
                <span>View Source</span>
                <ExternalLink className="h-3 w-3 opacity-50" />
              </a>
              <p className="text-xs text-muted-foreground/60">
                © 2026 Inkwell · Crafted with curiosity
              </p>
            </div>
          </div>
        </div>

        {/* AI Floating Button + Prompt Panel */}
        <AnimatePresence>
          {aiOpen && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="fixed bottom-6 right-6 z-[100] flex h-[85vh] w-[40%] flex-col rounded-2xl border border-border bg-card shadow-2xl shadow-primary/10"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">Ask AI</span>
                </div>
                <button
                  onClick={() => setAiOpen(false)}
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Messages */}
              <div className="flex min-h-[300px] flex-1 flex-col gap-3 overflow-y-auto p-4">
                {aiMessages.length === 0 && (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                    <Sparkles className="h-8 w-8 text-primary/30" />
                    <p className="text-xs text-muted-foreground">Ask me anything about blogs, writing tips, or ideas!</p>
                  </div>
                )}
                {aiMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                      msg.role === "user"
                        ? "ml-auto bg-primary text-primary-foreground"
                        : "mr-auto bg-secondary text-foreground"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.text}</p>
                    {msg.blogs && msg.blogs.length > 0 && (
                      <div className="mt-2 flex flex-col gap-1 border-t border-border pt-2">
                        <span className="text-xs font-medium text-muted-foreground">Related Blogs:</span>
                        {msg.blogs.map((blog, j) => (
                          <a
                            key={j}
                            href={`/blog/${blog.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline"
                          >
                            {blog.title}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {aiLoading && (
                  <div className="mr-auto flex items-center gap-1 rounded-xl bg-secondary px-3 py-2">
                    {aiBuffering && (
                      <span className="text-xs text-muted-foreground">Taking more time</span>
                    )}
                    <span className="flex items-center gap-1">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:0ms]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:150ms]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:300ms]" />
                    </span>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleAiSend();
                }}
                className="flex min-h-[80px] items-end gap-2 border-t border-border px-3 py-3"
              >
                <textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.ctrlKey && !e.shiftKey) {
                      e.preventDefault();
                      handleAiSend();
                    }
                  }}
                  placeholder="Type your question... (Enter to send, Ctrl+Enter for new line)"
                  rows={Math.min(10, Math.max(2, aiPrompt.split("\n").length))}
                  className="flex-1 resize-none overflow-y-auto bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                  style={{ maxHeight: "7.5rem" }}
                />
                <button
                  type="submit"
                  disabled={!aiPrompt.trim() || aiLoading}
                  className="rounded-lg bg-primary p-2 text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        {!aiOpen && (
          <button
            onClick={() => setAiOpen(true)}
            className="group fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-lg transition-all hover:scale-110 hover:shadow-xl hover:shadow-primary/25"
          >
            <Sparkles className="h-5 w-5 transition-transform group-hover:rotate-12" />
          </button>
        )}
      </footer>
    </div>
  );
};

export default Index;
