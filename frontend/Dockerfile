# /frontend/Dockerfile

FROM node:18-alpine

WORKDIR /app

COPY package.json ./

RUN npm install \
    && npm dedupe \
    && npm ls react --all 2>&1 | head -20

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
