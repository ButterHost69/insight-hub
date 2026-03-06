import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Calendar, FileText, Users, UserPlus } from "lucide-react";
import Header from "@/components/layout/Header";
import BlogCard from "@/components/home/BlogCard";
import { useAuth } from "@/contexts/AuthContext";
import { API_BASE_URL } from "@/lib/api";

const Profile = () => {
  const { user } = useAuth();
  const [blogs, setBlogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [followers, setFollowers] = useState(0);
  const [followings, setFollowings] = useState(0);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const [blogsRes, userRes] = await Promise.all([
          fetch(`${API_BASE_URL}/blogs`),
          fetch(`${API_BASE_URL}/user/${user?.username}`, { credentials: "include" }),
        ]);
        const blogsData = await blogsRes.json();
        if (blogsData.success) {
          setBlogs((blogsData.data || []).filter((b: any) => b.author_id === user?.id));
        }
        const userData = await userRes.json();
        if (userData.success) {
          setFollowers(userData.data?.followers || 0);
          setFollowings(userData.data?.followings || 0);
        }
      } catch (err) {
        console.error("Failed to fetch user data:", err);
      } finally {
        setLoading(false);
      }
    };
    if (user) fetchUserData();
  }, [user]);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Profile Header */}
      <section className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-6 sm:flex-row sm:items-start"
          >
            {/* Avatar */}
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-3xl font-bold text-primary-foreground shadow-lg ring-4 ring-background">
              {user?.fullName
                ? user.fullName.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
                : user?.username?.charAt(0).toUpperCase() || "U"}
            </div>

            <div className="flex-1 text-center sm:text-left">
              <h1 className="font-display text-3xl font-bold text-foreground">
                {user?.fullName || user?.username}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">@{user?.username}</p>
              <p className="mt-1 text-sm text-muted-foreground">{user?.email}</p>

              {/* Stats */}
              <div className="mt-6 flex justify-center gap-8 sm:justify-start">
                <div className="flex items-center gap-2 text-foreground">
                  <FileText className="h-4 w-4 text-primary" />
                  <span className="text-lg font-bold">{blogs.length}</span>
                  <span className="text-sm text-muted-foreground">Blogs</span>
                </div>
                <div className="flex items-center gap-2 text-foreground">
                  <Users className="h-4 w-4 text-primary" />
                  <span className="text-lg font-bold">{followers}</span>
                  <span className="text-sm text-muted-foreground">Followers</span>
                </div>
                <div className="flex items-center gap-2 text-foreground">
                  <UserPlus className="h-4 w-4 text-primary" />
                  <span className="text-lg font-bold">{followings}</span>
                  <span className="text-sm text-muted-foreground">Following</span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* User's Blogs */}
      <section className="container mx-auto px-4 py-12">
        <h2 className="font-display text-2xl font-bold text-foreground">Your Stories</h2>
        <p className="mt-1 text-sm text-muted-foreground">All blogs you've published</p>

        {loading ? (
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-72 animate-pulse rounded-xl bg-secondary" />
            ))}
          </div>
        ) : blogs.length === 0 ? (
          <div className="mt-12 text-center">
            <FileText className="mx-auto h-12 w-12 text-muted-foreground/40" />
            <p className="mt-4 text-muted-foreground">You haven't published any stories yet.</p>
          </div>
        ) : (
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {blogs.map((blog, i) => (
              <BlogCard key={blog.id || i} blog={blog} index={i} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default Profile;
