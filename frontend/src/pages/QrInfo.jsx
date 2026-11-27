import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Button, Descriptions, Result, Spin, Tag } from 'antd';
import { api } from '../api';
import { useAuth } from '../auth';
import { EQUIPMENT_STATUS, EQUIPMENT_TYPE, ROOM_STATUS, ROOM_TYPE, canManageRooms } from '../constants';

// Trang mở ra khi quét mã QR dán tại phòng hoặc trên thiết bị (FR-05, SCRUM-10). Mã QR chứa đường dẫn /qr/{token};
// chưa đăng nhập thì đăng nhập xong quay lại đúng trang này. Trạng thái hiện đúng như hiện tại, kể cả khi ngừng hoạt động.
export default function QrInfo() {
  const { token } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setData(null);
    setError(null);
    api(`/qr/${encodeURIComponent(token)}`).then(setData, setError);
  }, [token]);

  if (error) {
    return (
      <div className="app-content">
        {error.code === 'NOT_FOUND'
          ? <Result status="404" title="Mã QR không hợp lệ" subTitle="Mã này không thuộc phòng hay thiết bị nào trong hệ thống." extra={<Button type="primary" onClick={() => navigate('/')}>Về trang chủ</Button>} />
          : <Alert type="error" showIcon title={error.message} />}
      </div>
    );
  }
  if (!data) return <div className="app-content"><Spin /></div>;

  const room = data.type === 'ROOM' ? data.room : null;
  const eq = data.type === 'EQUIPMENT' ? data.equipment : null;
  const [color, label] = room ? ROOM_STATUS[room.status] || ['default', room.status] : EQUIPMENT_STATUS[eq.status] || ['default', eq.status];

  return (
    <>
      <section className="app-band">
        <h1>{room ? `Phòng ${room.code}` : `Thiết bị ${eq.assetCode}`}</h1>
        <p><Tag color={color}>{label}</Tag> {room ? room.name : eq.name}</p>
      </section>
      <div className="app-content">
        <div className="panel">
          <h2>Thông tin {room ? 'phòng' : 'thiết bị'}</h2>
          {room ? (
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="Mã phòng">{room.code}</Descriptions.Item>
              <Descriptions.Item label="Tên phòng">{room.name}</Descriptions.Item>
              <Descriptions.Item label="Loại phòng">{ROOM_TYPE[room.roomType] || room.roomType}</Descriptions.Item>
              <Descriptions.Item label="Sức chứa">{room.capacity} chỗ</Descriptions.Item>
              <Descriptions.Item label="Trạng thái"><Tag color={color}>{label}</Tag></Descriptions.Item>
            </Descriptions>
          ) : (
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="Mã tài sản">{eq.assetCode}</Descriptions.Item>
              <Descriptions.Item label="Tên thiết bị">{eq.name}</Descriptions.Item>
              <Descriptions.Item label="Loại">{EQUIPMENT_TYPE[eq.equipmentType] || eq.equipmentType}</Descriptions.Item>
              <Descriptions.Item label="Phòng">{eq.room ? eq.room.code : 'Chưa gắn phòng'}</Descriptions.Item>
              <Descriptions.Item label="Tình trạng"><Tag color={color}>{label}</Tag></Descriptions.Item>
            </Descriptions>
          )}
          {room && user.role === 'REQUESTER' && (
            <p className="note" style={{ marginTop: 12 }}>Để check-in, mở yêu cầu đã duyệt của phòng này trong mục Yêu cầu của tôi rồi bấm Quét QR hoặc nhập mã in dưới hình QR.</p>
          )}
          {eq && user.role === 'REQUESTER' && (
            <p className="note" style={{ marginTop: 12 }}>Thiết bị hỏng trong lúc dùng phòng: mở yêu cầu đã duyệt rồi bấm Báo hỏng thiết bị.</p>
          )}
        </div>
        <div className="form-actions">
          {user.role === 'REQUESTER' && <Button type="primary" onClick={() => navigate('/requests?status=APPROVED')}>Yêu cầu đã duyệt của tôi</Button>}
          {eq && canManageRooms(user) && <Button onClick={() => navigate('/equipment')}>Quản lý thiết bị</Button>}
          {room && canManageRooms(user) && <Button onClick={() => navigate('/rooms')}>Quản lý phòng</Button>}
          <Button onClick={() => navigate('/')}>Về trang chủ</Button>
        </div>
      </div>
    </>
  );
}
