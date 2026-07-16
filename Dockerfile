FROM node:18-bullseye-slim AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:18-bullseye-slim AS runtime

# Install Java 17 for Minecraft server compatibility
RUN apt-get update && \
    apt-get install -y openjdk-17-jre-headless && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist

# We will use /data as the storage root
ENV MISSI_STORAGE_ROOT=/data
RUN mkdir -p /data && chown node:node /data

USER node

EXPOSE 3000

CMD ["npm", "start"]
