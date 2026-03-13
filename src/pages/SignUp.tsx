import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { motion } from "framer-motion";
import { Eye, EyeOff, Mail, Lock, User, AtSign, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { API_BASE_URL } from "@/lib/api";
import SocialLoginButtons from "@/components/auth/SocialLoginButtons";

const SignUp = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    fullName: "",
    username: "",
    email: "",
    password: "",
  });

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const isPasswordValid = (password: string) =>
    /^(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{8,}$/.test(password);

  const passwordStrength = (() => {
    const p = form.password;
    if (p.length === 0) return { label: "", width: "0%", color: "" };
    let score = 0;
    if (p.length >= 8) score++;
    if (/[A-Z]/.test(p)) score++;
    if (/[0-9]/.test(p)) score++;
    if (/[^A-Za-z0-9]/.test(p)) score++;
    const map = [
      { label: "Weak", width: "25%", color: "bg-destructive" },
      { label: "Fair", width: "50%", color: "bg-orange-500" },
      { label: "Good", width: "75%", color: "bg-yellow-500" },
      { label: "Strong", width: "100%", color: "bg-green-500" },
    ];
    return map[Math.min(score, 4) - 1] || map[0];
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Frontend validation: username length and password strength
    if (form.username.length < 3 || form.username.length > 20) {
      toast.error("Username must be between 3 and 20 characters.");
      return;
    }
    if (!isPasswordValid(form.password)) {
      toast.error(
        "Password must be at least 8 characters and include one uppercase letter and one special character."
      );
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          fullName: form.fullName,
          username: form.username,
          email: form.email,
          password: form.password,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data?.message || "Failed to create account");
      }

      login({
        id: data.data?.id,
        email: data.data?.email || form.email,
        username: data.data?.username || form.username,
        fullName: data.data?.fullName || form.fullName
      });
      toast.success(data.message || "Account created successfully.");
      navigate("/");
    } catch (err: any) {
      toast.error(err.message || "Something went wrong while creating your account.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = (data: any) => {
    login({
      id: data.data?.user?.id,
      email: data.data?.user?.email,
      username: data.data?.user?.username,
      fullName: data.data?.user?.fullName,
    }, true);
    toast.success("Google Sign-Up successful!");
    navigate("/");
  };

  return (
    <div className="flex min-h-screen">
      {/* Left - Branding Panel */}
      <div className="hidden flex-1 items-center justify-center bg-primary/5 lg:flex">
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
          className="max-w-md px-12"
        >
          <Link to="/" className="mb-10 flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
              <span className="font-display text-xl font-bold text-primary-foreground">I</span>
            </div>
            <span className="font-display text-2xl font-bold text-foreground">Inkwell</span>
          </Link>
          <h2 className="font-display text-3xl font-bold leading-tight text-foreground">
            Start sharing your <span className="text-gradient">story today.</span>
          </h2>
          <p className="mt-4 text-muted-foreground">
            Create an account and join a community of passionate writers and thinkers.
          </p>
          <div className="mt-8 space-y-3">
            {["Write & publish articles", "Build your audience", "Engage with readers"].map((t) => (
              <div key={t} className="flex items-center gap-3 text-sm text-muted-foreground">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10">
                  <ArrowRight className="h-3 w-3 text-primary" />
                </div>
                {t}
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Right - Sign Up Form */}
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          {/* Mobile Logo */}
          <Link to="/" className="mb-8 flex items-center gap-2 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <span className="font-display text-lg font-bold text-primary-foreground">I</span>
            </div>
            <span className="font-display text-xl font-bold text-foreground">Inkwell</span>
          </Link>

          <h1 className="font-display text-3xl font-bold text-foreground">Create an account</h1>
          <p className="mt-2 text-muted-foreground">Fill in your details to get started</p>

          {/* Social Login */}
          <div className="mt-8">
            <SocialLoginButtons
              type="signup"
              loading={loading}
              setLoading={setLoading}
              onSuccess={handleGoogleSuccess}
            />
          </div>

          <div className="my-6 flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground">or sign up with email</span>
            <Separator className="flex-1" />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="fullName"
                    placeholder="John Doe"
                    className="h-11 pl-10"
                    value={form.fullName}
                    onChange={(e) => update("fullName", e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <div className="relative">
                  <AtSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="username"
                    placeholder="johndoe"
                    className="h-11 pl-10"
                    value={form.username}
                    onChange={(e) => update("username", e.target.value)}
                    required
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="signupEmail">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="signupEmail"
                  type="email"
                  placeholder="you@example.com"
                  className="h-11 pl-10"
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="signupPassword">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="signupPassword"
                  type={showPassword ? "text" : "password"}
                  placeholder="Min. 8 characters"
                  className="h-11 pl-10 pr-10"
                  value={form.password}
                  onChange={(e) => update("password", e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {form.password.length > 0 && (
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full transition-all ${passwordStrength.color}`}
                      style={{ width: passwordStrength.width }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">{passwordStrength.label}</span>
                </div>
              )}
            </div>

            {/* Password validation message */}
            {form.password.length > 0 && (
              <p
                className={`text-xs ${isPasswordValid(form.password) ? "text-green-500" : "text-destructive"
                  }`}
              >
                {isPasswordValid(form.password)
                  ? "Password looks good."
                  : "Password must be at least 8 characters and include one uppercase letter and one special character."}
              </p>
            )}

            <Button type="submit" className="h-11 w-full gap-2" disabled={loading}>
              {loading ? "Creating account…" : "Create Account"}
              {!loading && <ArrowRight className="h-4 w-4" />}
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              By signing up, you agree to our{" "}
              <a href="#" className="text-primary hover:underline">Terms</a> and{" "}
              <a href="#" className="text-primary hover:underline">Privacy Policy</a>.
            </p>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link to="/signin" className="font-medium text-primary hover:underline">
              Sign In
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default SignUp;
