# 云服务器 / Zeabur / Railway 直接 docker build 用这个。
# 构建里包含前端打包（vite build）与服务端依赖，最后只跑一个进程。
FROM node:22-alpine

WORKDIR /app

# 先装依赖，改代码时这一层还能复用
COPY package.json package-lock.json ./
RUN npm install
COPY server/package.json server/package-lock.json ./server/
RUN npm install --prefix server

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# 一个进程同时发 dist/ 与 /api
CMD ["npm", "--prefix", "server", "start"]
