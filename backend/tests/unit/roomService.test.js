// Test đơn vị tầng service: repo giả trong bộ nhớ, không HTTP, không cơ sở dữ liệu.
const { createRoomService } = require('../../src/services/roomService');
const { fakeDb } = require('../helpers');

const body = { code: 'A.10.01', name: 'Phòng A.10.01', campus: 'Cơ sở 1', roomType: 'CLASSROOM', capacity: 80, status: 'AVAILABLE' };
const fails = async (promise) => promise.then(() => { throw new Error('kỳ vọng bị từ chối'); }, (e) => e);

describe('RoomService.create', () => {
  test('mã tòa suy ra từ mã phòng, tòa chưa có thì tạo cùng cơ sở của phòng', async () => {
    const repo = fakeDb();
    const room = await createRoomService(repo).create({ ...body, code: 'e.01.01', campus: 'Cơ sở 3' });
    expect(room).toMatchObject({ code: 'e.01.01', building: 'Tòa E', campus: 'Cơ sở 3' });
    expect(repo.buildings.find((b) => b.code === 'E').campus).toBe('Cơ sở 3');
  });

  test('tòa đã có thì phải khớp cơ sở', async () => {
    const err = await fails(createRoomService(fakeDb()).create({ ...body, campus: 'Cơ sở 2' }));
    expect(err.details).toEqual([{ field: 'campus', message: 'Tòa A thuộc Cơ sở 1.' }]);
  });

  test('tòa chưa có cơ sở thì phòng đầu tiên gán cơ sở cho tòa', async () => {
    const repo = fakeDb();
    repo.buildings[0].campus = null;
    await createRoomService(repo).create(body);
    expect(repo.buildings[0].campus).toBe('Cơ sở 1');
  });

  test('hai yêu cầu cùng lúc cùng qua bước kiểm tra, ràng buộc unique báo P2002 thì trả lỗi mã trùng chứ không phải 500', async () => {
    const repo = fakeDb();
    repo.createRoom = async () => { throw Object.assign(new Error('unique'), { code: 'P2002' }); };
    const err = await fails(createRoomService(repo).create(body));
    expect([err.status, err.details[0].field]).toEqual([400, 'code']);
  });

  test('hai yêu cầu cùng tạo tòa mới: lỗi trùng của tòa không bị báo thành mã phòng trùng, phòng vẫn được tạo', async () => {
    const repo = fakeDb();
    const realCreate = repo.createBuilding;
    // Yêu cầu khác vừa tạo xong tòa E, nên lần tạo của ta vướng ràng buộc unique.
    repo.createBuilding = async (data) => {
      await realCreate(data);
      throw Object.assign(new Error('unique'), { code: 'P2002' });
    };
    const room = await createRoomService(repo).create({ ...body, code: 'E.01.01', campus: 'Cơ sở 3' });
    expect(room).toMatchObject({ code: 'E.01.01', building: 'Tòa E', campus: 'Cơ sở 3' });
  });

  test('lỗi cơ sở dữ liệu khác vẫn nổi lên, không bị đổi thành lỗi mã trùng', async () => {
    const repo = fakeDb();
    repo.createRoom = async () => { throw new Error('mất kết nối'); };
    expect((await fails(createRoomService(repo).create(body))).message).toBe('mất kết nối');
  });
});

describe('RoomService.update', () => {
  test('giữ nguyên mã, không đổi cơ sở, đổi được tên và trạng thái', async () => {
    const repo = fakeDb();
    const service = createRoomService(repo);
    const created = await service.create(body);
    const edited = await service.update(created.id, { ...body, name: 'Tên mới', status: 'MAINTENANCE' });
    expect(edited).toMatchObject({ code: 'A.10.01', name: 'Tên mới', status: 'MAINTENANCE' });
    expect((await fails(service.update(created.id, { ...body, code: 'A.99.99' }))).details[0].field).toBe('code');
    expect((await fails(service.update(created.id, { ...body, campus: 'Cơ sở 2' }))).details[0].field).toBe('campus');
  });

  test('phòng thuộc tòa chưa có cơ sở vẫn sửa được và tòa được gán cơ sở', async () => {
    const repo = fakeDb();
    const service = createRoomService(repo);
    const created = await service.create(body);
    repo.buildings[0].campus = null;
    const edited = await service.update(created.id, { ...body, name: 'Sửa được' });
    expect(edited.name).toBe('Sửa được');
    expect(repo.buildings[0].campus).toBe('Cơ sở 1');
  });
});

describe('RoomService.list và get', () => {
  test('lọc sai loại phòng bị từ chối, lọc đúng trả kèm tổng', async () => {
    const service = createRoomService(fakeDb());
    await service.create(body);
    expect((await fails(service.list({ roomType: 'VILLA' }, null))).details[0].field).toBe('roomType');
    expect(await service.list({ roomType: 'CLASSROOM' }, { page: 1, pageSize: 5 })).toMatchObject({ total: 1 });
  });

  test('id sai định dạng hoặc không tồn tại trả NOT_FOUND', async () => {
    const service = createRoomService(fakeDb());
    expect((await fails(service.get('abc'))).code).toBe('NOT_FOUND');
    expect((await fails(service.get('00000000-0000-4000-8000-000000000000'))).code).toBe('NOT_FOUND');
  });
});
