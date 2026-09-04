FROM node:22-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY api ./api
COPY supabase ./supabase

ENV API_PORT=8787
EXPOSE 8787
CMD ["node", "--import", "tsx", "api/src/server.ts"]
