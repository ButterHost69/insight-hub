FROM python:3.14-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libc-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev
COPY . .
CMD ["uv", "run", "python", "main.py"]