FROM node:18-alpine

# Create app directory
WORKDIR /app

# Install minimal packages for runtime
RUN apk add --no-cache bash ca-certificates

# Copy repository into image (build with context at repo root)
COPY . /app

# Ensure entrypoint is executable and install production deps
RUN chmod +x /app/backend/strategy/docker/entrypoint.sh \
    && npm ci --only=production --no-audit --no-fund

# Create a non-root user
RUN addgroup -S cts && adduser -S -G cts cts
RUN chown -R cts:cts /app
USER cts

ENV NODE_ENV=production

# Use the entrypoint wrapper which launches run-worker
ENTRYPOINT ["/bin/bash", "/app/backend/strategy/docker/entrypoint.sh"]
CMD ["/run/payload.json"]
