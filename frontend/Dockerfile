# Build stage
FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application
COPY . .

# Expose Vite port
EXPOSE 5173

# Start development server
CMD ["npm", "run", "dev", "--", "--host"]
