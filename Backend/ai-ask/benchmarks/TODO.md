- [ ] Find the route cause of the 5s delay in the fetch blog http request
(The reason why the pipeline is so damn slow)

- [ ] Squeeze the Final RAG prompt below 8K context. Right now because top 3 blogs are sent the free groq api tokem limits are hit.

(Proposed Solution: 1. Make Summary of the blogs(relevant to main question), also chunk the blog in the vector db (so only relevant parts of the blogs are fetched)


