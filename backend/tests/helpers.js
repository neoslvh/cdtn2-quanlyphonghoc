const jwt = require('jsonwebtoken');

const SECRET = 'khoa-bi-mat-chi-dung-khi-kiem-thu';

const ORGS = [
  { id: '00000000-0000-4000-9000-0000000000a1', name: 'Khoa Công nghệ thông tin', type: 'REQUESTER_UNIT', active: true },
  { id: '00000000-0000-4000-9000-0000000000a2', name: 'Phòng Đào tạo', type: 'APPROVAL_UNIT', active: true },
  { id: '00000000-0000-4000-9000-0000000000a3', name: 'Ban Giám hiệu', type: 'APPROVAL_UNIT', active: true },
  { id: '00000000-0000-4000-9000-0000000000a4', name: 'Phòng Quản trị cơ sở vật chất', type: 'FACILITY_UNIT', active: true },
];

// Cơ sở dữ liệu giả trong bộ nhớ, cùng giao diện với các repository trong src/repositories. Mỗi nhóm hàm được thêm dần theo từng API.
function fakeDb() {
  const users = [];
  const buildings = [{ id: 'b-a', code: 'A', name: 'Tòa A', campus: 'Cơ sở 1' }];
  const rooms = [];
  const sessions = [];
  const requests = [];
  const batches = [];
  const audit = [];
  const notifications = [];
  const equipment = [];
  const incidents = [];
  let requestNo = 0;
  const bookings = [];
  const overlaps = (x, from, to) => x.startAt < to && from < x.endAt;
  let seq = 0;
  const id = (p) => `${p}-${++seq}`;
  const conflictsOf = (bid) => {
    const out = [];
    for (const r of requests.filter((q) => ['PENDING', 'APPROVED'].includes(q.status))) {
      const x = sessions.find((y) => y.batchId === bid && y.roomId === r.roomId && overlaps(y, r.startAt, r.endAt));
      if (x) out.push({ requestId: r.id, requestNo: r.requestNo, requestStatus: r.status, startAt: r.startAt, endAt: r.endAt, roomCode: r.room.code, requesterName: r.requesterName, courseCode: x.courseCode, classCode: x.classCode });
    }
    return out;
  };
  const flat = (r) => {
    const b = buildings.find((x) => x.id === r.buildingId);
    return { ...r, buildingCode: b.code, buildingName: b.name, campus: b.campus };
  };
  return {
    users,
    buildings,
    rooms,
    sessions,
    bookings,
    requests,
    batches,
    audit,
    notifications,
    equipment,
    incidents,
    countRooms: async () => rooms.length,
    findOrganization: async (oid) => ORGS.find((o) => o.id === oid) || null,
    listOrganizations: async () => ORGS,
    findUserById: async (uid) => {
      const u = users.find((x) => x.id === uid);
      return u ? { ...u, organization: ORGS.find((o) => o.id === u.organizationId) } : null;
    },
    findUserByEmail: async (email) => users.find((u) => u.email === email) || null,
    // trùng lịch
    busyRoomIds: async (from, to) =>
      new Set([...sessions.filter((x) => x.status === 'ACTIVE' && overlaps(x, from, to)), ...bookings.filter((x) => x.status === 'ACTIVE' && overlaps(x, from, to))].map((x) => x.roomId)),
    findRoomConflict: async (roomId, from, to, { excludeRequestId, excludeSessionId } = {}) => {
      const s = sessions.find((x) => x.roomId === roomId && x.status === 'ACTIVE' && overlaps(x, from, to) && (!excludeSessionId || x.id !== excludeSessionId));
      if (s) return { source: 'CLASS_SCHEDULE', courseCode: s.courseCode, classCode: s.classCode };
      const b = bookings.find((x) => x.roomId === roomId && x.status === 'ACTIVE' && overlaps(x, from, to) && (!excludeRequestId || x.requestId !== excludeRequestId));
      return b ? { source: 'ROOM_BOOKING', requestNo: b.requestNo } : null;
    },
    // nhật ký và thông báo
    logAudit: async (entry) => { audit.push({ ...entry, createdAt: new Date() }); },
    listAudit: async ({ entityType, entityId, userId, action, page, pageSize }) => {
      const all = audit.filter((a) => (!entityType || a.entityType === entityType) && (!entityId || a.entityId === entityId) && (!userId || a.userId === userId) && (!action || a.action === action)).map((a, i) => ({ id: `a-${i}`, createdAt: new Date(), beforeData: a.before, afterData: a.after, user: null, ...a }));
      return { items: all.slice().reverse().slice((page - 1) * pageSize, page * pageSize), total: all.length };
    },
    listNotifications: async ({ userId, unread, page, pageSize }) => {
      const mine = notifications.filter((n) => n.userId === userId);
      const all = mine.filter((n) => !unread || !n.readAt);
      return { items: all.slice((page - 1) * pageSize, page * pageSize), total: all.length, unread: mine.filter((n) => !n.readAt).length };
    },
    markNotificationRead: async (userId, nid) => {
      const n = notifications.find((x) => x.id === nid && x.userId === userId);
      if (n && !n.readAt) n.readAt = new Date();
      return n || null;
    },
    markAllNotificationsRead: async (userId) => notifications.filter((n) => n.userId === userId && !n.readAt).map((n) => { n.readAt = new Date(); }).length,
    // thời khóa biểu
    listPeriodSlots: async () => {
      const f = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      return Array.from({ length: 12 }, (_, i) => {
        const start = (i < 6 ? 7 * 60 : 13 * 60) + (i % 6) * 45;
        return { period: i + 1, startTime: f(start), endTime: f(start + 45) };
      });
    },
    findRoomsByCodes: async (codes) => new Map(rooms.filter((r) => codes.includes(r.code)).map((r) => [r.code, r.id])),
    createImportBatch: async ({ importedBy, semester, mode, fileName, rowCount, sessions: list }) => {
      const batch = { id: `20000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`, importedBy, semester, mode, fileName, status: 'PREVIEW', rowCount, sessionCount: list.length, conflictCount: 0, createdAt: new Date(), committedAt: null };
      batches.push(batch);
      for (const x of list) sessions.push({ id: `30000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`, batchId: batch.id, roomCode: rooms.find((r) => r.id === x.roomId).code, status: 'PENDING', ...x });
      const conflicts = conflictsOf(batch.id);
      batch.conflictCount = conflicts.length;
      audit.push({ userId: importedBy, action: 'SCHEDULE_IMPORT_PREVIEWED', entityType: 'import_batch', entityId: batch.id });
      return { batch, conflicts };
    },
    findBatch: async (bid) => batches.find((b) => b.id === bid) || null,
    batchConflicts: async (bid) => conflictsOf(bid),
    listBatches: async ({ page, pageSize }) => ({ items: batches.slice().reverse().slice((page - 1) * pageSize, page * pageSize), total: batches.length }),
    discardBatch: async (bid, actorId) => {
      const b = batches.find((x) => x.id === bid);
      if (b.status !== 'PREVIEW') return false;
      b.status = 'DISCARDED';
      audit.push({ userId: actorId, action: 'SCHEDULE_IMPORT_DISCARDED', entityType: 'import_batch', entityId: bid });
      for (let i = sessions.length - 1; i >= 0; i--) if (sessions[i].batchId === bid && sessions[i].status === 'PENDING') sessions.splice(i, 1);
      return true;
    },
    findActiveSessionsIn: async ({ roomIds, from, to, replaceSemester }) =>
      sessions.filter((x) => x.status === 'ACTIVE' && roomIds.includes(x.roomId) && overlaps(x, from, to) && (!replaceSemester || batches.find((y) => y.id === x.batchId).semester !== replaceSemester)),
    commitBatch: async (bid, { cancelReason, actorId }) => {
      const b = batches.find((x) => x.id === bid);
      if (b.status !== 'PREVIEW') return null;
      // Kiểm tra lại lúc xác nhận như repository thật: buổi mới không được trùng buổi ACTIVE còn lại (trừ buổi sẽ bị thay).
      const keep = (x) => !(b.mode === 'REPLACE' && batches.find((y) => y.id === x.batchId).semester === b.semester && x.batchId !== bid);
      for (const n of sessions.filter((x) => x.batchId === bid && x.status === 'PENDING')) {
        const o = sessions.find((x) => x.status === 'ACTIVE' && keep(x) && x.roomId === n.roomId && overlaps(x, n.startAt, n.endAt));
        if (o) return { clash: { courseCode: n.courseCode, classCode: n.classCode, otherCourse: o.courseCode, otherClass: o.classCode, roomCode: n.roomCode, startAt: o.startAt } };
      }
      b.status = 'COMMITTED';
      const conflicts = conflictsOf(bid);
      let replaced = 0;
      if (b.mode === 'REPLACE') {
        for (const x of sessions) {
          const other = batches.find((y) => y.id === x.batchId);
          if (x.status === 'ACTIVE' && other.semester === b.semester && x.batchId !== bid) { x.status = 'CANCELLED'; replaced++; }
        }
      }
      let activated = 0;
      for (const x of sessions) if (x.batchId === bid && x.status === 'PENDING') { x.status = 'ACTIVE'; activated++; }
      for (const c of conflicts) {
        const r = requests.find((q) => q.id === c.requestId);
        r.status = 'CANCELLED';
        r.cancelReason = cancelReason(c);
        r.steps = r.steps.map((st) => ({ ...st, status: 'CANCELLED' }));
        for (const bk of bookings) if (bk.requestId === r.id) bk.status = 'CANCELLED';
        notifications.push({ id: `40000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`, userId: r.requesterId, requestId: r.id, title: 'Yêu cầu sử dụng phòng bị hủy', message: cancelReason(c), readAt: null, createdAt: new Date() });
        audit.push({ userId: actorId, action: 'REQUEST_CANCELLED_BY_SCHEDULE', entityType: 'usage_request', entityId: r.id });
      }
      audit.push({ userId: actorId, action: 'SCHEDULE_IMPORT_COMMITTED', entityType: 'import_batch', entityId: bid });
      return { activated, replaced, cancelled: conflicts.map((c) => ({ ...c, cancelReason: cancelReason(c) })) };
    },
    listSessions: async ({ roomCode, from, to, status, page, pageSize }) => {
      const all = sessions
        .filter((x) => (!roomCode || x.roomCode === roomCode) && (status ? x.status === status : x.status !== 'PENDING') && (!from || x.startAt >= from) && (!to || x.startAt < to))
        .sort((a, b) => a.startAt - b.startAt);
      return { items: all.slice((page - 1) * pageSize, page * pageSize), total: all.length };
    },
    findSession: async (sid) => sessions.find((x) => x.id === sid) || null,
    updateSession: async (sid, data, actorId) => {
      const x = sessions.find((y) => y.id === sid);
      if (x.status !== 'ACTIVE') return null;
      audit.push({ userId: actorId, action: 'CLASS_SESSION_UPDATED', entityType: 'class_schedule', entityId: sid });
      Object.assign(x, { roomId: data.roomId, roomCode: rooms.find((r) => r.id === data.roomId).code, startAt: data.startAt, endAt: data.endAt });
      return x;
    },
    cancelSession: async (sid, actorId) => {
      const x = sessions.find((y) => y.id === sid);
      if (x.status !== 'ACTIVE') return null;
      x.status = 'CANCELLED';
      audit.push({ userId: actorId, action: 'CLASS_SESSION_CANCELLED', entityType: 'class_schedule', entityId: sid });
      return x;
    },
    // phiếu đề xuất
    findOrganizationByName: async (name) => ORGS.find((o) => o.name === name) || null,
    findRequest: async (rid) => requests.find((r) => r.id === rid) || null,
    createRequest: async ({ requesterId, equipment, ...data }, log) => {
      const room = rooms.find((r) => r.id === data.roomId);
      const r = {
        id: `10000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`,
        requestNo: ++requestNo,
        requesterId,
        requesterName: (users.find((u) => u.id === requesterId) || {}).fullName,
        organizationName: ORGS.find((o) => o.id === data.organizationId).name,
        status: 'DRAFT',
        createdAt: new Date(),
        submittedAt: null,
        cancelReason: null,
        equipment,
        attachments: [],
        steps: [],
        room: { id: room.id, code: room.code, name: room.name, capacity: room.capacity, status: room.status },
        ...data,
      };
      requests.push(r);
      if (log) audit.push({ ...log(r), createdAt: new Date() });
      return r;
    },
    updateRequest: async (rid, { equipment, ...data }, log) => {
      const r = requests.find((x) => x.id === rid);
      if (r.status !== 'DRAFT') return null;
      const room = rooms.find((x) => x.id === data.roomId);
      Object.assign(r, data, { equipment, room: { id: room.id, code: room.code, name: room.name, capacity: room.capacity, status: room.status } });
      if (log) audit.push({ ...log, createdAt: new Date() });
      return r;
    },
    listRequests: async ({ requesterId, status, page, pageSize }) => {
      const all = requests.filter((r) => (!requesterId || r.requesterId === requesterId) && (!status || r.status === status)).sort((a, b) => b.requestNo - a.requestNo);
      return { items: all.slice((page - 1) * pageSize, page * pageSize), total: all.length };
    },
    addAttachment: async (rid, data) => {
      requests.find((r) => r.id === rid).attachments.push({ id: `att-${++seq}`, fileName: data.fileName, type: data.type, filePath: data.filePath });
    },
    submitRequest: async (rid, steps, now, log) => {
      const r = requests.find((x) => x.id === rid);
      if (r.status !== 'DRAFT') return null;
      r.status = 'PENDING';
      r.submittedAt = now;
      r.steps = steps.map((st) => ({ id: `step-${++seq}`, decisionReason: null, decidedAt: null, stepNo: st.stepNo, approverOrgId: st.approverOrgId, organizationName: ORGS.find((o) => o.id === st.approverOrgId).name, status: st.status }));
      if (log) audit.push({ ...log, createdAt: new Date() });
      return r;
    },
    cancelRequest: async (rid, reason, now, log) => {
      const r = requests.find((x) => x.id === rid);
      if (!['DRAFT', 'PENDING'].includes(r.status)) return null;
      r.status = 'CANCELLED';
      r.cancelReason = reason;
      r.steps = r.steps.map((st) => (['PENDING', 'WAITING'].includes(st.status) ? { ...st, status: 'CANCELLED' } : st));
      if (log) audit.push({ ...log, createdAt: new Date() });
      return r;
    },
    listPendingApprovals: async ({ orgId, after, page, pageSize }) => {
      const all = requests.filter((r) => r.status === 'PENDING' && (!after || r.startAt > after) && r.steps.some((s) => s.status === 'PENDING' && (!orgId || s.approverOrgId === orgId))).sort((a, b) => a.submittedAt - b.submittedAt);
      return { items: all.slice((page - 1) * pageSize, page * pageSize), total: all.length };
    },
    expireOverdue: async (now, message) => {
      const done = requests.filter((r) => r.status === 'PENDING' && r.startAt <= now);
      for (const r of done) {
        r.status = 'EXPIRED';
        r.steps = r.steps.map((st) => (['PENDING', 'WAITING'].includes(st.status) ? { ...st, status: 'CANCELLED' } : st));
        notifications.push({ id: `40000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`, userId: r.requesterId, requestId: r.id, title: 'Yêu cầu sử dụng phòng đã hết hạn', message: message(r), readAt: null, createdAt: new Date() });
        audit.push({ userId: null, action: 'REQUEST_EXPIRED', entityType: 'usage_request', entityId: r.id });
      }
      return done;
    },
    approveStep: async ({ requestId, stepId, userId, reason, booking, requesterId }) => {
      const r = requests.find((x) => x.id === requestId);
      const st = r.steps.find((x) => x.id === stepId);
      if (r.status !== 'PENDING' || st.status !== 'PENDING') return 'STALE';
      if (booking && bookings.some((b) => b.roomId === booking.roomId && b.status === 'ACTIVE' && overlaps(b, booking.startAt, booking.endAt))) return 'CONFLICT';
      Object.assign(st, { status: 'APPROVED', decisionReason: reason, decidedAt: new Date() });
      if (booking) {
        r.status = 'APPROVED';
        bookings.push({ requestId, requestNo: r.requestNo, roomId: booking.roomId, startAt: booking.startAt, endAt: booking.endAt, status: 'ACTIVE' });
        notifications.push({ id: `40000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`, userId: requesterId, requestId, title: 'Yêu cầu sử dụng phòng đã được duyệt', message: booking.message, readAt: null, createdAt: new Date() });
      } else {
        const next = r.steps.find((x) => x.status === 'WAITING');
        if (next) next.status = 'PENDING';
      }
      audit.push({ userId, action: booking ? 'REQUEST_APPROVED' : 'REQUEST_STEP_APPROVED', entityType: 'usage_request', entityId: requestId });
      return 'OK';
    },
    rejectStep: async ({ requestId, stepId, userId, reason, requesterId, message }) => {
      const r = requests.find((x) => x.id === requestId);
      const st = r.steps.find((x) => x.id === stepId);
      if (r.status !== 'PENDING' || st.status !== 'PENDING') return 'STALE';
      r.status = 'REJECTED';
      Object.assign(st, { status: 'REJECTED', decisionReason: reason, decidedAt: new Date() });
      for (const x of r.steps) if (x.status === 'WAITING') x.status = 'CANCELLED';
      notifications.push({ id: `40000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`, userId: requesterId, requestId, title: 'Yêu cầu sử dụng phòng bị từ chối', message, readAt: null, createdAt: new Date() });
      audit.push({ userId, action: 'REQUEST_REJECTED', entityType: 'usage_request', entityId: requestId });
      return 'OK';
    },
    // phòng
    listRooms: async ({ campus, roomType, status, q, minCapacity, buildingCode, page, pageSize }) => {
      const all = rooms
        .map(flat)
        .filter((r) => (!campus || r.campus === campus) && (!roomType || r.roomType === roomType) && (!status || r.status === status) && (!minCapacity || r.capacity >= minCapacity) && (!buildingCode || r.buildingCode === buildingCode))
        .filter((r) => !q || `${r.code} ${r.name}`.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => a.code.localeCompare(b.code));
      return { items: page ? all.slice((page - 1) * pageSize, page * pageSize) : all, total: all.length };
    },
    findRoom: async (rid) => (rooms.find((r) => r.id === rid) ? flat(rooms.find((r) => r.id === rid)) : null),
    findRoomByCode: async (code) => rooms.find((r) => r.code === code) || null,
    findBuildingByCode: async (code) => buildings.find((b) => b.code === code) || null,
    setBuildingCampus: async (bid, campus) => {
      const b = buildings.find((x) => x.id === bid);
      b.campus = campus;
      return b;
    },
    createBuilding: async (data) => {
      const b = { id: id('b'), ...data };
      buildings.push(b);
      return b;
    },
    createRoom: async (data, log) => {
      const r = { id: '00000000-0000-4000-8000-' + String(++seq).padStart(12, '0'), equipment: {}, ...data };
      rooms.push(r);
      if (log) audit.push({ ...log(flat(r)), createdAt: new Date() });
      return flat(r);
    },
    updateRoom: async (rid, data, log) => {
      const r = rooms.find((x) => x.id === rid);
      Object.assign(r, data);
      if (log) audit.push({ ...log(flat(r)), createdAt: new Date() });
      return flat(r);
    },

    // Mã QR, check-in, báo hỏng (facilityRepo).
    findRoomQr: async (rid) => rooms.find((r) => r.id === rid) || null,
    findEquipment: async (eid) => withRoom(equipment.find((e) => e.id === eid)),
    findQrTarget: async (token) => {
      const room = rooms.find((r) => r.qrToken === token);
      if (room) return { type: 'ROOM', room };
      const e = equipment.find((x) => x.qrToken === token);
      return e ? { type: 'EQUIPMENT', equipment: withRoom(e) } : null;
    },
    listRoomEquipment: async (rid) => equipment.filter((e) => e.roomId === rid).map(withRoom),
    createCheckin: async ({ requestId, userId, roomId, now }) => {
      const r = requests.find((x) => x.id === requestId);
      if (r.checkin) return false;
      r.checkin = { checkedInAt: now, result: 'SUCCESS' };
      audit.push({ userId, action: 'REQUEST_CHECKED_IN', entityType: 'usage_request', entityId: requestId, after: { roomId } });
      return true;
    },
    createIncident: async ({ requestId, equipmentId, reportedBy, description, imagePath, imageName }) => {
      const e = equipment.find((x) => x.id === equipmentId);
      if (e.status !== 'GOOD') return null;
      e.status = 'BROKEN';
      const i = { id: `50000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`, requestId, equipmentId, reportedBy, description, imagePath, imageName, status: 'OPEN', createdAt: new Date() };
      incidents.push(i);
      audit.push({ userId: reportedBy, action: 'INCIDENT_REPORTED', entityType: 'incident_report', entityId: i.id });
      return incidentView(i);
    },
    createHandover: async ({ requestId, userId, now, note, items }) => {
      const r = requests.find((x) => x.id === requestId);
      if (r.handover) return false;
      r.handover = { handedOverAt: now, handedBy: { fullName: users.find((u) => u.id === userId).fullName }, conditionNote: note, handoverItems: items, returnedAt: null, returner: null, returnNote: null, returnItems: null };
      audit.push({ userId, action: 'REQUEST_HANDED_OVER', entityType: 'usage_request', entityId: requestId });
      return true;
    },
    returnHandover: async ({ requestId, userId, now, note, items }) => {
      const h = requests.find((x) => x.id === requestId).handover;
      if (!h || h.returnedAt) return false;
      Object.assign(h, { returnedAt: now, returner: { fullName: users.find((u) => u.id === userId).fullName }, returnNote: note, returnItems: items });
      audit.push({ userId, action: 'REQUEST_RETURNED', entityType: 'usage_request', entityId: requestId });
      return true;
    },
    listIncidents: async ({ status, page, pageSize }) => {
      const all = incidents.filter((i) => !status || i.status === status).slice().reverse();
      return { items: all.slice((page - 1) * pageSize, page * pageSize).map(incidentView), total: all.length };
    },
  };
  function withRoom(e) {
    if (!e) return null;
    const r = rooms.find((x) => x.id === e.roomId);
    return { ...e, room: r ? { id: r.id, code: r.code } : null };
  }
  function incidentView(i) {
    const r = requests.find((x) => x.id === i.requestId);
    const e = equipment.find((x) => x.id === i.equipmentId);
    return { ...i, request: { id: r.id, requestNo: r.requestNo, room: { code: r.room.code } }, equipment: { id: e.id, assetCode: e.assetCode, name: e.name }, reporter: { fullName: users.find((u) => u.id === i.reportedBy).fullName } };
  }
}

// Tạo người dùng giả và token đăng nhập của họ.
function login(db, role, orgId = '00000000-0000-4000-9000-0000000000a1') {
  const user = { id: `u-${db.users.length + 1}`, fullName: `Người ${role}`, email: `${role.toLowerCase()}${db.users.length}@vlu.edu.vn`, role, status: 'ACTIVE', organizationId: orgId, mustChangePassword: false };
  db.users.push(user);
  return { user, auth: { Authorization: `Bearer ${jwt.sign({ sub: user.id, role }, SECRET, { expiresIn: '1h' })}` } };
}

// Thêm nhanh một phòng vào cơ sở dữ liệu giả (tòa A, cơ sở 1) với thiết bị tốt theo loại.
function addRoom(db, over = {}) {
  const n = db.rooms.length + 1;
  const room = { id: `00000000-0000-4000-8000-${String(900 + n).padStart(12, '0')}`, buildingId: 'b-a', code: `A.10.${String(n).padStart(2, '0')}`, name: `Phòng ${n}`, roomType: 'CLASSROOM', capacity: 80, status: 'AVAILABLE', equipment: {}, qrToken: `qr-room-${n}`, ...over };
  db.rooms.push(room);
  return room;
}

// Thêm một thiết bị vào phòng trong cơ sở dữ liệu giả.
function addEquipment(db, room, over = {}) {
  const n = db.equipment.length + 1;
  const e = { id: `00000000-0000-4000-8000-${String(700 + n).padStart(12, '0')}`, roomId: room ? room.id : null, assetCode: `PJ-${n}`, name: `Máy chiếu ${n}`, equipmentType: 'PROJECTOR', status: 'GOOD', qrToken: `qr-eq-${n}`, ...over };
  db.equipment.push(e);
  return e;
}

// Lưu tệp giả trong bộ nhớ cho test đính kèm.
function fakeStorage() {
  const saved = [];
  const removed = [];
  return { saved, removed, save: async (buffer, ext) => { saved.push({ size: buffer.length, ext }); return `file-${saved.length}${ext}`; }, remove: async (name) => { removed.push(name); } };
}

module.exports = { fakeDb, login, addRoom, addEquipment, fakeStorage, ORGS, SECRET };
