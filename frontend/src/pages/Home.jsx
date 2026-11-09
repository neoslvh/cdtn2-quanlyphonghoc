import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { canManageRooms, canManageSchedule } from '../constants';
import { ROLE_LABEL } from './Shell';

// Lối tắt theo vai trò. Mục có `to` đã làm xong, mục còn lại hiện kèm sprint dự kiến.
const TILES = {
  REQUESTER: [['Tra cứu phòng trống', 'Tìm phòng còn trống theo khung giờ và thiết bị', '/rooms/search'], ['Tạo yêu cầu đăng ký', 'Lập phiếu đề xuất sử dụng phòng', '/requests/new'], ['Theo dõi yêu cầu', 'Xem trạng thái, sửa nháp và hủy yêu cầu', '/requests']],
  APPROVER: [['Tra cứu phòng trống', 'Xem phòng còn trống', '/rooms/search'], ['Duyệt yêu cầu', 'Xử lý các yêu cầu đang chờ đơn vị của bạn', '/approvals']],
  FACILITY_STAFF: [['Tra cứu phòng trống', 'Xem phòng còn trống', '/rooms/search'], ['Quản lý thiết bị', 'Sprint 3']],
  ADMIN: [['Tra cứu phòng trống', 'Xem phòng còn trống', '/rooms/search'], ['Tất cả yêu cầu', 'Xem trạng thái mọi yêu cầu', '/requests'], ['Nhật ký thao tác', 'Tra cứu ai làm gì, lúc nào, trước và sau thay đổi', '/admin/audit'], ['Quy tắc duyệt', 'Sprint 5']],
};

export default function Home() {
  const { user } = useAuth();
  const tiles = [...(TILES[user.role] || [])];
  if (canManageRooms(user)) tiles.push(['Quản lý phòng', 'Thêm, sửa phòng và đổi trạng thái', '/rooms']);
  if (canManageSchedule(user)) tiles.push(['Lịch học chính khóa', 'Nhập thời khóa biểu và quản lý buổi học', '/class-schedule']);
  return (
    <>
      <section className="app-band">
        <h1>Xin chào, {user.fullName}</h1>
        <p>{ROLE_LABEL[user.role]} · {user.organization?.name}</p>
      </section>
      <div className="app-content">
        <div className="tile-grid">
          {tiles.map(([title, text, to]) => {
            const body = (
              <>
                <h3>{title}</h3>
                <p>{to ? text : `Sắp có trong ${text}`}</p>
              </>
            );
            return to ? <Link className="tile tile-link" key={title} to={to}>{body}</Link> : <div className="tile" key={title}>{body}</div>;
          })}
        </div>
      </div>
    </>
  );
}
