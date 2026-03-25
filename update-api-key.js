// Script để CẬP NHẬT Gemini API key vào MongoDB
require('dotenv').config();
const mongoose = require('mongoose');
const readline = require('readline');

const ConfigSchema = new mongoose.Schema({
  genaiApiKey: { type: String, default: '' },
  genaiModel: { type: String, default: '' },
  useAI: { type: Boolean, default: true },
  useAITrain: { type: Boolean, default: true },
  pageAccessToken: { type: String, default: '' },
  verifyToken: { type: String, default: '' },
  lastAutoModel: { type: String, default: '' },
  lastAutoAt: { type: Date }
});

const Config = mongoose.model('Config', ConfigSchema);

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer);
    });
  });
}

async function updateApiKey() {
  try {
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║   CẬP NHẬT GEMINI API KEY VÀO DATABASE          ║');
    console.log('╚══════════════════════════════════════════════════╝\n');
    
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');
    
    // Get current config
    let config = await Config.findOne();
    
    if (config && config.genaiApiKey) {
      console.log('📌 API Key hiện tại trong database:');
      console.log(`   ${config.genaiApiKey.slice(0, 15)}...${config.genaiApiKey.slice(-10)}\n`);
    } else {
      console.log('⚠️  Chưa có API key trong database\n');
    }
    
    // Ask for new API key
    console.log('💡 LÀM THẾ NÀO ĐỂ LẤY API KEY PRO:');
    console.log('   1. Truy cập: https://aistudio.google.com/app/apikey');
    console.log('   2. Đăng nhập với tài khoản Google Pro của bạn');
    console.log('   3. Click "Create API Key" hoặc chọn API key có sẵn');
    console.log('   4. Copy API key (dạng: AIzaSy...)\n');
    
    const newApiKey = await question('🔑 Nhập Gemini API key mới (hoặc Enter để skip): ');
    
    if (!newApiKey || newApiKey.trim() === '') {
      console.log('\n❌ Bạn chưa nhập API key, thoát...');
      rl.close();
      await mongoose.connection.close();
      return;
    }
    
    const trimmedKey = newApiKey.trim();
    
    // Validate API key format
    if (!trimmedKey.startsWith('AIza')) {
      console.log('\n⚠️  WARNING: API key không đúng format Gemini (thường bắt đầu với "AIza")');
      const confirm = await question('   Bạn vẫn muốn lưu? (y/n): ');
      if (confirm.toLowerCase() !== 'y') {
        console.log('\n❌ Đã hủy');
        rl.close();
        await mongoose.connection.close();
        return;
      }
    }
    
    // Ask for model (optional)
    console.log('\n🤖 Chọn model (hoặc Enter để dùng mặc định):');
    console.log('   1. models/gemini-2.0-flash (recommended)');
    console.log('   2. models/gemini-1.5-flash');
    console.log('   3. models/gemini-1.5-pro (mạnh nhất)');
    console.log('   4. models/gemini-2.0-flash-exp');
    
    const modelChoice = await question('\nChọn (1-4) hoặc Enter: ');
    
    const modelMap = {
      '1': 'models/gemini-2.0-flash',
      '2': 'models/gemini-1.5-flash',
      '3': 'models/gemini-1.5-pro',
      '4': 'models/gemini-2.0-flash-exp'
    };
    
    const selectedModel = modelMap[modelChoice] || 'models/gemini-2.0-flash';
    
    // Update or create config
    if (!config) {
      config = await Config.create({
        genaiApiKey: trimmedKey,
        genaiModel: selectedModel,
        useAI: true,
        useAITrain: true
      });
      console.log('\n✅ Đã TẠO MỚI config trong database');
    } else {
      config.genaiApiKey = trimmedKey;
      config.genaiModel = selectedModel;
      await config.save();
      console.log('\n✅ Đã CẬP NHẬT config trong database');
    }
    
    console.log('\n📊 ===== THÔNG TIN ĐÃ LƯU =====');
    console.log(`🔑 API Key: ${trimmedKey.slice(0, 15)}...${trimmedKey.slice(-10)}`);
    console.log(`🤖 Model: ${selectedModel}`);
    console.log(`🤖 AI Enabled: ${config.useAI ? 'Yes' : 'No'}`);
    console.log(`📚 AI Training: ${config.useAITrain ? 'Yes' : 'No'}`);
    console.log('================================\n');
    
    console.log('💡 BƯỚC TIẾP THEO:');
    console.log('   1. Restart server: npm start');
    console.log('   2. Server sẽ tự động load API key từ database');
    console.log('   3. Kiểm tra logs khi start để xác nhận API key đã được load\n');
    
    // Also update .env file
    const updateEnv = await question('📝 Bạn có muốn cập nhật vào file .env luôn không? (y/n): ');
    
    if (updateEnv.toLowerCase() === 'y') {
      const fs = require('fs');
      const envPath = '.env';
      
      try {
        let envContent = fs.readFileSync(envPath, 'utf8');
        
        // Update or add GEMINI_API_KEY
        if (envContent.includes('GEMINI_API_KEY=')) {
          envContent = envContent.replace(/GEMINI_API_KEY=.*$/m, `GEMINI_API_KEY=${trimmedKey}`);
        } else if (envContent.includes('# GEMINI_API_KEY=')) {
          envContent = envContent.replace(/# GEMINI_API_KEY=.*$/m, `GEMINI_API_KEY=${trimmedKey}`);
        } else {
          envContent += `\nGEMINI_API_KEY=${trimmedKey}`;
        }
        
        // Update or add GENAI_MODEL
        if (envContent.includes('GENAI_MODEL=')) {
          envContent = envContent.replace(/GENAI_MODEL=.*$/m, `GENAI_MODEL=${selectedModel}`);
        } else if (envContent.includes('# GENAI_MODEL=')) {
          envContent = envContent.replace(/# GENAI_MODEL=.*$/m, `GENAI_MODEL=${selectedModel}`);
        } else {
          envContent += `\nGENAI_MODEL=${selectedModel}`;
        }
        
        fs.writeFileSync(envPath, envContent);
        console.log('✅ Đã cập nhật file .env\n');
      } catch (err) {
        console.log(`⚠️  Không thể update .env: ${err.message}\n`);
      }
    }
    
    console.log('🎉 HOÀN TẤT!\n');
    
    rl.close();
    await mongoose.connection.close();
    console.log('✅ Disconnected from MongoDB');
    
  } catch (error) {
    console.error('❌ Lỗi:', error.message);
    rl.close();
    process.exit(1);
  }
}

// Run
updateApiKey();
