FROM node:22.23.1-bookworm-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --include=optional

COPY . .
RUN npm run build


FROM node:22.23.1-bookworm-slim AS runtime

RUN apt-get update && \
    apt-get install -y --no-install-recommends openjdk-17-jre-headless && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev --include=optional && npm cache clean --force

COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production \
    MISSI_STORAGE_ROOT=/data

RUN mkdir -p /data && chown node:node /data

USER node

EXPOSE 3000

CMD ["node", "dist/server.cjs"]
