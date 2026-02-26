FROM node:22-alpine AS base
WORKDIR /app

# --- Dependencias ---
FROM base AS deps
COPY package*.json ./
RUN npm ci

# --- Desarrollo (hot-reload con ts-node-dev) ---
FROM base AS dev
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3001
CMD ["npm", "run", "dev"]

# --- Build de producción ---
FROM deps AS builder
COPY . .
RUN npm run build

# --- Imagen de producción mínima ---
FROM base AS production
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/data ./dist/data
EXPOSE 3001
CMD ["node", "dist/index.js"]
