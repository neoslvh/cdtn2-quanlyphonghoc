const { createAvailabilityRepo } = require('./availabilityRepo');
const { createRoomRepo } = require('./roomRepo');
const { createUserRepo } = require('./userRepo');

// Ghép các repository thành một đối tượng db duy nhất để truyền vào ứng dụng. Kiểm thử thay bằng cơ sở dữ liệu giả cùng giao diện.
function createDb(prisma) {
  return {
    countRooms: () => prisma.room.count(),
    ...createUserRepo(prisma),
    ...createRoomRepo(prisma),
    ...createAvailabilityRepo(prisma),
  };
}

module.exports = { createDb };
