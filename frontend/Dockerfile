# Web image for local Docker Compose. Render's Static Site does not use it: it runs
# `npm run build` itself, so the build must also work outside Docker.

# ---- Stage 1: Node compiles the React + TypeScript app into static files (dist/) ----
FROM node:22-alpine AS build
WORKDIR /src

# Dependencies change less often than the code: this layer stays cached until the lockfile changes
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# Public, baked into the JavaScript. Empty = same origin (nginx below proxies /api)
ARG VITE_API_BASE_URL=
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

# ---- Stage 2: only nginx and the built files; no Node, no node_modules, no source ----
FROM nginx:1.29-alpine

# Where /api is proxied to (the Compose service name) and: fill NGINX_LOCAL_RESOLVERS from
# /etc/resolv.conf at start-up, so nginx can look the api service up by name
ENV API_UPSTREAM=http://api:8000 \
    NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1

COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /src/dist /usr/share/nginx/html

EXPOSE 80
