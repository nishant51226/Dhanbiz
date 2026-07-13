FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --legacy-peer-deps
COPY frontend/ ./
# Production: same-origin /api via nginx proxy (see default.conf)
ENV VITE_API_BASE=
RUN npm run build

FROM node:20-alpine AS help-builder
WORKDIR /app
COPY backend/help/package.json backend/help/package-lock.json* ./
RUN npm ci
COPY backend/help/ ./
RUN npm run build

FROM nginx:alpine
COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=frontend-builder /app/dist /usr/share/nginx/html
COPY --from=help-builder /app/build /usr/share/nginx/html/document
EXPOSE 80