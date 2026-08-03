# Production image for the AI Greenhouse Customer Portal.
#
# The runtime stage carries only the built static assets and the Nginx runtime
# configuration: no Node, no source, no dev dependencies, no lockfile, no
# secrets. The backend host is not baked into the bundle — it arrives at
# container start as GREENHOUSE_API_UPSTREAM.

# ---------------------------------------------------------------- dependencies
FROM node:24.18.1-alpine AS deps
WORKDIR /app
# Only the manifest and lockfile, so a source edit does not reinstall.
COPY package.json package-lock.json ./
RUN npm ci

# ----------------------------------------------------------------------- gates
# Format, lint, strict typecheck and the unit/component suite run here, so an
# image cannot be produced from code that does not pass them.
FROM deps AS test
WORKDIR /app
COPY . .
RUN npm run format:check \
 && npm run lint \
 && npm run typecheck \
 && npm run test

# ----------------------------------------------------------------------- build
FROM deps AS build
WORKDIR /app
COPY . .
RUN npm run build

# --------------------------------------------------------------------- runtime
FROM nginxinc/nginx-unprivileged:1.31.2-alpine AS runtime

# The image already runs as the unprivileged `nginx` user (UID 101) and listens
# on 8080, so no root-owned step and no privileged port is involved.
USER root
RUN rm -rf /usr/share/nginx/html/* /etc/nginx/conf.d/default.conf
USER nginx

# Rendered by the base image's entrypoint at start-up. The filter limits
# substitution to our own variable so Nginx's own $-variables survive.
COPY --chown=nginx:nginx docker/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build --chown=nginx:nginx /app/dist /usr/share/nginx/html

ENV NGINX_ENVSUBST_FILTER=GREENHOUSE_API_UPSTREAM \
    NGINX_ENVSUBST_OUTPUT_DIR=/etc/nginx/conf.d \
    GREENHOUSE_API_UPSTREAM=http://host.docker.internal:8000

EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --spider --tries=1 http://127.0.0.1:8080/healthz || exit 1
