# ── Stage 1: Build React client ─────────────────────────────────────
FROM node:20-alpine AS client-builder
ARG VITE_GOOGLE_CLIENT_ID
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ── Stage 2: Build & run server ──────────────────────────────────────
FROM node:20-alpine
WORKDIR /app/server

# Install all deps (includes prisma CLI + ts compiler for generate/build)
COPY server/package*.json ./
RUN npm ci

# Copy source + generate Prisma client + compile TypeScript
COPY server/ ./
RUN npx prisma generate
RUN npm run build

# Copy built React client so Express can serve it
COPY --from=client-builder /app/client/dist /app/client/dist

EXPOSE 8000
CMD ["node", "dist/index.js"]
