FROM node:18-alpine

# Add ffmpeg and build dependencies
RUN apk add --no-cache ffmpeg python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 8080

CMD ["node", "index.js"]

