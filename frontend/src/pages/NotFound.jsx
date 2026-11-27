import { useNavigate } from 'react-router-dom';
import { Button, Result } from 'antd';

// Đường dẫn không tồn tại: báo rõ thay vì lặng lẽ đưa về trang chủ.
export default function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="app-content">
      <Result status="404" title="Không tìm thấy trang" subTitle="Đường dẫn không đúng hoặc trang đã được chuyển đi." extra={<Button type="primary" onClick={() => navigate('/')}>Về trang chủ</Button>} />
    </div>
  );
}
