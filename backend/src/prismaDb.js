// Lớp truy cập cơ sở dữ liệu bằng Prisma. Các route chỉ dùng các hàm này, nên kiểm thử thay bằng cơ sở dữ liệu giả cùng giao diện.

// Chỉ coi là "không có" khi id sai định dạng (P2023) hoặc không tồn tại (P2025). Lỗi cơ sở dữ liệu khác phải nổi lên thành 500.
const missing = (err) => {
  if (['P2023', 'P2025'].includes(err.code)) return null;
  throw err;
};

const withOrg = { include: { organization: true } };
const roomInclude = { building: true, equipment: { where: { status: 'GOOD' }, select: { equipmentType: true } } };

// Phòng từ Prisma sang dạng phẳng mà route dùng: tòa, cơ sở và số thiết bị tốt theo loại.
function flatRoom(r) {
  if (!r) return null;
  const equipment = {};
  for (const e of r.equipment || []) equipment[e.equipmentType] = (equipment[e.equipmentType] || 0) + 1;
  const { building, equipment: _e, qrToken, buildingId, ...rest } = r;
  return { ...rest, buildingId, buildingCode: building.code, buildingName: building.name, campus: building.campus, equipment };
}

function createDb(prisma) {
  const rooms = {
    listRooms: async ({ campus, roomType, status, q }) => {
      const where = {
        ...(campus ? { building: { campus } } : {}),
        ...(roomType ? { roomType } : {}),
        ...(status ? { status } : {}),
        ...(q ? { OR: [{ code: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }] } : {}),
      };
      return (await prisma.room.findMany({ where, include: roomInclude, orderBy: { code: 'asc' } })).map(flatRoom);
    },
    findRoom: async (id) => flatRoom(await prisma.room.findUnique({ where: { id }, include: roomInclude }).catch(missing)),
    findRoomByCode: (code) => prisma.room.findUnique({ where: { code } }),
    findBuildingByCode: (code) => prisma.building.findUnique({ where: { code } }),
    createBuilding: (data) => prisma.building.create({ data }),
    createRoom: async (data) => flatRoom(await prisma.room.create({ data, include: roomInclude })),
    updateRoom: async (id, data) => flatRoom(await prisma.room.update({ where: { id }, data, include: roomInclude })),
  };

  return {
    countRooms: () => prisma.room.count(),
    listOrganizations: ({ all }) =>
      prisma.organization.findMany({
        where: { active: true, ...(all ? {} : { type: 'REQUESTER_UNIT' }) },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, type: true },
      }),
    findOrganization: (id) => prisma.organization.findUnique({ where: { id } }).catch(missing),
    findUserByEmail: (email) => prisma.user.findUnique({ where: { email }, ...withOrg }),
    findUserById: (id) => prisma.user.findUnique({ where: { id }, ...withOrg }).catch(missing),
    createUser: (data) => prisma.user.create({ data }),
    listUsers: ({ status }) => prisma.user.findMany({ where: status ? { status } : {}, orderBy: { createdAt: 'desc' }, ...withOrg }),
    updateUser: (id, data) => prisma.user.update({ where: { id }, data, ...withOrg }).catch(missing),
    ...rooms,
  };
}

module.exports = { createDb, missing };
