const { PrismaClient } = require('@prisma/client');
const { createApp } = require('./app');

const prisma = new PrismaClient();
const db = { countRooms: () => prisma.room.count() };

const port = Number(process.env.PORT) || 3000;
createApp({ db }).listen(port, () => {
  console.log(`API đang chạy tại http://localhost:${port}`);
});
