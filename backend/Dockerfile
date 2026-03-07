# Use Node 20 to match the frontend and stay on current LTS
FROM node:20-alpine

# Set production environment to optimize library performance
ENV NODE_ENV=production

WORKDIR /app

# Copy package files first to leverage Docker layer caching
COPY package*.json ./

# Install only production dependencies to keep the image slim
RUN npm install --omit=dev

# Copy the rest of the signaling server code
COPY . .

# Your signaling server port
EXPOSE 5000

# Use a non-root user for better security (Best Practice)
USER node

CMD ["node", "server.js"]