# Panta Terminal backend — multi-stage Rust build
FROM rust:1-bookworm AS build
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY crates ./crates
RUN cargo build --release -p panta-terminal-server

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/target/release/panta-terminal-server /app/server
ENV PORT=8080
EXPOSE 8080
# DATABASE_URL defaults to sqlite://panta-terminal.db (volume-mount /app for persistence)
CMD ["/app/server"]
