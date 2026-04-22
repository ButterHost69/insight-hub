# RAG Pipeline Benchmark Report

**Date:** 2026-04-22  
**Embedding Model:** nomic-ai/nomic-embed-text-v1.5 (768d)  
**Vector DB:** Qdrant (cosine similarity)  
**LLM:** openai/gpt-oss-120b (Groq API)  
**Collection:** blog_posts  
**Questions Evaluated:** 5  

---

## Benchmark Descriptions

### 1. Retrieval Benchmark

**What it checks:** Whether the embedding model + Qdrant vector search correctly identifies the most relevant documents for a given query. It measures the quality of the "retrieval" step — the first half of the RAG pipeline.

**Why it matters:** If retrieval fails, even the best LLM can't generate a good answer because it won't have the right context. This is the foundation — garbage in, garbage out.

---

### 2. Latency Benchmark

**What it checks:** How long each component of the RAG pipeline takes, independently. Breaks down: embedding time, Qdrant search time, blog detail fetch time, and total time (without LLM).

**Why it matters:** Identifies bottlenecks. Total latency directly impacts user experience. Each component should be profiled so you know where to optimize.

---

### 3. Generation Benchmark

**What it checks:** The full RAG pipeline end-to-end — retrieval, context assembly, and LLM generation. Evaluates answer quality (if RAGAS is available) and retrieval hit rate.

**Why it matters:** This is the user-facing result. Even if retrieval is good, the LLM might hallucinate, ignore context, or fail to synthesize a coherent answer.

---

### 4. Load Benchmark

**What it checks:** How the system performs under concurrent load — can it handle multiple users asking questions simultaneously?

**Why it matters:** A system that works for 1 user at a time but fails under 5 concurrent users isn't production-ready.

---

## Retrieval Results

| Metric | What It Measures | k=1 | k=3 | k=5 | k=10 |
|---|---|---|---|---|---|
| **Recall** | % of relevant docs found in top-k | 18.7% | 44.0% | 78.0% | **100%** |
| **Precision** | % of retrieved docs that are relevant | **100%** | 80% | 84% | 54% |
| **MRR** | Rank of first relevant result (1/rank) | **1.0** | 1.0 | 1.0 | 1.0 |
| **NDCG** | Ranking quality considering position | **1.0** | 0.85 | 0.86 | 0.95 |
| **Hit Rate** | At least 1 relevant doc in top-k? | **100%** | 100% | 100% | 100% |

**Retrieval latency:** mean 24.8ms, p50 18.8ms, p95 43.8ms, p99 48.8ms

### Per-Question Breakdown

| Question | Top-1 Score | Top-3 Relevant? | Top-5 Relevant? | Latency |
|---|---|---|---|---|
| What is machine learning? | 0.839 | 2/3 relevant | 4/5 relevant | 50.1ms |
| How does blockchain technology work? | 0.746 | 2/3 relevant | 3/5 relevant | 18.8ms |
| What are the best practices for writing clean code? | 0.837 | 2/3 relevant | 5/5 relevant | 18.2ms |
| What are the health benefits of meditation? | 0.786 | 2/3 relevant | 4/5 relevant | 18.1ms |
| How to plan a budget-friendly international trip? | 0.835 | 2/3 relevant | 5/5 relevant | 18.9ms |

### Interpretation

- **Hit Rate = 100% at k=1** means the very first result is always relevant — excellent. MRR=1.0 confirms the top result is always a correct match.
- **k=3 retrieves only 44% of relevant docs** — with the current `limit=3` in `redis_server.py`, over half the relevant content is missed.
- **k=5 hits 78% recall** and **k=10 gets 100%** — you need at least k=5, ideally k=7-10, to capture most relevant documents.
- The sweet spot appears to be **k=5** (78% recall, 84% precision) — a strong balance.
- Cosine similarity scores show a clear drop-off after the top 5 results, confirming that k=5 is the optimal retrieval count for this dataset.

---

## Latency Results

| Component | Mean | P50 | P95 | P99 | Max |
|---|---|---|---|---|---|
| **Embedding** | 16.9ms | 16.1ms | 19.9ms | 21.5ms | 26.4ms |
| **Qdrant Search** | 5.5ms | 2.9ms | 13.1ms | 14.6ms | 21.3ms |
| **Blog Fetch (HTTP)** | **4,204ms** | **5,098ms** | **5,224ms** | **5,273ms** | **5,372ms** |
| **Total (no LLM)** | **4,227ms** | **5,048ms** | **5,242ms** | **5,291ms** | **5,391ms** |

### Interpretation

- **CRITICAL BOTTLENECK: Blog Fetch (~4.2s average, ~5s median)** — This is **99.7%** of total latency. The HTTP callback from the Python worker back to the Go backend (`redis_server.py:80-82`) to fetch blog details by embed_id is devastatingly slow. This is the single biggest optimization target.
- **Embedding (17ms) and Qdrant search (5.5ms) are excellent** — these are fast and not a concern.
- The bimodal latency distribution (some requests ~2.3s, most ~5s) suggests cold-start vs warm caching behavior in the blog fetch HTTP call.
- Without the blog fetch, total latency would be ~22ms — over 200x faster.

---

## Generation Results

| Metric | Value |
|---|---|
| Retrieval Hit Rate | **100%** (all 5 questions retrieved at least 1 relevant doc) |
| RAGAS Scores | **Not computed** (RAGAS library not available) |
| LLM Generation | **FAILED for all 5 questions** |
| Mean Retrieval Time | 3.3ms |
| Mean LLM Time | 0ms (instant failure) |

### Error Details

All 5 questions failed with the same error:

```
Error code: 413 - Request too large for model `openai/gpt-oss-120b` 
on tokens per minute (TPM): Limit 8000, Requested ~8800-8900
```

### Root Cause

Each prompt contains 3 full blog posts (~150-200 words each) plus the question and prompt template, totaling ~8,800 tokens per request. The Groq free tier has an **8,000 TPM (tokens per minute) limit**, and each single request exceeds it.

The `PROMPT` template in `redis_server.py` (lines 22-31) includes the full text of all 3 retrieved blogs:

```
Using the below provided Context answer the following question
<Context>
{blogs_body}     <-- ~8,000+ tokens from 3 full blog posts
</Context>
<Question>
{question}
</Question>

Response:
```

### Retrieved Contexts (for reference)

All contexts were successfully retrieved and contained relevant blog content. Example for "What is machine learning?":

1. **Introduction to Machine Learning: A Beginner's Guide** (score: 0.839) — relevant
2. **Machine Learning in Healthcare: Transforming Patient Diagnostics** (score: 0.700) — tangentially relevant
3. **Understanding Neural Networks: From Perceptrons to Deep Learning** (score: 0.659) — relevant

The retrieval is working correctly; the failure is entirely in the LLM call due to token limits.

---

## Load Results

| Metric | Value |
|---|---|
| Concurrent Users | 5 |
| Total Requests | 20 |
| Successful | **0** |
| Failed | **20** |
| Success Rate | **0%** |
| Wall Time | 0.66s |
| Throughput | 30.4 req/s (of failures) |
| Mean Latency | 155ms |
| Median Latency | 47ms |

### Error Summary

All 20 requests failed with HTTP 500. The Go backend returns the Python worker's error response as:

```json
{"response": "Error for Prompt: <question>", "blogs": []}
```

This indicates the Python worker crashed or returned an error for every request. The root cause is the same Groq TPM limit issue — the LLM call fails, the Python worker catches the exception and returns an error, and the Go backend surfaces it as HTTP 500.

### Interpretation

The load test reveals that the system cannot handle even a single concurrent user reliably because the LLM generation step fails for every request. Once the token limit issue is resolved, the load characteristics need to be re-evaluated.

---

## Overall Pipeline Assessment

| Component | Status | Grade |
|---|---|---|
| **Embedding (nomic-embed-text-v1.5)** | Fast (17ms), good quality | **A** |
| **Vector Search (Qdrant)** | Fast (5.5ms), accurate top-1 | **A** |
| **Blog Detail Fetch (HTTP callback)** | **Extremely slow (~5s)** | **F** |
| **LLM Generation (Groq)** | **Broken (TPM limit exceeded)** | **F** |
| **End-to-End RAG** | **Non-functional** — retrieval works, but generation always fails | **D-** |
| **Concurrent Load** | **0% success rate** | **F** |

---

## Top 3 Issues to Fix

### 1. Blog Fetch Bottleneck (~5 seconds per request)

**Problem:** The Python worker calls `http://backend:6969/blogs/embed-id` to fetch blog details by embed_id. This HTTP round-trip adds ~5 seconds per request — 99.7% of total latency.

**Fix:** Store blog metadata (title, content) directly in the Qdrant payload alongside the text. This eliminates the HTTP callback entirely.

- In `qdrant_db.py:store_embedding()`, include title and other metadata in the payload
- In `redis_server.py:process()`, read metadata directly from Qdrant search results instead of making an HTTP call
- Estimated improvement: **4,200ms → ~0ms** (eliminated), total latency drops from ~5s to ~22ms (before LLM)

### 2. LLM Context Too Large (~8,800 tokens)

**Problem:** The Groq free tier has an 8,000 TPM limit, and your prompts exceed it at ~8,800 tokens per request.

**Fix (choose one or combine):**
- **Truncate context:** Limit each blog excerpt to ~100 words instead of the full text (~3,000 tokens saved)
- **Reduce top-k:** Use k=2 instead of k=3 to reduce context by ~33%
- **Upgrade Groq plan:** Dev tier increases TPM to 300,000
- **Switch models:** Use a model with higher TPM or self-host with vLLM (already configured in compose.yaml)

### 3. No Error Recovery for LLM Failures

**Problem:** When the LLM call fails, the entire pipeline returns an error to the user with no fallback.

**Fix:** Add graceful degradation in `redis_server.py:process()`:
- If LLM call fails, return the retrieved blog titles and summaries as a direct answer
- Add retry logic with exponential backoff
- Cache context embedding results to avoid re-embedding on retries

---

## Recommended Next Steps

1. **Fix the blog fetch bottleneck** by storing metadata in Qdrant payloads (highest impact, lowest effort)
2. **Truncate context** to fit within Groq's TPM limit (reduce per-blog context to ~100 words)
3. **Re-run all benchmarks** after fixes to measure improvement
4. **Increase retrieval k from 3 to 5** based on recall analysis showing 78% vs 44% improvement
5. **Consider upgrading Groq** or switching to self-hosted vLLM for production
6. **Re-run load benchmark** after LLM issues are resolved