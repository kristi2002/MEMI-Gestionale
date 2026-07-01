# ── Build stage: automatic content-hash cache-busting ──────────────
# Rewrites ?v=... on app.js / tokens.css / etc. to a content hash across all HTML,
# so cached browsers always get fresh assets after a real change and you never bump
# ?v=N by hand. The script never throws; the `|| true` is belt-and-suspenders so a
# build can never fail here.
FROM node:20-alpine AS build
WORKDIR /app
COPY . .
RUN node scripts/cache-bust.js . || echo "cache-bust skipped"

# ── Serve stage ────────────────────────────────────────────────────
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app /usr/share/nginx/html
EXPOSE 80
