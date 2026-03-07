# 1. Upgrade to Node 20 to satisfy Next.js requirements
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# 2. Declare Build Arguments
# This allows Docker Compose to pass the .env variables into the build process
ARG NEXT_PUBLIC_BACKEND_URL
ENV NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL

# 3. Now the build will actually see the Backend URL
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]