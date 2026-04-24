# /backend/Dockerfile

# Usar una imagen ligera de Node.js
FROM node:20-alpine

# Establecer el directorio de trabajo dentro del contenedor
WORKDIR /app

# Copiar primero los archivos de dependencias
# Esto optimiza la caché de Docker: solo hará 'npm install' si el package.json cambia
COPY package*.json ./

# Instalar las dependencias del proyecto (express, pg, mqtt, socket.io, etc.)
RUN npm install

# Instalar nodemon globalmente para el hot-reloading en desarrollo
RUN npm install -g nodemon

# Copiar el resto del código fuente
COPY . .

# Exponer el puerto en el que corre Express
EXPOSE 3001

# Comando para iniciar la aplicación usando nodemon
CMD ["nodemon", "src/server.js"]