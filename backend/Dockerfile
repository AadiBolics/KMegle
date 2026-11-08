# Use supported Node 24 LTS for both services
FROM node:24-alpine

# Set production environment to optimize library performance
ENV NODE_ENV=production

WORKDIR /app

# Copy package files first to leverage Docker layer caching
COPY package*.json ./

# Install only production dependencies to keep the image slim
RUN npm ci --omit=dev

# Copy the rest of the signaling server code
COPY . .

# Your signaling server port
EXPOSE 5000

# Use a non-root user for better security (Best Practice)
USER node

CMD ["node", "src/server.js"]
