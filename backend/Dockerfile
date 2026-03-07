# Use the ultra-lightweight Alpine version of Node.js
FROM node:18-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy only the package files first (this makes rebuilding much faster)
COPY package*.json ./

# Install only production dependencies to save RAM
RUN npm install --omit=dev

# Copy the rest of your backend code
COPY . .

# Expose the Socket.io port
EXPOSE 5000

# Start the Node server
CMD ["node", "src/server.js"]