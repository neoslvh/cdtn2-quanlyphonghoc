// Tầng repository: truy vấn buổi học chính khóa và lượt đặt đã duyệt theo khoảng thời gian. Không chứa quy tắc nghiệp vụ.

// Hai khoảng [aStart, aEnd) và [bStart, bEnd) giao nhau khi aStart < bEnd và bStart < aEnd, khớp với tstzrange của PostgreSQL.
const overlap = (from, to) => ({ startAt: { lt: to }, endAt: { gt: from } });

function createAvailabilityRepo(prisma) {
  return {
    /** Tập id các phòng đang có buổi học ACTIVE hoặc lượt đặt ACTIVE giao với khoảng thời gian (BR-10, BR-01). */
    busyRoomIds: async (from, to) => {
      const [sessions, bookings] = await Promise.all([
        prisma.classSchedule.findMany({ where: { status: 'ACTIVE', ...overlap(from, to) }, select: { roomId: true } }),
        prisma.roomBooking.findMany({ where: { status: 'ACTIVE', ...overlap(from, to) }, select: { roomId: true } }),
      ]);
      return new Set([...sessions, ...bookings].map((x) => x.roomId));
    },

    /** Nguồn xung đột đầu tiên của một phòng trong khoảng thời gian: buổi học trước, rồi lượt đặt. Trả null nếu trống. */
    findRoomConflict: async (roomId, from, to, { excludeRequestId, excludeSessionId } = {}) => {
      const session = await prisma.classSchedule.findFirst({
        where: { roomId, status: 'ACTIVE', ...overlap(from, to), ...(excludeSessionId ? { id: { not: excludeSessionId } } : {}) },
        orderBy: { startAt: 'asc' },
      });
      if (session) return { source: 'CLASS_SCHEDULE', courseCode: session.courseCode, classCode: session.classCode };
      const booking = await prisma.roomBooking.findFirst({
        where: { roomId, status: 'ACTIVE', ...overlap(from, to), ...(excludeRequestId ? { requestId: { not: excludeRequestId } } : {}) },
        include: { request: { select: { requestNo: true } } },
        orderBy: { startAt: 'asc' },
      });
      return booking ? { source: 'ROOM_BOOKING', requestNo: booking.request.requestNo } : null;
    },
  };
}

module.exports = { createAvailabilityRepo };
