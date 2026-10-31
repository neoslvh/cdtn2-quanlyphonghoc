export default function AuthLayout({ children }) {
  return (
    <div className="auth-page">
      <header className="auth-top">
        <img src="/vlu-logo.webp" alt="Van Lang University" />
        <span>Hệ thống quản lý phòng học và thiết bị</span>
      </header>
      <div className="auth-body">
        <section className="auth-hero">
          <h1>Đăng ký phòng học và thiết bị nhanh, rõ ràng, đúng quy trình</h1>
          <p>Một nơi duy nhất để tra cứu phòng trống, gửi yêu cầu sử dụng và theo dõi kết quả duyệt qua từng cấp.</p>
          <ul>
            <li>Tra cứu phòng trống theo khung giờ, sức chứa và thiết bị</li>
            <li>Kiểm tra trùng lịch với thời khóa biểu chính khóa của Phòng Đào tạo</li>
            <li>Duyệt nhiều cấp và thông báo kết quả ngay trên hệ thống</li>
          </ul>
        </section>
        <main className="auth-main">{children}</main>
      </div>
    </div>
  );
}
