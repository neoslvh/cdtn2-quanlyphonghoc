// Tầng repository: người dùng và đơn vị. Không chứa quy tắc nghiệp vụ.
const { missing } = require('./common');

const withOrg = { include: { organization: true } };

function createUserRepo(prisma) {
  return {
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
  };
}

module.exports = { createUserRepo };
