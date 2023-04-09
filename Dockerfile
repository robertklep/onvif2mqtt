FROM node:19-alpine
WORKDIR /app
COPY package.json /app
COPY index.js /app
RUN npm install
CMD [ "node", "index.js" ]
