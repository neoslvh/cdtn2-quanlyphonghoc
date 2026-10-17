import { useEffect, useState } from 'react';
import { Alert, Card, Spin } from 'antd';

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/hello')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`API trả về mã ${res.status}`))))
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div style={{ maxWidth: 480, margin: '64px auto', padding: 16 }}>
      <Card title="Hệ thống quản lý phòng học và thiết bị">
        {error && <Alert type="error" showIcon message="Không kết nối được API" description={error} />}
        {!error && !data && <Spin />}
        {data && <Alert type="success" showIcon message={data.message} description={`Số phòng trong cơ sở dữ liệu: ${data.roomCount}`} />}
      </Card>
    </div>
  );
}
