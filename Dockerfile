# The API with the Rust simulation built in. Migrations run from the same image:
#   docker run --rm -e DATABASE_URL=... image npx --prefix apps/api prisma migrate deploy
FROM rust:1-bookworm AS native
WORKDIR /src
COPY packages/sim/Cargo.toml packages/sim/Cargo.lock packages/sim/build.rs ./
COPY packages/sim/src ./src
RUN cargo build --release --lib

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
COPY packages/sim/package.json packages/sim/
COPY packages/core/package.json packages/core/
COPY lab/package.json lab/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund
COPY config config
COPY packages/sim/src packages/sim/src
COPY packages/core/src packages/core/src
COPY apps/api apps/api
COPY --from=native /src/target/release/libipe_sim.so /tmp/libipe_sim.so
RUN mkdir -p packages/sim/native && cp /tmp/libipe_sim.so "packages/sim/native/ipe_sim.linux-$(node -p process.arch).node" \
 && cd apps/api && npx prisma generate

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production IPE_REQUIRE_RUST=1 PORT=8080
COPY --from=build /app /app
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://localhost:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/api/src/server.ts"]
