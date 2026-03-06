import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Filter } from "lucide-react";
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
      <footer className="border-t border-border bg-card py-12">
        <div className="container mx-auto px-4">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <span className="font-display text-base font-bold text-primary-foreground">I</span>
              </div>
              <span className="font-display text-lg font-bold text-foreground">Inkwell</span>
            </div>
            <p className="text-sm text-muted-foreground">
              © 2026 Inkwell. A platform for curious minds.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
