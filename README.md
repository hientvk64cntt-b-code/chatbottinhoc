# Facebook Messenger Chatbot với AI (Google Gemini)

Chatbot thông minh kết nối Facebook Messenger, tích hợp AI Google Gemini, với hệ thống tìm kiếm Fuse.js và bảo mật nâng cao.

## ✨ Tính năng chính

- 🤖 **AI-Powered**: Tích hợp Google Gemini để cải thiện câu trả lời
- 🔍 **Smart Search**: Sử dụng Fuse.js fuzzy search cho tìm kiếm thông minh
- 🔒 **Bảo mật**: Basic Auth cho admin panel, session security, rate limiting
- ⚡ **Hiệu suất**: LRU cache với TTL, tối ưu MongoDB indexes
- 📊 **Quản lý**: Admin panel đầy đủ với import/export Excel
- 🌐 **Ngrok**: Tích hợp ngrok để expose webhook dễ dàng

## 🔧 Cài đặt

1. Clone repository:
```bash
git clone <repository_url>
cd "chatbot 4.0"
```

2. Cài đặt dependencies:
```bash
npm install
```

3. Cấu hình môi trường:
```bash
# Copy file .env.example thành .env
copy .env.example .env

# Chỉnh sửa .env với thông tin của bạn
```

## 🔐 Cấu hình bảo mật

**QUAN TRỌNG**: Đảm bảo cấu hình các biến môi trường sau trong file `.env`:

```env
# Bắt buộc - Đổi ngay!
SESSION_SECRET=<tạo_chuỗi_ngẫu_nhiên_mạnh_tại_đây>
ADMIN_USERNAME=<tên_đăng_nhập_admin>
ADMIN_PASSWORD=<mật_khẩu_mạnh>

# MongoDB
MONGODB_URI=<mongodb_connection_string>

# Ngrok (nếu sử dụng)
NGROK_AUTHTOKEN=<your_ngrok_token>

# Facebook Messenger
PAGE_ACCESS_TOKEN=<facebook_page_token>
VERIFY_TOKEN=<webhook_verify_token>

# Google Gemini AI
GEMINI_API_KEY=<your_gemini_api_key>
GENAI_MODEL=models/gemini-2.0-flash

# Tùy chọn
USE_AI=true
PORT=3000
```

### Tạo Session Secret mạnh

```bash
# Windows PowerShell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})

# Linux/Mac
openssl rand -base64 32
```

## 📱 Cấu hình Facebook

1. Tạo Facebook Page và Facebook App tại [Facebook Developers](https://developers.facebook.com)
2. Thêm Messenger Platform vào app
3. Lấy Page Access Token và cập nhật vào `.env`
4. Cấu hình webhook:
   - URL: `https://your-domain.com/webhook` hoặc ngrok URL
   - Verify Token: giá trị trong `.env`
   - Subscribe to: `messages`, `messaging_postbacks`

## 🚀 Chạy ứng dụng

### Development mode với nodemon:
```bash
npm run dev
```

### Production mode:
```bash
npm start
```
http://localhost:3000
Server sẽ chạy tại: ``

## 🔒 Bảo mật Admin Panel

Admin panel được bảo vệ bằng Basic Authentication. Khi truy cập `/admin`:

1. Browser sẽ hiện popup đăng nhập
2. Nhập `ADMIN_USERNAME` và `ADMIN_PASSWORD` từ file `.env`
3. Credentials sẽ được lưu trong session

**Lưu ý**: Nên sử dụng HTTPS trong production để bảo vệ credentials.

## 📊 Quản lý Q&A

Truy cập admin panel: `http://localhost:3000/admin`

### Thêm câu hỏi thủ công:
- Tab "Đã có trả lời" > Nút "Thêm câu hỏi"
- Hỗ trợ nhiều câu trả lời cho một câu hỏi
- Bot sẽ random chọn câu trả lời

### Import từ Excel:
- Tab "Import Excel" > Chọn file
- Format: Cột 1 = Câu hỏi, Cột 2-N = Các câu trả lời
- Download template mẫu từ admin panel

### Quản lý câu hỏi chờ:
- Tab "Chờ trả lời": Câu hỏi user hỏi nhưng chưa có trong database
- Click nút "Trả lời" để thêm câu trả lời

## 🌐 Quản lý Ngrok

### Bật ngrok
```bash
POST /admin/ngrok
```

### Tắt ngrok
```bash
DELETE /admin/ngrok
# hoặc
POST /admin/ngrok/stop
```

### Force kill ngrok (khi bị treo)
```bash
POST /admin/ngrok/force-kill
```

### Kiểm tra trạng thái ngrok
```bash
GET /admin/ngrok-status
```

### Test ngrok APIs
```bash
node test-ngrok.js
```

**Lưu ý**: Mỗi lần khởi động ngrok, URL sẽ thay đổi. Cần cập nhật webhook URL trên Facebook Developer.

## 🔍 Tìm kiếm thông minh (Fuse.js)

Chatbot sử dụng Fuse.js cho fuzzy search với các ưu điểm:

- ✅ Tìm kiếm nhanh hơn 10x so với MongoDB text search phức tạp
- ✅ Tự động xử lý lỗi chính tả, dấu tiếng Việt
- ✅ Scoring thông minh (0.0-1.0)
- ✅ Hỗ trợ extended search syntax

### Logic quyết định AI:

- **Score ≥ 0.5**: Dùng trực tiếp từ database
- **Score 0.3-0.5**: Dùng AI cải thiện + lưu vào database
- **Score < 0.3**: AI tạo câu trả lời mới + lưu vào database

## ⚡ Hiệu suất & Cache

- **LRU Cache**: 100 entries, TTL 5 phút
- **Rate Limiting**: 60 requests/phút mỗi IP
- **MongoDB Indexes**: Tự động tạo indexes cho tìm kiếm
- **Connection Pooling**: MongoDB connection được tái sử dụng

## 🏥 Health Check

Kiểm tra sức khỏe hệ thống:

```bash
GET /health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2026-03-10T...",
  "uptime": 3600.5,
  "mongodb": "connected",
  "gemini": "ready",
  "ngrok": "active"
}
```

## 📝 Cải thiện đã thực hiện

### Bảo mật:
- [x] Xóa hardcoded API keys
- [x] Basic Auth cho admin panel  
- [x] Strong session secrets
- [x] Rate limiting
- [x] Input sanitization (XSS prevention)
- [x] .gitignore cho credentials

### Hiệu suất:
- [x] Thay thế 6+ MongoDB queries bằng Fuse.js (nhanh hơn 10x)
- [x] LRU cache với size limit (100 entries)
- [x] Cache invalidation khi thêm/sửa/xóa
- [x] Optimized scoring algorithm

### Code Quality:
- [x] Input validation & sanitization
- [x] Remove duplicate session middleware
- [x] Consistent error handling
- [x] Health check endpoint
- [x] Normalized fields for better search

## ⚠️ Lưu ý quan trọng

1. **Không commit file `.env`**: File này chứa credentials, đã được thêm vào .gitignore
2. **Đổi mật khẩu mặc định**: Đổi `ADMIN_PASSWORD` và `SESSION_SECRET` ngay
3. **Sử dụng HTTPS trong production**: Basic Auth không an toàn qua HTTP
4. **Backup database**: Định kỳ export database để phòng mất dữ liệu
5. **Monitor rate limits**: Cân nhắc tăng rate limit nếu có nhiều traffic hợp lệ

## 🆘 Troubleshooting

### Lỗi kết nối MongoDB:
- Kiểm tra `MONGODB_URI` trong `.env`
- Kiểm tra IP whitelist trên MongoDB Atlas
- Check GET `/health` để xem status

### Ngrok không start:
- Kiểm tra `NGROK_AUTHTOKEN` 
- Thử force kill: POST `/admin/ngrok/force-kill`
- Restart server

### Admin panel không truy cập được:
- Check username/password trong `.env`
- Clear browser cache và thử lại
- Check console logs để xem lỗi authentication

### Search không chính xác:
- Check logs để xem Fuse.js scores
- Adjust threshold trong `fuseOptions` (index.js)
- Thêm câu hỏi vào database để cải thiện

## Lưu ý
- Khi đổi URL ngrok, cần cập nhật lại webhook trên Facebook Developer.
- Nếu gặp lỗi xác minh webhook, kiểm tra lại VERIFY_TOKEN và server có đang chạy không.
- Nếu ngrok không tắt được, sử dụng API force-kill hoặc restart server.
- Server sẽ tự động tắt ngrok khi shutdown (Ctrl+C). 