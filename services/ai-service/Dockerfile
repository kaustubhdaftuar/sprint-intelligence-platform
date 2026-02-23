FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Health check
HEALTHCHECK --interval=30s --timeout=3s \
  CMD node -e "const http = require('http'); http.get('http://localhost:5000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

EXPOSE 5000

CMD ["node", "dist/server.js"]