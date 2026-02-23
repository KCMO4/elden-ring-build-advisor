FROM node:22-alpine AS base
WORKDIR /app

# --- Dependencias ---
FROM base AS deps
COPY package*.json ./
RUN npm ci

# --- Desarrollo (Vite HMR) ---
FROM base AS dev
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev"]

# --- Build de producción ---
FROM deps AS builder
COPY . .
RUN npm run build

# --- Imagen de producción con nginx ---
FROM nginx:stable-alpine AS production
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
