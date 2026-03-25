// Script test các API ngrok
const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function testNgrokAPIs() {
  console.log('🧪 Testing Ngrok APIs...\n');
  
  try {
    // 1. Kiểm tra trạng thái ngrok hiện tại
    console.log('1️⃣ Kiểm tra trạng thái ngrok hiện tại:');
    const statusResponse = await axios.get(`${BASE_URL}/admin/ngrok-status`);
    console.log('   Status:', statusResponse.data);
    console.log('');
    
    // 2. Bật ngrok
    console.log('2️⃣ Bật ngrok:');
    const startResponse = await axios.post(`${BASE_URL}/admin/ngrok`);
    console.log('   Start result:', startResponse.data);
    console.log('');
    
    // 3. Kiểm tra trạng thái sau khi bật
    console.log('3️⃣ Kiểm tra trạng thái sau khi bật:');
    const statusAfterStart = await axios.get(`${BASE_URL}/admin/ngrok-status`);
    console.log('   Status:', statusAfterStart.data);
    console.log('');
    
    // Đợi 3 giây
    console.log('⏳ Đợi 3 giây...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    console.log('');
    
    // 4. Tắt ngrok bằng DELETE
    console.log('4️⃣ Tắt ngrok bằng DELETE method:');
    try {
      const stopResponse = await axios.delete(`${BASE_URL}/admin/ngrok`);
      console.log('   Stop result:', stopResponse.data);
    } catch (error) {
      console.log('   Error:', error.response?.data || error.message);
    }
    console.log('');
    
    // 5. Kiểm tra trạng thái sau khi tắt
    console.log('5️⃣ Kiểm tra trạng thái sau khi tắt:');
    const statusAfterStop = await axios.get(`${BASE_URL}/admin/ngrok-status`);
    console.log('   Status:', statusAfterStop.data);
    console.log('');
    
    // 6. Bật ngrok lại để test POST stop
    console.log('6️⃣ Bật ngrok lại để test POST stop:');
    const startAgainResponse = await axios.post(`${BASE_URL}/admin/ngrok`);
    console.log('   Start result:', startAgainResponse.data);
    console.log('');
    
    // Đợi 2 giây
    console.log('⏳ Đợi 2 giây...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('');
    
    // 7. Tắt ngrok bằng POST
    console.log('7️⃣ Tắt ngrok bằng POST method:');
    const stopPostResponse = await axios.post(`${BASE_URL}/admin/ngrok/stop`);
    console.log('   Stop result:', stopPostResponse.data);
    console.log('');
    
    // 8. Test force kill (ngay cả khi ngrok đã tắt)
    console.log('8️⃣ Test force kill (ngay cả khi ngrok đã tắt):');
    const forceKillResponse = await axios.post(`${BASE_URL}/admin/ngrok/force-kill`);
    console.log('   Force kill result:', forceKillResponse.data);
    console.log('');
    
    console.log('✅ Test hoàn tất!');
    
  } catch (error) {
    console.error('❌ Lỗi trong quá trình test:', error.response?.data || error.message);
  }
}

// Chạy test
testNgrokAPIs();
