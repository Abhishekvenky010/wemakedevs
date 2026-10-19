# syntax=docker/dockerfile:1

# ---- Build stage ---------------------------------------------------------
FROM rust:1.90-slim-bookworm AS builder

WORKDIR /app

# native-tls (reqwest) needs OpenSSL headers at build time.
RUN apt-get update \
    && apt-get install -y --no-install-recommends pkg-config libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Cache dependencies first so source edits don't rebuild the whole tree.
COPY Cargo.toml Cargo.lock ./
RUN mkdir -p src \
    && echo 'fn main() {}' > src/main.rs \
    && cargo build --release --locked \
    && rm -rf src

# Real sources.
COPY src ./src
RUN touch src/main.rs && cargo build --release --locked

# ---- Runtime stage -------------------------------------------------------
FROM debian:bookworm-slim AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libssl3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/target/release/risk_agent_backend /usr/local/bin/risk_agent_backend

ENV PORT=8080
EXPOSE 8080

# Render sets PORT; main.rs binds 0.0.0.0:$PORT.
CMD ["risk_agent_backend"]
