# ── Build stage ─────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
# optionalDependencies (xlsx/jspdf) may be skipped in restricted networks — the
# app degrades gracefully for those two export formats, so don't fail the build.
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build

# ── Serve stage ─────────────────────────────────────────────────────
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
