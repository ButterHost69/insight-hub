import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams, Link } from "react-router-dom";
import { ArrowLeft, Eye, Heart, MessageCircle, Calendar, User, Edit, Trash2, Send, X, UserPlus, UserCheck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { API_BASE_URL } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Header from "@/components/layout/Header";
import { Blog, formatNumber, formatDate } from "@/lib/mockData";
import { toast } from "sonner";

const BlogDetail = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { title } = useParams<{ title: string }>();
  const [blog, setBlog] = useState<Blog | undefined>(location.state?.blog as Blog | undefined);
  const [loading, setLoading] = useState(!location.state?.blog);

  useEffect(() => {
    if (!blog && title) {
      fetch(`${API_BASE_URL}/blogs`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success && Array.isArray(data.data)) {
            const foundBlog = data.data.find((b: Blog) => b.title === title);
            if (foundBlog) {
              setBlog(foundBlog);
            }
          }
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  }, [title, blog]);

  const [liked, setLiked] = useState(blog?.liked_by?.includes(user?.username || "") ?? false);
  const [likeCount, setLikeCount] = useState(blog?.likes ?? 0);
  const [showComments, setShowComments] = useState(true);
  const [commentText, setCommentText] = useState("");
  const [comments, setComments] = useState<{ comment_id: string; author_username: string; content: string; created_at: string }[]>([]);
  const [following, setFollowing] = useState(false);
  useEffect(() => {
    if (blog) {
      // 1. Increment views
      if (blog.title) {
        fetch(`${API_BASE_URL}/blogs/increment-views`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: blog.title }),
        }).catch((err) => console.error("Failed to increment views:", err));
      }

      // 2. Fetch comments
      if (blog.id) {
        fetch(`${API_BASE_URL}/comments?blog_id=${blog.id}`)
          .then((res) => res.json())
          .then((data) => {
            if (data.success && Array.isArray(data.data)) {
              setComments(data.data);
            }
          })
          .catch((err) => console.error("Failed to fetch comments:", err));
      }

      // 3. Check follow status
      if (user && blog.author_id && user.id !== blog.author_id) {
        fetch(`${API_BASE_URL}/follow/check?follower_id=${user.id}&following_id=${blog.author_id}`)
          .then((res) => res.json())
          .then((data) => {
            if (data.success) {
              setFollowing(data.data.is_following);
            }
          })
          .catch((err) => console.error("Failed to check follow status:", err));
      }
    }
  }, [blog, user]);

  const isAuthor = user && blog && user.id === blog.author_id;

  const handleLike = async () => {
    if (!user) {
      toast.error("Please sign in to like blogs");
      return;
    }
    if (!blog?.title) return;

    try {
      const res = await fetch(`${API_BASE_URL}/blogs/toggle-like`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: blog.title, username: user.username }),
      });
      const data = await res.json();
      if (data.success) {
        setLiked(data.data.liked);
        setLikeCount((prev) => (data.data.liked ? prev + 1 : prev - 1));
      } else {
        toast.error("Failed to update like status");
      }
    } catch {
      toast.error("Failed to update like status");
    }
  };

  const handleDelete = async () => {
    if (!blog || !window.confirm("Are you sure you want to delete this blog?")) return;
    try {
      const res = await fetch(`${API_BASE_URL}/blogs/delete`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title: blog.title }),
      });
      if (res.ok) {
        toast.success("Blog deleted successfully");
        navigate("/");
      } else {
        toast.error("Failed to delete blog");
      }
    } catch {
      toast.error("Failed to delete blog");
    }
  };

  const handleAddComment = async () => {
    if (!commentText.trim()) return;
    if (!user) {
      toast.error("Please sign in to comment");
      return;
    }
    if (!blog?.id) return;

    const newComment = {
      blog_id: blog.id,
      author_id: user.id,
      author_username: user.username,
      content: commentText.trim(),
    };

    try {
      const res = await fetch(`${API_BASE_URL}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newComment),
      });
      const data = await res.json();
      if (data.success) {
        setComments((prev) => [
          {
            comment_id: data.data.comment_id || Date.now().toString(),
            author_username: user.username,
            content: newComment.content,
            created_at: new Date().toISOString(),
          },
          ...prev,
        ]);
        setCommentText("");
        toast.success("Comment added");
      } else {
        toast.error("Failed to add comment");
      }
    } catch {
      toast.error("Failed to add comment");
    }
  };

  const handleFollow = async () => {
    if (!user) {
      toast.error("Please sign in to follow authors");
      return;
    }
    if (!blog?.author_id) return;

    try {
      const res = await fetch(`${API_BASE_URL}/follow/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          follower_id: user.id,
          following_id: blog.author_id,
          action: following ? "unfollow" : "follow",
        }),
      });
      const data = await res.json();
      if (data.success) {
        setFollowing(!following);
        toast.success(following ? "Unfollowed" : "Following");
      } else {
        toast.error(data.message || "Failed to update follow status");
      }
    } catch {
      toast.error("Failed to update follow status");
    }
  };

  if (!blog) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto flex flex-col items-center justify-center px-4 py-24">
          {loading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : (
            <>
              <h1 className="font-display text-2xl font-bold text-foreground">Blog not found</h1>
              <p className="mt-2 text-muted-foreground">This blog post doesn't exist or has been removed.</p>
              <Button className="mt-6" onClick={() => navigate("/")}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to Home
              </Button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      {/* Hero Image */}
      <div className="relative h-[50vh] w-full overflow-hidden">
        <img
          src={blog.blog_image || "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&h=600&fit=crop"}
          alt={blog.title}
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-6">
          <div className="container mx-auto flex items-center gap-2 flex-wrap">
            <Button
              variant="ghost"
              size="sm"
              className="text-foreground/80 hover:text-foreground"
              onClick={() => navigate("/")}
            >
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            {isAuthor && (
              <>
                <Button
                  size="sm"
                  className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-md"
                  asChild
                >
                  <Link to={`/edit-blog/${encodeURIComponent(blog.title)}`} state={{ blog }}>
                    <Edit className="mr-2 h-4 w-4" /> Edit
                  </Link>
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="shadow-md"
                  onClick={handleDelete}
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <article className="container mx-auto max-w-3xl px-4 py-10">
        {/* Tags */}
        <div className="mb-4 flex flex-wrap gap-2">
          {blog.tags?.map((tag) => (
            <Badge key={tag} variant="secondary" className="bg-primary/10 text-primary">
              {tag}
            </Badge>
          ))}
        </div>
        {/* Title */}
        <h1 className="font-display text-3xl font-bold leading-tight text-foreground md:text-4xl lg:text-5xl">
          {blog.title}
        </h1>
        {/* Meta */}
        <div className="mt-6 flex flex-wrap items-center gap-4 border-b border-border pb-6 text-sm text-muted-foreground">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary ring-2 ring-border">
              <User className="h-4 w-4" />
            </div>
            <div>
              <span className="font-medium text-foreground">{blog.author_name || "Unknown"}</span>
              {blog.author_username && (
                <p className="text-xs text-muted-foreground">@{blog.author_username}</p>
              )}
            </div>
            {!isAuthor && (
              <Button
                variant={following ? "secondary" : "default"}
                size="sm"
                className="ml-1 gap-1.5"
                onClick={handleFollow}
              >
                {following ? <UserCheck className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
                {following ? "Following" : "Follow"}
              </Button>
            )}
          </div>
          <span className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" /> {formatDate(blog.created_at)}
          </span>
        </div>

        {/* Interactive Stats */}
        <div className="mt-4 flex items-center gap-5 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Eye className="h-4 w-4" /> {formatNumber(blog.views)} views
          </span>
          <button
            onClick={handleLike}
            className="flex items-center gap-1.5 transition-colors hover:text-pink-500"
          >
            <motion.div
              key={liked ? "liked" : "unliked"}
              initial={{ scale: 0.5 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 15 }}
            >
              <Heart
                className={`h-5 w-5 transition-colors ${liked ? "fill-pink-500 text-pink-500" : ""}`}
              />
            </motion.div>
            <span className={liked ? "text-pink-500 font-medium" : ""}>{formatNumber(likeCount)} likes</span>
          </button>
          <button
            onClick={() => setShowComments((prev) => !prev)}
            className={`flex items-center gap-1.5 transition-colors hover:text-primary ${showComments ? "text-primary font-medium" : ""}`}
          >
            <MessageCircle className={`h-4 w-4 ${showComments ? "fill-primary/20" : ""}`} />
            {formatNumber(blog.comments + comments.length)} comments
          </button>
        </div>

        {/* Body */}
        <div className="prose prose-invert mt-10 max-w-none text-foreground/90 leading-relaxed whitespace-pre-line">
          {blog.blog_content}
        </div>

        {/* Comments Section */}
        <AnimatePresence>
          {showComments && (
            <motion.section
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="mt-10 overflow-hidden"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-display text-xl font-bold text-foreground">Comments</h2>
                <button onClick={() => setShowComments(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Add Comment */}
              <div className="mt-4 flex gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary ring-1 ring-border">
                  <User className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex flex-1 gap-2">
                  <input
                    type="text"
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddComment()}
                    placeholder={user ? "Write a comment…" : "Sign in to comment"}
                    disabled={!user}
                    className="flex-1 rounded-lg border border-border bg-card px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
                  />
                  <Button size="sm" onClick={handleAddComment} disabled={!user || !commentText.trim()}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Comment List */}
              <div className="mt-6 space-y-4">
                {comments.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">No comments yet. Be the first to share your thoughts!</p>
                ) : (
                  comments.map((c) => (
                    <motion.div
                      key={c.comment_id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-lg border border-border bg-card p-4"
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary ring-1 ring-border">
                          <span className="text-[10px] font-bold text-foreground">{c.author_username?.charAt(0).toUpperCase() || "U"}</span>
                        </div>
                        <span className="text-sm font-medium text-foreground">@{c.author_username}</span>
                        <span className="text-xs text-muted-foreground">{formatDate(c.created_at)}</span>
                      </div>
                      <p className="mt-2 text-sm text-foreground/80">{c.content}</p>
                    </motion.div>
                  ))
                )}
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </article>

      {/* Footer */}
      <footer className="border-t border-border bg-card py-12">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          © 2026 Inkwell. A platform for curious minds.
        </div>
      </footer>
    </div>
  );
};

export default BlogDetail;
