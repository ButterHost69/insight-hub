import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Search, TrendingUp, Flame, Clock, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Header from "@/components/layout/Header";
import BlogCard from "@/components/home/BlogCard";
import { API_BASE_URL } from "@/lib/api";

const CATEGORIES = ["All", "Technology", "Design", "Science", "Lifestyle", "Business", "Health"];

const Explore = () => {
  const [blogs, setBlogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [sortBy, setSortBy] = useState<"latest" | "popular" | "trending">("latest");

  useEffect(() => {
    const fetchBlogs = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/blogs`);
        const data = await res.json();
        if (data.success) setBlogs(data.data || []);
      } catch (err) {
        console.error("Failed to fetch blogs:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchBlogs();
  }, []);

  const filtered = blogs
    .filter(b => {
      const matchesSearch =
        !searchQuery ||
        b.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.tags?.some((t: string) => t.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesCategory =
        activeCategory === "All" || b.category?.toLowerCase() === activeCategory.toLowerCase();
      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => {
      if (sortBy === "popular") return b.views - a.views;
      if (sortBy === "trending") return b.likes - a.likes;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Hero */}
      <section className="border-b border-border bg-card py-12">
        <div className="container mx-auto px-4 text-center">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="font-display text-4xl font-bold text-foreground md:text-5xl"
          >
            Explore Stories
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mx-auto mt-3 max-w-lg text-muted-foreground"
          >
            Discover ideas, perspectives, and knowledge from writers around the world
          </motion.p>

          {/* Search */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mx-auto mt-8 flex max-w-xl items-center gap-2"
          >
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by title or tag..."
                className="h-11 pl-10 bg-secondary"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          </motion.div>

          {/* Categories */}
          <div className="mx-auto mt-6 flex max-w-2xl flex-wrap justify-center gap-2">
            {CATEGORIES.map(cat => (
              <Button
                key={cat}
                variant={activeCategory === cat ? "default" : "outline"}
                size="sm"
                className="h-8 text-xs"
                onClick={() => setActiveCategory(cat)}
              >
                {cat}
              </Button>
            ))}
          </div>
        </div>
      </section>

      {/* Sort + Results */}
      <section className="container mx-auto px-4 py-10">
        <div className="mb-6 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? "story" : "stories"} found
          </p>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            {([
              { key: "latest", label: "Latest", icon: Clock },
              { key: "popular", label: "Popular", icon: TrendingUp },
              { key: "trending", label: "Most Liked", icon: Flame },
            ] as const).map(s => (
              <Button
                key={s.key}
                variant={sortBy === s.key ? "default" : "ghost"}
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => setSortBy(s.key)}
              >
                <s.icon className="h-3 w-3" />
                {s.label}
              </Button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-72 animate-pulse rounded-xl bg-secondary" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center">
            <Search className="mx-auto h-12 w-12 text-muted-foreground/40" />
            <p className="mt-4 text-muted-foreground">No stories found. Try a different search or category.</p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((blog, i) => (
              <BlogCard key={blog.id || i} blog={blog} index={i} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default Explore;
