FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY src ./src
COPY public ./public
COPY index.html floating-panel.html tsconfig*.json vite.config.ts ./
COPY scripts ./scripts
ARG VITE_API_URL=http://localhost:3210
ENV VITE_API_URL=$VITE_API_URL
RUN npm run package:extension
COPY server/package*.json ./server/
WORKDIR /app/server
RUN npm ci
COPY server/prisma ./prisma
COPY server/prisma.config.ts server/tsconfig.json ./
COPY server/src ./src
RUN npm run generate && npm run build

FROM node:22-bookworm-slim
ARG APP_REVISION=unknown
ENV APP_REVISION=$APP_REVISION
LABEL org.opencontainers.image.revision=$APP_REVISION
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app/server
COPY --from=build /app/server ./
COPY --from=build /app/dist /app/web
ENV NODE_ENV=production PORT=3210 STATIC_DIR=/app/web
USER node
EXPOSE 3210
CMD ["sh", "-c", "npm run migrate:deploy && npm start"]
