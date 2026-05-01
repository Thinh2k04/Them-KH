# GitHub Pages Deploy Instructions

## Cách dễ nhất - Sử dụng gh-pages package:

### 1. Cài đặt dependencies:
```bash
cd customer-app
npm install
```

### 2. Deploy lên GitHub Pages:
```bash
npm run deploy
```

**GHI CHÚ**: `gh-pages` package sẽ:
- Build ứng dụng React
- Tự động push nội dung `dist/` lên branch `gh-pages`
- GitHub Pages sẽ tự động phục vụ từ branch này

### 3. Cấu hình GitHub Pages (nếu cần):
- Vào Repository Settings → Pages
- Source: Deploy from a branch
- Branch: `gh-pages`

Sau khi chạy `npm run deploy`, trang web sẽ có sẵn tại:
`https://Thinh2k04.github.io/Them-KH/`
