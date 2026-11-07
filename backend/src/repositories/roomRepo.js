// Tầng repository: đọc ghi PostgreSQL bằng Prisma, không chứa quy tắc nghiệp vụ.
const { missing } = require('./common');

const include = { building: true, equipment: { where: { status: 'GOOD' }, select: { equipmentType: true } } };

// Phòng từ Prisma sang dạng phẳng mà service dùng: tòa, cơ sở và số thiết bị tốt theo loại.
function flatRoom(r) {
  if (!r) return null;
  const equipment = {};
  for (const e of r.equipment || []) equipment[e.equipmentType] = (equipment[e.equipmentType] || 0) + 1;
  const { building, equipment: _e, qrToken, ...rest } = r;
  return { ...rest, buildingCode: building.code, buildingName: building.name, campus: building.campus, equipment };
}

function createRoomRepo(prisma) {
  return {
    /** Danh sách phòng theo bộ lọc. Có page và pageSize thì cắt trang ngay trong cơ sở dữ liệu. Trả { items, total }. */
    listRooms: async ({ campus, roomType, status, q, minCapacity, page, pageSize }) => {
      const where = {
        ...(campus ? { building: { campus } } : {}),
        ...(roomType ? { roomType } : {}),
        ...(status ? { status } : {}),
        ...(minCapacity ? { capacity: { gte: minCapacity } } : {}),
        ...(q ? { OR: [{ code: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }] } : {}),
      };
      const paging = page ? { skip: (page - 1) * pageSize, take: pageSize } : {};
      const [rows, total] = await Promise.all([
        prisma.room.findMany({ where, include, orderBy: { code: 'asc' }, ...paging }),
        prisma.room.count({ where }),
      ]);
      return { items: rows.map(flatRoom), total };
    },
    findRoom: async (id) => flatRoom(await prisma.room.findUnique({ where: { id }, include }).catch(missing)),
    findRoomByCode: (code) => prisma.room.findUnique({ where: { code } }),
    findBuildingByCode: (code) => prisma.building.findUnique({ where: { code } }),
    createBuilding: (data) => prisma.building.create({ data }),
    setBuildingCampus: (id, campus) => prisma.building.update({ where: { id }, data: { campus } }),
    createRoom: async (data) => flatRoom(await prisma.room.create({ data, include })),
    updateRoom: async (id, data) => flatRoom(await prisma.room.update({ where: { id }, data, include })),
  };
}

module.exports = { createRoomRepo, flatRoom };
