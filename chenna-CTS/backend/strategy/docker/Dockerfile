FROM node:18-alpine
WORKDIR /app

# install system deps if needed
RUN apk add --no-cache bash ca-certificates

# copy package files and install production deps
COPY package*.json ./
RUN npm ci --only=production

# copy app source
COPY . .

# if your server file is server.cjs adjust
CMD ["node", "server.cjs"]
