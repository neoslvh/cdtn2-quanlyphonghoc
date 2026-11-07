const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

// Lưu tệp đính kèm trên đĩa. Tên tệp trên đĩa là UUID ngẫu nhiên, tên gốc chỉ lưu ở cơ sở dữ liệu,
// nên tên người dùng đặt không thể trỏ ra ngoài thư mục lưu trữ.
function createDiskStorage(dir) {
  return {
    async save(buffer, ext) {
      await fs.mkdir(dir, { recursive: true });
      const name = `${crypto.randomUUID()}${ext}`;
      await fs.writeFile(path.join(dir, name), buffer);
      return name;
    },
    // Xóa tệp đã lưu, dùng khi lưu bản ghi cơ sở dữ liệu thất bại. Tên tệp do chính save tạo ra nên không chứa đường dẫn.
    async remove(name) {
      await fs.rm(path.join(dir, path.basename(name)), { force: true });
    },
  };
}

module.exports = { createDiskStorage };
