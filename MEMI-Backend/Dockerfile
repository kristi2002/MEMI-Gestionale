FROM node:20-alpine

# Install curl for health checks
RUN apk add --no-cache curl

WORKDIR /app

# Install dependencies first (layer caching)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# Copy source
COPY src/ ./src/

# Non-root user for security
RUN addgroup -S memi && adduser -S memi -G memi
USER memi

EXPOSE 3000


CMD ["node", "src/server.js"]
