# Build stage
FROM node:22-alpine AS builder
ARG VITE_API_URL=https://api.monitor.ericzapater.cat/api/v1
ENV VITE_API_URL=$VITE_API_URL

RUN npm install -g pnpm@10
WORKDIR /app

# Copy workspace definitions and lockfile for reproducible builds
COPY pnpm-lock.yaml* pnpm-workspace.yaml* package.json .npmrc* ./
COPY frontend/package.json ./frontend/

# Install dependencies deterministically
RUN pnpm install

# Copy frontend source code and build production bundle
COPY frontend ./frontend
RUN pnpm --filter frontend build

# Serve stage with nginx
FROM nginx:alpine
COPY --from=builder /app/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
