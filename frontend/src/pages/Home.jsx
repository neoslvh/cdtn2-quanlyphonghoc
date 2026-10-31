import { useAuth } from '../auth';
import { ROLE_LABEL } from './Shell';

// Các chức năng sau sẽ được thêm theo Sprint 2 và 3, hiện chỉ liệt kê để người dùng biết hệ thống sắp có gì.
const TILES = {
  REQUESTER: [['Tra cứu phòng trống', 'Sprint 2'], ['Tạo yêu cầu đăng ký', 'Sprint 2'], ['Theo dõi yêu cầu', 'Sprint 3']],
  APPROVER: [['Duyệt yêu cầu', 'Sprint 3'], ['Lịch học chính khóa', 'Sprint 2']],
  FACILITY_STAFF: [['Quản lý phòng', 'Sprint 2'], ['Quản lý thiết bị', 'Sprint 3']],
  ADMIN: [['Quản lý phòng', 'Sprint 2'], ['Lịch học chính khóa', 'Sprint 2'], ['Quy tắc duyệt', 'Sprint 5']],
};

export default function Home() {
  const { user } = useAuth();
  return (
    <>
      <section className="app-band">
        <h1>Xin chào, {user.fullName}</h1>
        <p>{ROLE_LABEL[user.role]} · {user.organization?.name}</p>
      </section>
      <div className="app-content">
        <div className="tile-grid">
          {(TILES[user.role] || []).map(([title, sprint]) => (
            <div className="tile" key={title}>
              <h3>{title}</h3>
              <p>Sắp có trong {sprint}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
