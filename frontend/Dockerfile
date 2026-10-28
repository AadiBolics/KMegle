# ---- deps ----
# Install dependencies in their own layer so they're cached across builds.
FROM node:20-alpine AS deps

WORKDIR /app

COPY package*.json ./
RUN npm ci

# ---- builder ----
# Build the Next.js app using the standalone output target
# (output: "standalone" in next.config.ts).
FROM node:20-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Declare Build Arguments so Docker Compose can pass .env variables
# into the build process.
ARG NEXT_PUBLIC_BACKEND_URL
ENV NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL

RUN npm run build

# ---- runner ----
# Slim runtime image: only the standalone server output, public assets,
# and the build's static assets — no full node_modules or source tree.
FROM node:20-alpine AS runner

ENV NODE_ENV=production

WORKDIR /app

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Use a non-root user for better security (Best Practice)
USER node

EXPOSE 3000

CMD ["node", "server.js"]
