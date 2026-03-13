import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Calendar, FileText, Users, UserPlus, Pencil, X, Check } from "lucide-react";
import Header from "@/components/layout/Header";
import BlogCard from "@/components/home/BlogCard";
import { useAuth } from "@/contexts/AuthContext";
import { API_BASE_URL } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const Profile = () => {
  const { user, login } = useAuth();
  const [blogs, setBlogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [followers, setFollowers] = useState(0);
  const [followings, setFollowings] = useState(0);
  const [profileUser, setProfileUser] = useState<any>(null);

  // Edit profile state
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ fullName: "", username: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    const fetchUserData = async () => {
      try {
        const [blogsRes, userRes, networkRes] = await Promise.all([
          fetch(`${API_BASE_URL}/blogs`),
          fetch(`${API_BASE_URL}/user/id/${user.id}`, { credentials: "include" }),
          fetch(`${API_BASE_URL}/follow/network?user_id=${user.id}`, { credentials: "include" }),
        ]);
        
        const blogsData = await blogsRes.json();
        if (blogsData.success) {
          setBlogs((blogsData.data || []).filter((b: any) => b.author_id === user.id));
        }
        
        const userData = await userRes.json();
        if (userData.success && userData.data) {
          setProfileUser(userData.data);
          setFollowers(userData.data.followers || 0);
          setFollowings(userData.data.followings || 0);
        }

        const networkData = await networkRes.json();
        if (networkData.success && networkData.data) {
          const followerCount = networkData.data.followers_list?.length;
          const followingCount = networkData.data.following_list?.length;
          if (followerCount !== undefined) setFollowers(followerCount);
          if (followingCount !== undefined) setFollowings(followingCount);
        }
      } catch (err) {
        console.error("Failed to fetch user data:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchUserData();
  }, [user?.id]);

  const displayName = profileUser?.fullName || profileUser?.Username || user?.fullName || user?.username || "User";
  const displayUsername = profileUser?.username || profileUser?.Username || user?.username || "";
  const displayEmail = profileUser?.email || profileUser?.Email || user?.email || "";

  const startEditing = () => {
    setEditForm({
      fullName: displayName,
      username: displayUsername,
    });
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
  };

  const saveProfile = async () => {
    if (!editForm.fullName.trim() || !editForm.username.trim()) {
      toast.error("Name and username cannot be empty.");
      return;
    }
    if (editForm.username.length < 3 || editForm.username.length > 20) {
      toast.error("Username must be between 3 and 20 characters.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/user/update`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          user_id: user?.id,
          fullName: editForm.fullName.trim(),
          username: editForm.username.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data?.message || "Failed to update profile");
      }
      // Update local state
      setProfileUser((prev: any) => ({
        ...prev,
        fullName: editForm.fullName.trim(),
        username: editForm.username.trim(),
      }));
      // Update auth context
      login({
        ...user!,
        fullName: editForm.fullName.trim(),
        username: editForm.username.trim(),
      });
      toast.success("Profile updated successfully!");
      setEditing(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to update profile.");
    } finally {
      setSaving(false);
    }
  };

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
              {displayName
                ? displayName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
                : "U"}
            </div>

            <div className="flex-1 text-center sm:text-left">
              {editing ? (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Full Name</Label>
                    <Input
                      value={editForm.fullName}
                      onChange={(e) => setEditForm((f) => ({ ...f, fullName: e.target.value }))}
                      className="h-10 max-w-xs"
                      placeholder="Your full name"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Username</Label>
                    <Input
                      value={editForm.username}
                      onChange={(e) => setEditForm((f) => ({ ...f, username: e.target.value }))}
                      className="h-10 max-w-xs"
                      placeholder="username"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={saveProfile} disabled={saving} className="gap-1.5">
                      <Check className="h-3.5 w-3.5" />
                      {saving ? "Saving…" : "Save"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={cancelEditing} disabled={saving} className="gap-1.5">
                      <X className="h-3.5 w-3.5" />
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3 justify-center sm:justify-start">
                    <h1 className="font-display text-3xl font-bold text-foreground">
                      {displayName}
                    </h1>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={startEditing}
                      className="gap-1.5 text-xs"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit Profile
                    </Button>
                  </div>
                  {displayUsername && <p className="mt-1 text-sm text-muted-foreground">@{displayUsername}</p>}
                  <p className="mt-1 text-sm text-muted-foreground">{displayEmail}</p>
                </>
              )}

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
