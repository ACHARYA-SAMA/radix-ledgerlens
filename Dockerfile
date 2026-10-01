FROM node:24-bookworm-slim

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

# These are public browser credentials embedded by Vite; server secrets stay runtime-only.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3005
CMD ["npm", "start"]
