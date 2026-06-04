# API config for PWA

The installed PWA runs on the phone, but the business logic and database work must stay on your backend.

Expected flow:

```text
Phone
  -> PWA React
  -> HTTPS API
  -> Node.js/Express backend
  -> MongoDB
```

Create `customer-app/.env` before building:

```env
VITE_API_ORIGIN=https://your-backend-domain.com
```

Then rebuild and deploy:

```bash
npm run build
npm run deploy
```

The frontend currently expects these backend routes:

- `POST /api/khachhang/`
- `GET /api/khachhang/`
- `POST /api/cuahang`
- `GET /api/cuahang`
- `POST /upload`

For local development, you can still use a tunnel:

```env
VITE_API_ORIGIN=https://your-tunnel-url
```
