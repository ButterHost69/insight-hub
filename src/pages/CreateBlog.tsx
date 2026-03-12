import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Image, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import Header from "@/components/layout/Header";
import { useAuth } from "@/contexts/AuthContext";
import { API_BASE_URL } from "@/lib/api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CATEGORIES = [
  "Technology",
  "Artificial Intelligence",
  "Web Development",
  "Design & UX",
  "Startup & Business",
  "Productivity",
  "Data Science",
  "Cybersecurity",
  "Health & Wellness",
  "Finance & Crypto",
];

const CreateBlog = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const editBlog = location.state?.blog;
    const isEditMode = !!editBlog;

    const [title, setTitle] = useState(editBlog?.title || "");
    const [content, setContent] = useState(editBlog?.blog_content || "");
    const [tagInput, setTagInput] = useState("");
    const [tags, setTags] = useState<string[]>(editBlog?.tags || []);
    const [imageUrl, setImageUrl] = useState(editBlog?.blog_image || "");
    const [loading, setLoading] = useState(false);
    const [category, setCategory] = useState(editBlog?.category || "");
    const { user, isAuthenticated } = useAuth();

    useEffect(() => {
        if (!isAuthenticated) {
            toast.error("Please sign in to create a blog.");
            navigate("/signin");
        }
    }, [isAuthenticated, navigate]);

    const addTag = () => {
        const tag = tagInput.trim();
        if (tag && !tags.includes(tag) && tags.length < 5) {
            setTags([...tags, tag]);
            setTagInput("");
        }
    };

    const removeTag = (tag: string) => {
        setTags(tags.filter((t) => t !== tag));
    };

    const handleTagKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            e.preventDefault();
            addTag();
        }
    };

    const countWords = (str: string) => {
        return str.trim().split(/\s+/).filter(word => word.length > 0).length;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validation
        if (title.length < 5 || title.length > 100) {
            toast.error("Title must be between 5 and 100 characters.");
            return;
        }

        const wordCount = countWords(content);
        if (wordCount < 1 || wordCount > 500) {
            toast.error("Content must be between 1 and 500 words.");
            return;
        }

        if (!category.trim()) {
            toast.error("Please select a category.");
            return;
        }

        setLoading(true);
        try {
            const url = isEditMode ? `${API_BASE_URL}/blogs/update` : `${API_BASE_URL}/blogs`;
            const method = isEditMode ? "PUT" : "POST";
            const res = await fetch(url, {
                method,
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    ...(isEditMode && { id: editBlog.id }),
                    title,
                    blog_content: content,
                    tags,
                    blog_image: imageUrl,
                    category,
                    author_id: user?.id,
                }),
                credentials: "include",
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data?.message || `Failed to ${isEditMode ? "update" : "publish"} blog.`);
            }

            toast.success(isEditMode ? "Blog updated successfully!" : "Blog published successfully!");
            navigate("/");
        } catch (err: any) {
            toast.error(err.message || `Failed to ${isEditMode ? "update" : "publish"} blog.`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-background">
            <Header />
            <div className="container mx-auto max-w-3xl px-4 py-10">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                >
                    <Button
                        variant="ghost"
                        size="sm"
                        className="mb-6 gap-2 text-muted-foreground"
                        onClick={() => navigate(-1)}
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Back
                    </Button>

                    <h1 className="font-display text-3xl font-bold text-foreground">
                        {isEditMode ? "Edit Story" : "Create a New Story"}
                    </h1>
                    <p className="mt-2 text-muted-foreground">
                        {isEditMode ? "Update your story details." : "Share your ideas with the world."}
                    </p>

                    <form onSubmit={handleSubmit} className="mt-8 space-y-6">
                        {/* Title */}
                        <div className="space-y-2">
                            <Label htmlFor="title">Title</Label>
                            <Input
                                id="title"
                                placeholder="Give your story a title..."
                                className="h-12 text-lg font-medium"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                required
                            />
                        </div>

                        {/* Category */}
                        <div className="space-y-2">
                            <Label>Category</Label>
                            <Select value={category} onValueChange={setCategory}>
                                <SelectTrigger className="h-11">
                                    <SelectValue placeholder="Select a category..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {CATEGORIES.map((cat) => (
                                        <SelectItem key={cat} value={cat}>
                                            {cat}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Cover Image URL */}
                        <div className="space-y-2">
                            <Label htmlFor="image">Cover Image URL</Label>
                            <div className="relative">
                                <Image className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    id="image"
                                    placeholder="https://example.com/image.jpg"
                                    className="h-11 pl-10"
                                    value={imageUrl}
                                    onChange={(e) => setImageUrl(e.target.value)}
                                />
                            </div>
                            {imageUrl && (
                                <div className="mt-2 overflow-hidden rounded-lg border border-border">
                                    <img
                                        src={imageUrl}
                                        alt="Cover preview"
                                        className="h-48 w-full object-cover"
                                        onError={(e) => {
                                            (e.target as HTMLImageElement).style.display = "none";
                                        }}
                                    />
                                </div>
                            )}
                        </div>

                        {/* Content */}
                        <div className="space-y-2">
                            <Label htmlFor="content">Content</Label>
                            <Textarea
                                id="content"
                                placeholder="Write your story here..."
                                className="min-h-[300px] text-base leading-relaxed"
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                required
                            />
                        </div>

                        {/* Tags */}
                        <div className="space-y-2">
                            <Label>Tags (up to 5)</Label>
                            <div className="flex gap-2">
                                <Input
                                    placeholder="Add a tag..."
                                    className="h-10"
                                    value={tagInput}
                                    onChange={(e) => setTagInput(e.target.value)}
                                    onKeyDown={handleTagKeyDown}
                                    disabled={tags.length >= 5}
                                />
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    className="h-10 px-4"
                                    onClick={addTag}
                                    disabled={tags.length >= 5 || !tagInput.trim()}
                                >
                                    Add
                                </Button>
                            </div>
                            {tags.length > 0 && (
                                <div className="flex flex-wrap gap-2 pt-1">
                                    {tags.map((tag) => (
                                        <Badge
                                            key={tag}
                                            variant="secondary"
                                            className="gap-1 pr-1.5"
                                        >
                                            {tag}
                                            <button
                                                type="button"
                                                onClick={() => removeTag(tag)}
                                                className="ml-1 rounded-full p-0.5 hover:bg-muted"
                                            >
                                                <X className="h-3 w-3" />
                                            </button>
                                        </Badge>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Submit */}
                        <div className="flex justify-end gap-3 pt-4">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => navigate(-1)}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" className="gap-2" disabled={loading}>
                                {loading ? (isEditMode ? "Updating..." : "Publishing...") : (isEditMode ? "Update Story" : "Publish Story")}
                                {!loading && <Send className="h-4 w-4" />}
                            </Button>
                        </div>
                    </form>
                </motion.div>
            </div>
        </div>
    );
};

export default CreateBlog;
