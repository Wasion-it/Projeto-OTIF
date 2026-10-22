# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------------
# OTIF frontend (React + Vite) - build multi-stage.
#   Node (npm ci + npm run build)  ->  Nginx nao-root servindo dist/ estatico.
# O Vite dev server NAO e usado em runtime.
# ---------------------------------------------------------------------------

# ---- Stage 1: build ----
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

# URL base da API embutida no bundle. Vazio (padrao) = chamadas relativas na
# mesma origem, atendidas pelo proxy reverso do Nginx (veja nginx.conf).
# Informe uma URL absoluta apenas se a API ficar em outra origem.
ARG VITE_API_URL=""
ENV VITE_API_URL=${VITE_API_URL}

RUN npm run build

# ---- Stage 2: runtime ----
FROM nginxinc/nginx-unprivileged:1.30.5-alpine3.24 AS runtime

# Origem do backend usada pelo proxy (envsubst no template em runtime).
ENV BACKEND_UPSTREAM=http://otif-backend:8000
# DNS para resolver o backend em runtime (DNS embutido do Docker/Swarm).
ENV NGINX_RESOLVER=127.0.0.11

COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
