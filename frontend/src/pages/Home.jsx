import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { canManageRooms, canManageSchedule } from '../constants';
import { ROLE_LABEL } from './Shell';

// Lối tắt theo vai trò: [tiêu đề, mô tả, đường dẫn].
const TILES = {
  REQUESTER: [['Tra cứu phòng trống', 'Tìm phòng còn trống theo khung giờ và thiết bị', '/rooms/search'], ['Tạo yêu cầu đăng ký', 'Lập phiếu đề xuất sử dụng phòng', '/requests/new'], ['Theo dõi yêu cầu', 'Xem trạng thái, sửa nháp và hủy yêu cầu', '/requests']],
  APPROVER: [['Tra cứu phòng trống', 'Xem phòng còn trống', '/rooms/search'], ['Duyệt yêu cầu', 'Xử lý các yêu cầu đang chờ đơn vị của bạn', '/approvals']],
  FACILITY_STAFF: [['Tra cứu phòng trống', 'Xem phòng còn trống', '/rooms/search'], ['Bàn giao và báo hỏng', 'Bàn giao, nhận trả phòng và xử lý thiết bị hỏng', '/facility']],
  ADMIN: [['Tra cứu phòng trống', 'Xem phòng còn trống', '/rooms/search'], ['Tất cả yêu cầu', 'Xem trạng thái mọi yêu cầu', '/requests'], ['Tài khoản', 'Cấp, khóa tài khoản và đặt lại mật khẩu', '/admin/users'], ['Nhật ký thao tác', 'Tra cứu ai làm gì, lúc nào, trước và sau thay đổi', '/admin/audit'], ['Báo cáo thống kê', 'Yêu cầu theo trạng thái, sử dụng phòng, thiết bị hỏng', '/admin/reports'], ['Quy tắc duyệt', 'Điều kiện chuyển phiếu tới từng đơn vị duyệt', '/admin/approval-rules']],
};

// Số liệu nhanh theo vai trò, mỗi mục [nhãn, đường dẫn API trả total, trang mở khi bấm]. Lấy từ các API danh sách có sẵn.
const STATS = {
  REQUESTER: [['Nháp', '/requests?status=DRAFT&pageSize=1', '/requests?status=DRAFT'], ['Đang duyệt', '/requests?status=PENDING&pageSize=1', '/requests?status=PENDING'], ['Đã duyệt', '/requests?status=APPROVED&pageSize=1', '/requests?status=APPROVED']],
  APPROVER: [['Đang chờ đơn vị bạn', '/approvals?pageSize=1', '/approvals']],
  FACILITY_STAFF: [['Báo hỏng mới', '/incidents?status=OPEN&pageSize=1', '/facility']],
  ADMIN: [['Yêu cầu đang duyệt', '/requests?status=PENDING&pageSize=1', '/requests?status=PENDING'], ['Yêu cầu đã duyệt', '/requests?status=APPROVED&pageSize=1', '/requests?status=APPROVED'], ['Tài khoản chờ duyệt', '/users?status=PENDING', '/admin/users']],
};

function useStats(role) {
  const [values, setValues] = useState({});
  useEffect(() => {
    let ignore = false;
    for (const [label, path] of STATS[role] || []) {
      api(path)
        .then((d) => { if (!ignore) setValues((v) => ({ ...v, [label]: d.total ?? d.items?.length ?? 0 })); })
        // API chưa có hoặc lỗi thì hiện dấu gạch, không để số liệu treo ở trạng thái đang tải.
        .catch(() => { if (!ignore) setValues((v) => ({ ...v, [label]: '-' })); });
    }
    return () => { ignore = true; };
  }, [role]);
  return values;
}

// Trang Tổng quan: số liệu nhanh theo vai trò và lối tắt tới các chức năng.
export default function Home() {
  const { user } = useAuth();
  const stats = useStats(user.role);
  const tiles = [...(TILES[user.role] || [])];
  if (canManageRooms(user)) tiles.push(['Quản lý phòng', 'Thêm, sửa phòng, xem lịch và in mã QR phòng', '/rooms'], ['Quản lý thiết bị', 'Thêm, sửa thiết bị, đổi tình trạng và in mã QR', '/equipment']);
  if (canManageSchedule(user)) tiles.push(['Lịch học chính khóa', 'Nhập thời khóa biểu và quản lý buổi học', '/class-schedule']);
  return (
    <>
      <section className="app-band">
        <h1>Xin chào, {user.fullName}</h1>
        <p>{ROLE_LABEL[user.role]} · {user.organization?.name}</p>
      </section>
      <div className="app-content">
        {(STATS[user.role] || []).length > 0 && (
          <div className="stat-grid" aria-label="Số liệu nhanh">
            {STATS[user.role].map(([label, , to]) => (
              <Link key={label} className="stat-card" to={to}>
                <span className="stat-value">{stats[label] ?? '...'}</span>
                <span className="stat-label">{label}</span>
              </Link>
            ))}
          </div>
        )}
        <div className="tile-grid">
          {tiles.map(([title, text, to]) => (
            <Link className="tile tile-link" key={title} to={to}>
              <h3>{title}</h3>
              <p>{text}</p>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
