FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Bản chạy thử bật dữ liệu giả cho các API chưa có ở backend. Đặt false khi backend đã làm xong.
ARG VITE_API_MOCK=false
ENV VITE_API_MOCK=$VITE_API_MOCK
RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
