

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();

// Đảm bảo thư mục lưu ảnh tồn tại
const uploadDir = path.join(__dirname, 'public', 'anh');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Cấu hình Multer để lưu file vào public/anh
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueName = Date.now() + '-' + file.originalname;
    cb(null, uniqueName);
  }
});
const upload = multer({ storage: storage });

// API upload ảnh
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ url: `/anh/${req.file.filename}` });
});

// Cho phép truy cập file tĩnh (ảnh)
app.use('/anh', express.static(uploadDir));

// (Tùy chọn) Cho phép truy cập file tĩnh cho React build
app.use(express.static(path.join(__dirname, 'public')));

app.listen(3000, () => {
  console.log('Server started on http://localhost:3000');
});
