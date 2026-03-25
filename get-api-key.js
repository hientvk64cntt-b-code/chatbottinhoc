// Script để lấy API key từ MongoDB
require('dotenv').config();
const mongoose = require('mongoose');

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

async function getApiKeyFromDatabase() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');
    
    const config = await Config.findOne();
    
    if (!config) {
      console.log('❌ Không tìm thấy config trong database');
      console.log('💡 Có thể chưa có config, hãy chạy server một lần để tạo config');
      process.exit(0);
    }
    
    console.log('📊 ===== THÔNG TIN CẤU HÌNH =====\n');
    
    // Gemini API
    if (config.genaiApiKey) {
      console.log('🔑 Gemini API Key:');
      console.log(`   Full: ${config.genaiApiKey}`);
      console.log(`   Masked: ${config.genaiApiKey.slice(0, 8)}...${config.genaiApiKey.slice(-8)}\n`);
    } else {
      console.log('⚠️  Gemini API Key: (chưa cấu hình)\n');
    }
    
    // Model
    if (config.genaiModel) {
      console.log(`🤖 Model: ${config.genaiModel}\n`);
    } else {
      console.log('⚠️  Model: (chưa cấu hình)\n');
    }
    
    // Facebook Tokens
    if (config.pageAccessToken) {
      console.log('📱 Facebook Page Access Token:');
      console.log(`   Full: ${config.pageAccessToken}`);
      console.log(`   Masked: ${config.pageAccessToken.slice(0, 20)}...${config.pageAccessToken.slice(-20)}\n`);
    } else {
      console.log('⚠️  Facebook Page Access Token: (chưa cấu hình)\n');
    }
    
    if (config.verifyToken) {
      console.log(`🔐 Verify Token: ${config.verifyToken}\n`);
    } else {
      console.log('⚠️  Verify Token: (chưa cấu hình)\n');
    }
    
    // AI Settings
    console.log(`🤖 AI Enabled: ${config.useAI ? '✅ Yes' : '❌ No'}`);
    console.log(`📚 AI Training: ${config.useAITrain ? '✅ Yes' : '❌ No'}\n`);
    
    // Last auto-select
    if (config.lastAutoModel) {
      console.log(`🔄 Last Auto-Selected Model: ${config.lastAutoModel}`);
      console.log(`📅 Auto-Selected At: ${config.lastAutoAt?.toLocaleString() || 'N/A'}\n`);
    }
    
    console.log('===================================\n');
    
    // Copy instruction
    if (config.genaiApiKey) {
      console.log('💡 TIP: Copy API key ở trên và dán vào file .env:');
      console.log(`   GEMINI_API_KEY=${config.genaiApiKey}\n`);
    }
    
    await mongoose.connection.close();
    console.log('✅ Disconnected from MongoDB');
    
  } catch (error) {
    console.error('❌ Lỗi:', error.message);
    process.exit(1);
  }
}

// Run
getApiKeyFromDatabase();
