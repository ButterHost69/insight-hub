import json
import sys
import time
import argparse
from pathlib import Path

import requests
from dotenv import load_dotenv
from qdrant_client import QdrantClient

BENCHMARKS_DIR = Path(__file__).parent
EVAL_DATASET_PATH = BENCHMARKS_DIR / "eval_dataset.json"
ALL_BLOGS_PATH = BENCHMARKS_DIR / "all_blogs.json"

VALID_CATEGORIES = [
    "Technology", "Travelling", "Food", "Education", "Sports",
    "Entertainment", "Fashion", "Lifestyle", "Art & Photography",
    "Health & Wellness", "Finance & Crypto", "Other",
]


class LoadDataset:
    def __init__(self, backend_url: str, qdrant_url: str, qdrant_collection: str):
        self.backend_url = backend_url.rstrip("/")
        self.qdrant_url = qdrant_url
        self.qdrant_collection = qdrant_collection
        self.session = requests.Session()
        self.user_id = None
        self.user_email = None

    def register_user(self, email: str, password: str, username: str, full_name: str) -> bool:
        resp = self.session.post(
            f"{self.backend_url}/register",
            json={
                "email": email,
                "password": password,
                "username": username,
                "fullName": full_name,
            },
        )
        if resp.status_code == 200:
            data = resp.json()
            if data.get("success"):
                self.user_id = data.get("data", {}).get("id")
                self.user_email = email
                print(f"  Registered user: {username} (id={self.user_id})")
                return True
            else:
                print(f"  Registration failed: {data.get('message')}")
                return False
        elif resp.status_code == 400:
            msg = resp.json().get("message", "")
            if "already exists" in msg.lower():
                print(f"  User {email} already exists, proceeding to login...")
                return self.login_user(email, password)
            print(f"  Registration failed (400): {msg}")
            return False
        else:
            print(f"  Registration failed ({resp.status_code}): {resp.text[:200]}")
            return False

    def login_user(self, email: str, password: str) -> bool:
        resp = self.session.post(
            f"{self.backend_url}/login",
            json={"email": email, "password": password},
        )
        if resp.status_code == 200:
            data = resp.json()
            if data.get("success"):
                self.user_id = data.get("data", {}).get("id")
                self.user_email = email
                print(f"  Logged in as: {email} (id={self.user_id})")
                return True
            return False
        else:
            print(f"  Login failed ({resp.status_code}): {resp.text[:200]}")
            return False

    def create_blog(self, title: str, content: str, category: str, tags: list[str]) -> dict | None:
        payload = {
            "title": title,
            "blog_content": content,
            "category": category,
            "tags": tags,
            "author_id": self.user_email,
        }
        resp = self.session.post(f"{self.backend_url}/blogs", json=payload)

        if resp.status_code == 201:
            data = resp.json()
            if data.get("success"):
                blog_data = data.get("data", {})
                blog = blog_data.get("blog", blog_data)
                if isinstance(blog, dict):
                    return blog
                return {"id": blog_data.get("id"), "embed_id": blog_data.get("embed_id", "")}
        elif resp.status_code == 409:
            print(f"    Blog already exists: \"{title[:60]}\" — fetching existing...")
            return self._fetch_existing_blog(title)
        else:
            print(f"    Failed ({resp.status_code}): {resp.text[:200]}")
        return None

    def _fetch_existing_blog(self, title: str) -> dict | None:
        resp = self.session.get(f"{self.backend_url}/blogs")
        if resp.status_code == 200:
            data = resp.json()
            blogs = data.get("data", [])
            for blog in blogs:
                if blog.get("title") == title:
                    return blog
        return None

    def find_embed_id_in_qdrant(self, title: str, client: QdrantClient) -> str | None:
        search_results = client.scroll(
            collection_name=self.qdrant_collection,
            limit=100,
            with_payload=True,
        )
        for point in search_results[0]:
            payload = point.payload or {}
            text = payload.get("text", "")
            if title.lower() in text.lower():
                return str(point.id)

        points, _ = client.scroll(
            collection_name=self.qdrant_collection,
            limit=10000,
            with_payload=True,
        )
        for point in points:
            payload = point.payload or {}
            if payload.get("text", "").strip()[:80] == "":
                continue
        return None

    def load_and_create_blogs(self, max_per_question: int | None = None) -> dict[str, str]:
        with open(ALL_BLOGS_PATH) as f:
            all_blogs = json.load(f)

        title_to_embed_id: dict[str, str] = {}
        total = 0
        created = 0
        skipped = 0
        failed = 0

        print(f"\n{'='*60}")
        print(f"LOADING BLOGS INTO BACKEND")
        print(f"{'='*60}")

        for question_data in all_blogs:
            blogs = question_data["blogs"]
            if max_per_question:
                blogs = blogs[:max_per_question]

            for blog in blogs:
                total += 1
                title = blog["title"]
                content = blog["blog_content"]
                category = blog.get("category", "Other")
                tags = blog.get("tags", [])

                if category not in VALID_CATEGORIES:
                    category = "Other"

                word_count = len(content.split())
                if word_count > 500:
                    words = content.split()[:490]
                    content = " ".join(words) + "..."
                    print(f"    Truncated \"{title[:50]}\" from {word_count} to ~500 words")

                print(f"  [{total}] Creating: \"{title[:60]}\"...")

                result = self.create_blog(
                    title=title,
                    content=content,
                    category=category,
                    tags=tags,
                )

                if result:
                    embed_id = result.get("embed_id", "")
                    blog_id = result.get("id", "")
                    title_to_embed_id[title] = embed_id
                    if embed_id:
                        print(f"    OK — embed_id={embed_id}")
                        created += 1
                    else:
                        print(f"    OK — id={blog_id} (no embed_id returned yet)")
                        created += 1
                else:
                    print(f"    FAILED: \"{title[:60]}\"")
                    failed += 1

        print(f"\n  Total: {total}, Created: {created}, Failed: {failed}")
        return title_to_embed_id

    def fetch_embed_ids_from_qdrant(self) -> dict[str, str]:
        print(f"\n{'='*60}")
        print(f"FETCHING EMBED IDS FROM QDRANT")
        print(f"{'='*60}")

        client = QdrantClient(url=self.qdrant_url)

        if not client.collection_exists(self.qdrant_collection):
            print(f"  Collection '{self.qdrant_collection}' does not exist!")
            return {}

        collection_info = client.get_collection(self.qdrant_collection)
        total_points = collection_info.points_count
        print(f"  Collection has {total_points} points")

        points, _ = client.scroll(
            collection_name=self.qdrant_collection,
            limit=total_points + 100,
            with_payload=True,
        )

        title_to_embed_id: dict[str, str] = {}
        for point in points:
            payload = point.payload or {}
            text = payload.get("text", "")
            point_id = str(point.id)

            with open(ALL_BLOGS_PATH) as f:
                all_blogs = json.load(f)

            for question_data in all_blogs:
                for blog in question_data["blogs"]:
                    blog_title = blog["title"]
                    blog_content = blog["blog_content"]
                    first_80 = blog_content[:80].strip()
                    if first_80 in text or blog_title.lower() in text.lower():
                        title_to_embed_id[blog_title] = point_id

        print(f"  Matched {len(title_to_embed_id)} blogs to Qdrant points")
        return title_to_embed_id

    def fetch_embed_ids_from_backend(self) -> dict[str, str]:
        print(f"\n{'='*60}")
        print(f"FETCHING BLOGS FROM BACKEND API")
        print(f"{'='*60}")

        resp = self.session.get(f"{self.backend_url}/blogs")
        if resp.status_code != 200:
            print(f"  Failed to fetch blogs: {resp.status_code}")
            return {}

        data = resp.json()
        blogs = data.get("data", [])
        print(f"  Fetched {len(blogs)} blogs from backend")

        title_to_embed_id: dict[str, str] = {}
        for blog in blogs:
            title = blog.get("title", "")
            embed_id = blog.get("embed_id", "")
            if title and embed_id:
                title_to_embed_id[title] = embed_id

        print(f"  Found {len(title_to_embed_id)} blogs with embed_ids")
        return title_to_embed_id

    def resolve_embed_ids(
        self,
        from_backend: dict[str, str],
        from_qdrant: dict[str, str],
    ) -> dict[str, str]:
        resolved = {}
        resolved.update(from_backend)
        for title, embed_id in from_qdrant.items():
            if title not in resolved:
                resolved[title] = embed_id
        return resolved

    def update_json_files(self, title_to_embed_id: dict[str, str]):
        print(f"\n{'='*60}")
        print(f"UPDATING JSON FILES WITH RESOLVED EMBED IDS")
        print(f"{'='*60}")

        with open(ALL_BLOGS_PATH) as f:
            all_blogs = json.load(f)

        with open(EVAL_DATASET_PATH) as f:
            eval_data = json.load(f)

        all_blogs_updated = 0
        for question_data in all_blogs:
            for blog in question_data["blogs"]:
                title = blog["title"]
                embed_id = blog.get("embed_id", "")
                if not embed_id or embed_id.startswith("ml-") or embed_id.startswith("bc-") or embed_id.startswith("cc-") or embed_id.startswith("med-") or embed_id.startswith("trv-"):
                    new_id = title_to_embed_id.get(title, "")
                    if new_id:
                        blog["embed_id"] = new_id
                        all_blogs_updated += 1
                    else:
                        print(f"    WARNING: No embed_id found for \"{title[:60]}\"")

        eval_updated = 0
        for question in eval_data["questions"]:
            new_relevant_ids = []
            new_relevant_titles = []
            for blog in question["blogs"]:
                title = blog["title"]
                embed_id = blog.get("embed_id", "")
                if not embed_id or embed_id.startswith("ml-") or embed_id.startswith("bc-") or embed_id.startswith("cc-") or embed_id.startswith("med-") or embed_id.startswith("trv-"):
                    new_id = title_to_embed_id.get(title, "")
                    if new_id:
                        blog["embed_id"] = new_id
                        eval_updated += 1
                    else:
                        print(f"    WARNING: No embed_id found for \"{title[:60]}\"")

                resolved_id = title_to_embed_id.get(title, blog.get("embed_id", ""))
                if blog.get("is_relevant", False) and resolved_id:
                    new_relevant_ids.append(resolved_id)
                    new_relevant_titles.append(title)

            if new_relevant_ids:
                question["relevant_doc_ids"] = new_relevant_ids
                question["relevant_doc_titles"] = new_relevant_titles

        with open(ALL_BLOGS_PATH, "w") as f:
            json.dump(all_blogs, f, indent=2)
            f.write("\n")

        with open(EVAL_DATASET_PATH, "w") as f:
            json.dump(eval_data, f, indent=2)
            f.write("\n")

        print(f"  Updated {all_blogs_updated} embed_ids in all_blogs.json")
        print(f"  Updated {eval_updated} embed_ids in eval_dataset.json")
        print(f"  Updated relevant_doc_ids for {len(eval_data['questions'])} questions")


def main():
    parser = argparse.ArgumentParser(
        description="Load benchmark blogs into the backend and resolve embed IDs",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Register a new test user and load all blogs
  python -m benchmarks.load_dataset --register

  # Use an existing test user
  python -m benchmarks.load_dataset --email test@example.com --password Test@1234

  # Skip blog creation, only resolve embed IDs from existing data
  python -m benchmarks.load_dataset --skip-create --email test@example.com --password Test@1234
        """,
    )

    parser.add_argument("--backend-url", type=str, default="http://localhost:6969",
                        help="Backend API URL")
    parser.add_argument("--qdrant-url", type=str, default="http://localhost:6333",
                        help="Qdrant URL")
    parser.add_argument("--qdrant-collection", type=str, default="blog_posts",
                        help="Qdrant collection name")
    parser.add_argument("--email", type=str, default="benchmarker@insighthub.test",
                        help="Test user email")
    parser.add_argument("--password", type=str, default="Bench@1234",
                        help="Test user password")
    parser.add_argument("--username", type=str, default="benchmarker",
                        help="Test user username")
    parser.add_argument("--fullname", type=str, default="Benchmark User",
                        help="Test user full name")
    parser.add_argument("--register", action="store_true",
                        help="Register a new user (instead of logging in)")
    parser.add_argument("--skip-create", action="store_true",
                        help="Skip blog creation, only resolve embed IDs from existing data")
    parser.add_argument("--max-per-question", type=int, default=None,
                        help="Max blogs to create per question (default: all)")
    parser.add_argument("--wait", type=float, default=2.0,
                        help="Seconds to wait between blog creations (for embedding pipeline)")

    args = parser.parse_args()

    loader = LoadDataset(
        backend_url=args.backend_url,
        qdrant_url=args.qdrant_url,
        qdrant_collection=args.qdrant_collection,
    )

    if not args.skip_create:
        print(f"{'='*60}")
        print(f"AUTHENTICATING")
        print(f"{'='*60}")
        print(f"  Backend URL: {args.backend_url}")

        if args.register:
            success = loader.register_user(
                email=args.email,
                password=args.password,
                username=args.username,
                full_name=args.fullname,
            )
        else:
            success = loader.login_user(email=args.email, password=args.password)

        if not success:
            print("  Trying to register instead...")
            success = loader.register_user(
                email=args.email,
                password=args.password,
                username=args.username,
                full_name=args.fullname,
            )

        if not success:
            print("  Authentication failed. Exiting.")
            sys.exit(1)

        title_to_embed_id_create = loader.load_and_create_blogs(
            max_per_question=args.max_per_question
        )

        print(f"\n  Waiting {args.wait}s for async embedding pipeline...")
        time.sleep(args.wait)
    else:
        title_to_embed_id_create = {}
        print("  Skipping blog creation (--skip-create)")

    title_to_embed_id_backend = loader.fetch_embed_ids_from_backend()
    title_to_embed_id_qdrant = loader.fetch_embed_ids_from_qdrant()

    title_to_embed_id = loader.resolve_embed_ids(
        title_to_embed_id_backend,
        title_to_embed_id_qdrant,
    )

    print(f"\n  Total resolved embed IDs: {len(title_to_embed_id)}")
    for title, eid in sorted(title_to_embed_id.items()):
        print(f"    {eid[:12]}... — {title[:50]}")

    if not title_to_embed_id:
        print("\n  WARNING: No embed IDs resolved! Blogs may not have been embedded yet.")
        print("  Check that the ai-ask worker is running and Qdrant is accessible.")

    loader.update_json_files(title_to_embed_id)

    print(f"\n{'='*60}")
    print(f"DONE! JSON files updated with resolved embed IDs.")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()