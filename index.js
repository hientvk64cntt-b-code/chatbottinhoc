require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const mongoose = require('mongoose');
const session = require('express-session');
const methodOverride = require('method-override');
const Question = require('./models/Question');
const multer = require('multer');
const xlsx = require('xlsx');
const fs = require('fs');
const { execSync } = require('child_process');
const Fuse = require('fuse.js');

if (!process.env.NGROK_AUTHTOKEN) {
  console.warn('⚠️  NGROK_AUTHTOKEN not set in .env file');
}
const NGROK_AUTHTOKEN = process.env.NGROK_AUTHTOKEN;

const upload = multer({ dest: 'uploads/' });
const PendingQuestion = require('./models/PendingQuestion');
const DefaultResponse = require('./models/DefaultResponse');
const ngrok = require('ngrok');
const { normalizeTextGemini, getFinalAIResponse, classifyQuestion, getCachedModelName, setCachedModelName, probeCandidateModels, setApiKey, getApiKeyMasked, listAvailableModels, handleQuotaExceeded, isGeminiInitialized, getGeminiStatus } = require('./gemini-handler');

// Function to remove Vietnamese diacritics for better search
function removeVietnameseDiacritics(str) {
  const diacriticsMap = {
    'à': 'a', 'á': 'a', 'ạ': 'a', 'ả': 'a', 'ã': 'a', 'â': 'a', 'ầ': 'a', 'ấ': 'a', 'ậ': 'a', 'ẩ': 'a', 'ẫ': 'a', 'ă': 'a', 'ằ': 'a', 'ắ': 'a', 'ặ': 'a', 'ẳ': 'a', 'ẵ': 'a',
    'è': 'e', 'é': 'e', 'ẹ': 'e', 'ẻ': 'e', 'ẽ': 'e', 'ê': 'e', 'ề': 'e', 'ế': 'e', 'ệ': 'e', 'ể': 'e', 'ễ': 'e',
    'ì': 'i', 'í': 'i', 'ị': 'i', 'ỉ': 'i', 'ĩ': 'i',
    'ò': 'o', 'ó': 'o', 'ọ': 'o', 'ỏ': 'o', 'õ': 'o', 'ô': 'o', 'ồ': 'o', 'ố': 'o', 'ộ': 'o', 'ổ': 'o', 'ỗ': 'o', 'ơ': 'o', 'ờ': 'o', 'ớ': 'o', 'ợ': 'o', 'ở': 'o', 'ỡ': 'o',
    'ù': 'u', 'ú': 'u', 'ụ': 'u', 'ủ': 'u', 'ũ': 'u', 'ư': 'u', 'ừ': 'u', 'ứ': 'u', 'ự': 'u', 'ử': 'u', 'ữ': 'u',
    'ỳ': 'y', 'ý': 'y', 'ỵ': 'y', 'ỷ': 'y', 'ỹ': 'y',
    'đ': 'd',
    'À': 'A', 'Á': 'A', 'Ạ': 'A', 'Ả': 'A', 'Ã': 'A', 'Â': 'A', 'Ầ': 'A', 'Ấ': 'A', 'Ậ': 'A', 'Ẩ': 'A', 'Ẫ': 'A', 'Ă': 'A', 'Ằ': 'A', 'Ắ': 'A', 'Ặ': 'A', 'Ẳ': 'A', 'Ẵ': 'A',
    'È': 'E', 'É': 'E', 'Ẹ': 'E', 'Ẻ': 'E', 'Ẽ': 'E', 'Ê': 'E', 'Ề': 'E', 'Ế': 'E', 'Ệ': 'E', 'Ể': 'E', 'Ễ': 'E',
    'Ì': 'I', 'Í': 'I', 'Ị': 'I', 'Ỉ': 'I', 'Ĩ': 'I',
    'Ò': 'O', 'Ó': 'O', 'Ọ': 'O', 'Ỏ': 'O', 'Õ': 'O', 'Ô': 'O', 'Ồ': 'O', 'Ố': 'O', 'Ộ': 'O', 'Ổ': 'O', 'Ỗ': 'O', 'Ơ': 'O', 'Ờ': 'O', 'Ớ': 'O', 'Ợ': 'O', 'Ở': 'O', 'Ỡ': 'O',
    'Ù': 'U', 'Ú': 'U', 'Ụ': 'U', 'Ủ': 'U', 'Ũ': 'U', 'Ư': 'U', 'Ừ': 'U', 'Ứ': 'U', 'Ự': 'U', 'Ử': 'U', 'Ữ': 'U',
    'Ỳ': 'Y', 'Ý': 'Y', 'Ỵ': 'Y', 'Ỷ': 'Y', 'Ỹ': 'Y',
    'Đ': 'D'
  };
  
  return str.replace(/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]/g, char => diacriticsMap[char] || char);
}
let ngrokActive = false;
let ngrokUrl = null;

let ngrokSession = null;

const app = express();

const Config = require('./models/Config');
let runtimeConfig = null; // will load from DB

// Load persisted config from DB (if any)
async function loadRuntimeConfig() {
  try {
    runtimeConfig = await Config.findOne();
    if (!runtimeConfig) {
      runtimeConfig = await Config.create({ 
        genaiApiKey: process.env.GEMINI_API_KEY || '', 
        genaiModel: process.env.GENAI_MODEL || ''
      });
    }
    // apply loaded config to runtime
    if (runtimeConfig.genaiApiKey) {
      console.log(`🔑 Setting API key: ${runtimeConfig.genaiApiKey.slice(0, 8)}...`);
      setApiKey(runtimeConfig.genaiApiKey);
    } else {
      console.log('⚠️ No API key found in database');
    }
    if (runtimeConfig.genaiModel) {
      console.log(`🤖 Setting model: ${runtimeConfig.genaiModel}`);
      setCachedModelName(runtimeConfig.genaiModel);
    }
    console.log(`✅ Loaded runtime config`);
  } catch (e) {
    console.error('Failed to load runtime config:', e?.message || e);
  }
}

// Save runtime config helper
async function saveRuntimeConfig(updates) {
  try {
    runtimeConfig = await Config.findOneAndUpdate({}, updates, { upsert: true, new: true });
    return runtimeConfig;
  } catch (e) {
    console.error('Failed to save runtime config:', e?.message || e);
    throw e;
  }
}

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

if (!process.env.SESSION_SECRET) {
  console.error('❌ SESSION_SECRET not set! Using insecure default.');
}
app.use(session({ 
  secret: process.env.SESSION_SECRET || 'INSECURE_CHANGE_ME', 
  resave: false, 
  saveUninitialized: true,
  cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
}));
app.use(methodOverride('_method'));

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Admin authentication middleware
function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  
  if (!auth || !auth.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin Panel"');
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const credentials = Buffer.from(auth.slice(6), 'base64').toString().split(':');
  const username = credentials[0];
  const password = credentials[1];
  
  const validUsername = process.env.ADMIN_USERNAME || 'admin';
  const validPassword = process.env.ADMIN_PASSWORD || 'changeme';
  
  if (username === validUsername && password === validPassword) {
    next();
  } else {
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin Panel"');
    res.status(401).json({ error: 'Invalid credentials' });
  }
}

// Simple rate limiting
const rateLimitMap = new Map();
const RATE_LIMIT = 60; // requests per minute
const RATE_WINDOW = 60 * 1000; // 1 minute

function rateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  
  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_WINDOW });
    return next();
  }
  
  const rateData = rateLimitMap.get(ip);
  
  if (now > rateData.resetTime) {
    rateData.count = 1;
    rateData.resetTime = now + RATE_WINDOW;
    return next();
  }
  
  if (rateData.count >= RATE_LIMIT) {
    return res.status(429).json({ error: 'Too many requests, please try again later' });
  }
  
  rateData.count++;
  next();
}

// Clean up rate limit map periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of rateLimitMap.entries()) {
    if (now > data.resetTime) {
      rateLimitMap.delete(ip);
    }
  }
}, 5 * 60 * 1000); // Every 5 minutes

// Input sanitization helper
function sanitizeInput(str) {
  if (typeof str !== 'string') return str;
  return str.trim().replace(/[<>]/g, ''); // Basic XSS prevention
}

// Apply authentication and rate limiting to all /admin routes
app.use('/admin', requireAuth, rateLimit);

// Route bật/tắt ngrok với retry logic
app.post('/admin/ngrok', async (req, res) => {
  const maxRetries = 3;
  let retryCount = 0;
  
  const startNgrok = async () => {
    try {
      // Kiểm tra authtoken đã cấu hình chưa (file ngrok.yml)
      let authtokenConfigured = false;
      try {
        const fs = require('fs');
        const homedir = require('os').homedir();
        const configPath = `${homedir}/.ngrok2/ngrok.yml`;
        if (fs.existsSync(configPath)) {
          const content = fs.readFileSync(configPath, 'utf8');
          if (content.includes(NGROK_AUTHTOKEN)) authtokenConfigured = true;
        }
      } catch (e) {}
      
      // Nếu chưa cấu hình authtoken thì tự động chạy lệnh
      if (!authtokenConfigured) {
        try {
          const path = require('path');
          const ngrokExe = path.join(__dirname, 'ngrok.exe');
          execSync(`"${ngrokExe}" config add-authtoken ${NGROK_AUTHTOKEN}`);
          authtokenConfigured = true;
        } catch (e) {
          throw new Error('Không thể cấu hình ngrok authtoken: ' + e.message);
        }
      }
      
      // Dọn dẹp ngrok cũ nếu có
      if (ngrokActive && ngrokSession) {
        try {
          await ngrok.disconnect();
          await ngrok.kill();
        } catch (e) {
          console.error('Ngrok disconnect/kill error:', e);
        }
        ngrokActive = false;
        ngrokUrl = null;
        ngrokSession = null;
      }
      
      // Đợi một chút để đảm bảo ngrok cũ đã tắt hoàn toàn
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const port = parseInt(process.env.PORT, 10) || 3000;
      ngrokUrl = await ngrok.connect({ addr: port });
      ngrokActive = true;
      ngrokSession = true;
      
      return { success: true, url: ngrokUrl };
    } catch (err) {
      ngrokActive = false;
      ngrokUrl = null;
      ngrokSession = null;
      throw err;
    }
  };
  
  // Retry logic
  while (retryCount < maxRetries) {
    try {
      const result = await startNgrok();
      return res.json(result);
    } catch (err) {
      retryCount++;
      console.error(`Ngrok attempt ${retryCount} failed:`, err.message);
      
      // Nếu là lỗi "invalid tunnel configuration" và chưa hết retry
      if (err.message.includes('invalid tunnel configuration') && retryCount < maxRetries) {
        console.log(`Retrying ngrok in 2 seconds... (${retryCount}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        continue;
      }
      
      // Nếu hết retry hoặc lỗi khác
      return res.json({ 
        success: false, 
        error: err.message,
        retryCount: retryCount,
        maxRetries: maxRetries
      });
    }
  }
});

// Route tắt ngrok (DELETE method)
app.delete('/admin/ngrok', async (req, res) => {
  try {
    if (ngrokActive && ngrokSession) {
      console.log('🔄 Đang tắt ngrok...');
      
      // Tắt ngrok
      await ngrok.disconnect();
      await ngrok.kill();
      
      // Reset các biến
      ngrokActive = false;
      ngrokUrl = null;
      ngrokSession = null;
      
      console.log('✅ Đã tắt ngrok thành công');
      res.json({ success: true, message: 'Đã tắt ngrok thành công' });
    } else {
      console.log('ℹ️ Ngrok chưa được bật');
      res.json({ success: false, message: 'Ngrok chưa được bật' });
    }
  } catch (error) {
    console.error('❌ Lỗi khi tắt ngrok:', error);
    
    // Force reset các biến ngay cả khi có lỗi
    ngrokActive = false;
    ngrokUrl = null;
    ngrokSession = null;
    
    res.json({ 
      success: false, 
      error: error.message || 'Lỗi khi tắt ngrok',
      message: 'Đã force reset trạng thái ngrok'
    });
  }
});

// Route tắt ngrok (POST method - alternative)
app.post('/admin/ngrok/stop', async (req, res) => {
  try {
    if (ngrokActive && ngrokSession) {
      console.log('🔄 Đang tắt ngrok...');
      
      // Tắt ngrok
      await ngrok.disconnect();
      await ngrok.kill();
      
      // Reset các biến
      ngrokActive = false;
      ngrokUrl = null;
      ngrokSession = null;
      
      console.log('✅ Đã tắt ngrok thành công');
      res.json({ success: true, message: 'Đã tắt ngrok thành công' });
    } else {
      console.log('ℹ️ Ngrok chưa được bật');
      res.json({ success: false, message: 'Ngrok chưa được bật' });
    }
  } catch (error) {
    console.error('❌ Lỗi khi tắt ngrok:', error);
    
    // Force reset các biến ngay cả khi có lỗi
    ngrokActive = false;
    ngrokUrl = null;
    ngrokSession = null;
    
    res.json({ 
      success: false, 
      error: error.message || 'Lỗi khi tắt ngrok',
      message: 'Đã force reset trạng thái ngrok'
    });
  }
});

// Route force kill ngrok (trong trường hợp ngrok bị treo)
app.post('/admin/ngrok/force-kill', async (req, res) => {
  try {
    console.log('🔄 Force killing tất cả process ngrok...');
    
    // Force reset các biến trước
    ngrokActive = false;
    ngrokUrl = null;
    ngrokSession = null;
    
    // Thử disconnect và kill
    try {
      await ngrok.disconnect();
      await ngrok.kill();
    } catch (e) {
      console.log('⚠️ Ngrok disconnect/kill failed, trying alternative methods...');
    }
    
    // Thử kill process ngrok bằng command line (Windows)
    try {
      const { exec } = require('child_process');
      exec('taskkill /f /im ngrok.exe', (error, stdout, stderr) => {
        if (error) {
          console.log('⚠️ Không tìm thấy process ngrok.exe để kill');
        } else {
          console.log('✅ Đã kill process ngrok.exe');
        }
      });
    } catch (e) {
      console.log('⚠️ Không thể kill process ngrok.exe:', e.message);
    }
    
    console.log('✅ Force kill ngrok hoàn tất');
    res.json({ 
      success: true, 
      message: 'Đã force kill tất cả process ngrok và reset trạng thái' 
    });
  } catch (error) {
    console.error('❌ Lỗi khi force kill ngrok:', error);
    
    // Force reset các biến ngay cả khi có lỗi
    ngrokActive = false;
    ngrokUrl = null;
    ngrokSession = null;
    
    res.json({ 
      success: false, 
      error: error.message || 'Lỗi khi force kill ngrok',
      message: 'Đã force reset trạng thái ngrok'
    });
  }
});

// Route lấy trạng thái ngrok
app.get('/admin/ngrok-status', (req, res) => {
  res.json({ active: ngrokActive, url: ngrokUrl });
});

// Kết nối MongoDB
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {
    console.log('Đã kết nối MongoDB thành công');
    // Tạo Text Index cho collection questions với weights
    try {
      // Force drop tất cả text indexes cũ
      console.log('🔄 Dropping old text indexes...');
      await Question.collection.dropIndex('question_text').catch(() => {});
      await Question.collection.dropIndex('question_text_index').catch(() => {});
      await Question.collection.dropIndex('question_text_index_v2').catch(() => {});
      await Question.collection.dropIndex('question_text_index_v3').catch(() => {});
      
      // List all indexes để debug
      const indexes = await Question.collection.listIndexes().toArray();
      console.log('📋 Current indexes:', indexes.map(i => ({ name: i.name, key: i.key })));
      
      // Tạo index mới với cả text có dấu và không dấu
      console.log('🔄 Creating new text index...');
      return Question.collection.createIndex({ 
        question: 'text', 
        answers: 'text',
        question_normalized: 'text',
        answers_normalized: 'text'
      }, { 
        weights: { 
          question: 10,  // Question có trọng số cao hơn
          answers: 5,    // Answers có trọng số thấp hơn
          question_normalized: 8,  // Question không dấu
          answers_normalized: 4    // Answers không dấu
        },
        name: 'question_text_index_v2'
      });
    } catch (error) {
      if (error.code === 85) { // IndexOptionsConflict
        console.log('⚠️ Index conflict detected, trying alternative approach...');
        
        // Try to create with different name
        try {
          return Question.collection.createIndex({ 
            question: 'text', 
            answers: 'text',
            question_normalized: 'text',
            answers_normalized: 'text'
          }, { 
            weights: { 
              question: 10,
              answers: 5,
              question_normalized: 8,
              answers_normalized: 4
            },
            name: 'question_text_index_v3'
          });
        } catch (e2) {
          console.log('⚠️ Using existing index, skipping creation');
          return Promise.resolve();
        }
      }
      throw error;
    }
  })
  .then(() => {
    console.log('Đã tạo Text Index cho collection questions');
    // Load runtime config from DB
    return loadRuntimeConfig();
  })
  .then(async () => {
    // After loading runtime config, auto-select a model if none configured
    try {
      if (runtimeConfig && (!runtimeConfig.genaiModel || runtimeConfig.genaiModel.trim() === '')) {
        console.log('No genaiModel in config — attempting auto-select');
        const models = await listAvailableModels();
        const preferredOrder = ['models/gemini-2.0-flash', 'models/gemini-2.5-flash', 'models/gemini-2.0-flash-001', 'models/gemini-2.5-pro'];
        let pick = null;
        for (const p of preferredOrder) {
          if (models.includes(p)) { pick = p; break; }
        }
        if (!pick && models.length > 0) pick = models[0];
        if (pick) {
          setCachedModelName(pick);
          try { await saveRuntimeConfig({ genaiModel: pick, lastAutoModel: pick, lastAutoAt: new Date() }); } catch (e) { console.error('Failed to persist auto-selected model:', e); }
          console.log('Auto-selected model on startup:', pick);
        } else {
          console.log('Auto-select found no models');
        }
      }
    } catch (e) {
      console.error('Auto-select on startup failed:', e?.message || e);
    }
  })
  .catch(err => {
    console.error('Lỗi kết nối MongoDB:', err);
  });

app.set('view engine', 'ejs');
app.use(methodOverride('_method'));

// Health check endpoint
app.get('/health', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    mongodb: 'disconnected',
    gemini: 'not_configured',
    ngrok: ngrokActive ? 'active' : 'inactive'
  };
  
  // Check MongoDB connection
  try {
    if (mongoose.connection.readyState === 1) {
      health.mongodb = 'connected';
    }
  } catch (e) {
    health.mongodb = 'error';
  }
  
  // Check Gemini API
  try {
    const geminiStatus = getGeminiStatus();
    health.gemini = geminiStatus.status;
  } catch (e) {
    health.gemini = 'error';
  }
  
  const statusCode = health.mongodb === 'connected' ? 200 : 503;
  res.status(statusCode).json(health);
});

// Trang test chatbot
app.get('/test', (req, res) => {
  res.render('test');
});

// Trang quản trị: Danh sách câu hỏi
app.get('/admin', async (req, res) => {
  const tab = req.query.tab || 'qna';
  
  // Initialize variables
  let questions = [];
  let pendingQuestions = [];
  let page = 1;
  let totalPages = 0;
  let pagePending = 1;
  let totalPagesPending = 0;
  let totalQuestions = 0;
  let totalPending = 0;
  
  // Get filter and search params
  const sourceFilter = req.query.source || 'all'; // all, admin, database, ai_generated, ai_improved, import
  const searchQuery = req.query.search || '';
  
  // Get layout from query or default to 'auto' (6 items) - define outside if block
  const layout = req.query.layout || 'auto';
  const pageSizeMap = {
    'auto': 6,
    '3': 9,
    '4': 16,
    '5': 25,
    '6': 36,
    'all': 1000 // Hiển thị tất cả (very large number)
  };
  const pageSize = pageSizeMap[layout] || 6;
  
  // Load data based on current tab
  if (tab === 'qna') {
    // Load questions for "Đã có trả lời" tab
    page = parseInt(req.query.page) > 0 ? parseInt(req.query.page) : 1;
    
    console.log(`🔍 QNA Tab Debug:`);
    console.log(`  - Page: ${page}`);
    console.log(`  - PageSize: ${pageSize}`);
    console.log(`  - Source Filter: ${sourceFilter}`);
    console.log(`  - Search Query: ${searchQuery}`);
    
    // Build query filter
    let queryFilter = {};
    if (sourceFilter !== 'all') {
      queryFilter.source = sourceFilter;
    }
    if (searchQuery) {
      const searchRegex = new RegExp(searchQuery, 'i');
      queryFilter.$or = [
        { question: searchRegex },
        { answers: searchRegex }
      ];
    }
    
    // Get all questions with filter
    const allQuestions = await Question.find(queryFilter).sort({ createdAt: -1 });
    console.log(`🔍 Total questions matching filter: ${allQuestions.length}`);
    
    // Remove duplicates based on question content (case-insensitive)
    const uniqueQuestions = [];
    const seenQuestions = new Set();
    
    allQuestions.forEach(q => {
      const normalizedQuestion = q.question.toLowerCase().trim();
      if (!seenQuestions.has(normalizedQuestion)) {
        seenQuestions.add(normalizedQuestion);
        uniqueQuestions.push(q);
      } else {
        console.log(`⚠️ Duplicate found: "${q.question.substring(0,50)}..." (ID: ${q._id.toString().substring(0,8)})`);
      }
    });
    
    console.log(`✅ Unique questions after deduplication: ${uniqueQuestions.length}`);
    
    // Update total counts based on unique questions
    totalQuestions = uniqueQuestions.length;
    totalPages = Math.ceil(totalQuestions / pageSize);
    
    console.log(`📊 After deduplication:`);
    console.log(`  - TotalQuestions: ${totalQuestions}`);
    console.log(`  - TotalPages: ${totalPages}`);
    
    // Apply pagination to unique questions
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    questions = uniqueQuestions.slice(startIndex, endIndex);
    
    console.log(`📄 Pagination:`);
    console.log(`  - StartIndex: ${startIndex}`);
    console.log(`  - EndIndex: ${endIndex}`);
    console.log(`  - Questions on page: ${questions.length}`);
      
    console.log(`📊 Admin page - Tab: ${tab}, Page: ${page}/${totalPages}, Questions: ${questions.length}`);
    console.log(`📋 Questions data:`, questions.map(q => ({
      id: q._id.toString().substring(0, 8),
      question: q.question.substring(0, 30) + '...',
      createdAt: q.createdAt,
      answers: q.answers.length
    })));
  } else if (tab === 'pending') {
    // Load pending questions for "Chờ trả lời" tab
    pagePending = parseInt(req.query.pagePending) > 0 ? parseInt(req.query.pagePending) : 1;
    const pageSizePending = 6;
    totalPending = await PendingQuestion.countDocuments();
    totalPagesPending = Math.ceil(totalPending / pageSizePending);
    
    pendingQuestions = await PendingQuestion
      .find()
      .sort({ createdAt: -1 })
      .skip((pagePending - 1) * pageSizePending)
      .limit(pageSizePending);
      
    console.log(`📊 Admin page - Tab: ${tab}, Page: ${pagePending}/${totalPagesPending}, Pending: ${pendingQuestions.length}`);
  } else {
    // For other tabs, still need total counts for display
    totalQuestions = await Question.countDocuments();
    totalPending = await PendingQuestion.countDocuments();
  }

  const settings = {
    apiKey: runtimeConfig?.genaiApiKey || process.env.GEMINI_API_KEY || '',
    pageAccessToken: runtimeConfig?.pageAccessToken || process.env.PAGE_ACCESS_TOKEN || '',
    verifyToken: runtimeConfig?.verifyToken || process.env.VERIFY_TOKEN || ''
  };
  
  // Count questions added today by AI (questions created today)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  
  const newQuestionsToday = await Question.countDocuments({
    createdAt: { $gte: todayStart, $lte: todayEnd }
  });
  
  // Get question counts by source
  const sourceStats = {
    admin: await Question.countDocuments({ source: 'admin' }),
    ai_generated: await Question.countDocuments({ source: 'ai_generated' }),
    ai_improved: await Question.countDocuments({ source: 'ai_improved' }),
    import: await Question.countDocuments({ source: 'import' }),
    database: await Question.countDocuments({ source: 'database' })
  };
  
  console.log('📊 Source Statistics:', sourceStats);

  res.render('admin', {
    questions,
    pendingQuestions,
    page,
    totalPages,
    tab,
    pagePending,
    totalPagesPending,
    totalPending,
    totalQuestions,
    newQuestionsToday,
    sourceStats,
    settings,
    pageSize: pageSize,
    ngrokUrl
  });
});

// Admin: xem model generative đang dùng
app.get('/admin/genai-model', (req, res) => {
  const model = getCachedModelName();
  res.send({ model: model || null });
});

// Admin: đặt override model (tạm thời)
app.post('/admin/genai-model', express.urlencoded({ extended: true }), (req, res) => {
  const { model } = req.body;
  if (model) {
    setCachedModelName(model);
    return res.json({ success: true, model });
  }
  res.json({ success: false, error: 'missing_model' });
});

// Admin: probe candidate models
app.get('/admin/probe-models', async (req, res) => {
  try {
    const results = await probeCandidateModels();
    res.json({ success: true, results });
  } catch (e) {
    res.json({ success: false, error: e?.message || String(e) });
  }
});

// Admin: list all available models via REST API (requires GEMINI_API_KEY)
app.get('/admin/list-models', async (req, res) => {
  try {
    const models = await listAvailableModels();
    res.json({ success: true, models });
  } catch (e) {
    res.json({ success: false, error: e?.message || String(e) });
  }
});

// Admin: auto-select preferred model from REST list and save to DB
app.post('/admin/auto-select-model', async (req, res) => {
  try {
    const models = await listAvailableModels();
    const preferredOrder = ['models/gemini-2.0-flash', 'models/gemini-2.5-flash', 'models/gemini-2.0-flash-001', 'models/gemini-2.5-pro'];
    let pick = null;
    for (const p of preferredOrder) {
      if (models.includes(p)) { pick = p; break; }
    }
    // fallback to first model in list
    if (!pick && models.length > 0) pick = models[0];
    if (!pick) return res.json({ success: false, error: 'no_models_found' });
    setCachedModelName(pick);
    // persist
    try {
      await saveRuntimeConfig({ genaiModel: pick, lastAutoModel: pick, lastAutoAt: new Date() });
    } catch (e) {
      console.error('Failed to persist selected model:', e);
    }
    res.json({ success: true, model: pick });
  } catch (e) {
    res.json({ success: false, error: e?.message || String(e) });
  }
});

// Admin: set API key (form-url-encoded) - will re-init client in memory
app.post('/admin/api-key', express.urlencoded({ extended: true }), (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey) return res.json({ success: false, error: 'missing_key' });
  try {
    setApiKey(apiKey);
    return res.json({ success: true, masked: getApiKeyMasked() });
  } catch (e) {
    return res.json({ success: false, error: e?.message || String(e) });
  }
});

// Persist API key and model into DB
app.post('/admin/save-config', express.json(), async (req, res) => {
  const { apiKey, model, pageAccessToken, verifyToken } = req.body;
  try {
    if (apiKey) {
      setApiKey(apiKey);
    }
    if (model) setCachedModelName(model);
    
    const saved = await saveRuntimeConfig({ 
      genaiApiKey: apiKey || runtimeConfig.genaiApiKey, 
      genaiModel: model || runtimeConfig.genaiModel, 
      pageAccessToken: pageAccessToken || runtimeConfig.pageAccessToken, 
      verifyToken: verifyToken || runtimeConfig.verifyToken 
    });
    res.json({ success: true, saved });
  } catch (e) {
    res.json({ success: false, error: e?.message || String(e) });
  }
});

// Admin: get masked tokens
app.get('/admin/tokens', (req, res) => {
  const maskedGenai = runtimeConfig && runtimeConfig.genaiApiKey ? (runtimeConfig.genaiApiKey.slice(0,4) + '...' + runtimeConfig.genaiApiKey.slice(-4)) : (process.env.GEMINI_API_KEY ? (process.env.GEMINI_API_KEY.slice(0,4) + '...' + process.env.GEMINI_API_KEY.slice(-4)) : null);
  const maskedPage = runtimeConfig && runtimeConfig.pageAccessToken ? (runtimeConfig.pageAccessToken.slice(0,4) + '...' + runtimeConfig.pageAccessToken.slice(-4)) : (process.env.PAGE_ACCESS_TOKEN ? (process.env.PAGE_ACCESS_TOKEN.slice(0,4) + '...' + process.env.PAGE_ACCESS_TOKEN.slice(-4)) : null);
  const maskedVerify = runtimeConfig && runtimeConfig.verifyToken ? (runtimeConfig.verifyToken.slice(0,4) + '...' + runtimeConfig.verifyToken.slice(-4)) : (process.env.VERIFY_TOKEN ? (process.env.VERIFY_TOKEN.slice(0,4) + '...' + process.env.VERIFY_TOKEN.slice(-4)) : null);
  res.json({ genaiApiKey: maskedGenai, pageAccessToken: maskedPage, verifyToken: maskedVerify });
});

// Test API key connectivity by probing candidate models and attempting a tiny generation
app.get('/admin/test-api-key', async (req, res) => {
  try {
    const probe = await probeCandidateModels();
    // Try a small generate on cached model if exists
    const model = getCachedModelName();
    let testGen = null;
    if (model) {
      try {
        // use normalizeTextGemini as a quick proxy
        testGen = await normalizeTextGemini('test connectivity');
      } catch (e) {
        testGen = null;
      }
    }
    res.json({ success: true, probe, testGen });
  } catch (e) {
    res.json({ success: false, error: e?.message || String(e) });
  }
});

// Admin: send a test message to the bot logic and get reply (does not use Facebook)
app.post('/admin/test-message', express.json(), async (req, res) => {
  const { text, message, history } = req.body;
  const inputText = text || message; // Support both 'text' and 'message' fields
  if (!inputText) return res.json({ success: false, error: 'missing_text' });
  
  // Parse conversation history (last 10 messages max)
  let conversationHistory = [];
  if (Array.isArray(history)) {
    conversationHistory = history.slice(-10).filter(m => m && m.role && m.text);
  }
  
  // Load config settings
  let scoreThresholdHigh = 0.4;
  let scoreThresholdLow = 0.3;
  let useAI = true;
  
  try {
    const config = await Config.findOne();
    if (config) {
      scoreThresholdHigh = config.scoreThresholdHigh || 0.4;
      scoreThresholdLow = config.scoreThresholdLow || 0.3;
      useAI = config.useAI !== false;
    }
  } catch (e) {
    console.error('Lỗi khi tải config settings:', e);
  }
  
  try {
    // emulate handleMessage but return the reply rather than sending via Facebook
    const hasAI = isGeminiInitialized() && useAI;
    
    // Phân loại câu hỏi - nếu là chào hỏi/xã giao thì bỏ qua DB search, đưa thẳng cho AI
    const classification = classifyQuestion(inputText);
    if (!classification.shouldSave && hasAI) {
      console.log(`💬 Câu "${inputText}" là ${classification.category} - Bỏ qua DB, dùng AI trả lời trực tiếp`);
      try {
        const aiReply = await getFinalAIResponse(inputText, [], conversationHistory);
        if (aiReply) {
          return res.json({ success: true, reply: aiReply });
        }
      } catch (e) {
        console.error('Lỗi AI cho câu xã giao:', e);
      }
    }
    
    const normalized = hasAI ? await normalizeTextGemini(inputText) : inputText;
    // Normalize text for search (remove diacritics)
    const searchText = removeVietnameseDiacritics(normalized);
    // Use optimized search function
    let relevantQuestions = await searchQuestionsOptimized(searchText);
    if (relevantQuestions && relevantQuestions.length > 0) {
      // Smart AI logic based on score
      if (hasAI) {
        const allScores = relevantQuestions.map(q => q.score || 0);
        const topScore = Math.max(...allScores);
        
        console.log(`\n🎯 Test - Điểm: ${topScore.toFixed(2)} | Ngưỡng: ${scoreThresholdLow.toFixed(2)}-${scoreThresholdHigh.toFixed(2)}`);
        
        if (topScore >= scoreThresholdHigh) {
          // Score ≥ ngưỡng cao: Sử dụng trực tiếp không cần AI
          console.log(`✅ Dùng trực tiếp database (điểm ≥ ${scoreThresholdHigh.toFixed(2)})`);
        } else if (topScore >= scoreThresholdLow) {
          // Score giữa ngưỡng: Dùng AI để cải thiện
          console.log(`🔄 Dùng AI cải thiện (điểm ${scoreThresholdLow.toFixed(2)}-${scoreThresholdHigh.toFixed(2)})`);
          try {
            const aiReply = await getFinalAIResponse(inputText, relevantQuestions.map(q => ({ 
              question: q.question, 
              answer: q.answers && Array.isArray(q.answers) ? q.answers.join(' | ') : q.answer 
            })), conversationHistory);
            if (aiReply) {
              // Lưu câu hỏi và câu trả lời AI vào database (cải thiện)
              await saveQuestionToDatabase(inputText, aiReply, 'ai_improved');
              return res.json({ success: true, reply: aiReply });
            }
          } catch (e) {
            console.error('Lỗi AI trong test message:', e);
          }
        } else {
          // Score < ngưỡng thấp: Dùng AI cho câu trả lời chung
          console.log(`🤖 Dùng AI tạo câu trả lời (điểm < ${scoreThresholdLow.toFixed(2)})`);
          try {
            const aiReply = await getFinalAIResponse(inputText, relevantQuestions.map(q => ({ 
              question: q.question, 
              answer: q.answers && Array.isArray(q.answers) ? q.answers.join(' | ') : q.answer 
            })), conversationHistory);
            if (aiReply) {
              // Lưu câu hỏi và câu trả lời AI vào database (tạo mới)
              await saveQuestionToDatabase(inputText, aiReply, 'ai_generated');
              return res.json({ success: true, reply: aiReply });
            }
          } catch (e) {
            console.error('Lỗi AI trong test message:', e);
          }
        }
      } else {
        // Không dùng AI: Chỉ dùng điểm ≥ ngưỡng thấp
        const allScores = relevantQuestions.map(q => q.score || 0);
        const topScore = Math.max(...allScores);
        
        console.log(`\n🎯 Test không AI - Điểm: ${topScore.toFixed(2)} | Ngưỡng: ${scoreThresholdLow.toFixed(2)}`);
        
        if (topScore < scoreThresholdLow) {
          console.log(`❌ Điểm < ${scoreThresholdLow.toFixed(2)} → Không có kết quả phù hợp`);
          // Không có kết quả phù hợp, thêm vào hàng chờ (chỉ câu hỏi IT)
          const classResult1 = classifyQuestion(inputText);
          if (classResult1.shouldSave) {
          try {
            const result = await PendingQuestion.findOneAndUpdate(
              { question: inputText },
              { question: inputText },
              { upsert: true, new: true, setDefaultsOnInsert: true }
            );
            if (result) {
              console.log(`📝 ⚠️ Đã thêm vào HÀNG CHỜ TRẢ LỜI: "${inputText.substring(0, 60)}${inputText.length > 60 ? '...' : ''}"}`);
            }
          } catch (e) {
            console.error('❌ Lỗi khi thêm vào hàng chờ:', e);
          }
          } else {
            console.log(`💬 Bỏ qua hàng chờ - Câu "${inputText.substring(0, 50)}" thuộc loại: ${classResult1.category}`);
          }
          relevantQuestions = [];
        } else {
          console.log(`✅ Dùng database (điểm ≥ ${scoreThresholdLow.toFixed(2)})`);
        }
      }
      
      // Fallback to database - select from TOP 1 highest score question
      let selectedAnswer;
      if (relevantQuestions.length > 0) {
        // Always select from the question with the highest score (top 1)
        const topQuestion = relevantQuestions[0]; // Already sorted by score (highest first)
        
        console.log(`🏆 Selected TOP 1 question with score: ${(topQuestion.score || 0).toFixed(2)}`);
        console.log(`📝 Question: "${topQuestion.question}"`);
        
        if (topQuestion.answers && Array.isArray(topQuestion.answers) && topQuestion.answers.length > 0) {
          // If multiple answers, random select from all answers of the top question
          const randomAnswerIndex = Math.floor(Math.random() * topQuestion.answers.length);
          selectedAnswer = topQuestion.answers[randomAnswerIndex];
          console.log(`✅ Random selected answer ${randomAnswerIndex + 1}/${topQuestion.answers.length} from TOP 1 question`);
        } else if (topQuestion.answer) {
          selectedAnswer = topQuestion.answer;
          console.log(`✅ Selected single answer`);
        } else {
          selectedAnswer = await getRandomDefaultResponse();
          console.log(`❌ No answer found in top question, using default response`);
        }
      } else {
        selectedAnswer = await getRandomDefaultResponse();
        console.log(`❌ No relevant questions found, using default response`);
      }
      
      // Ensure we have a valid answer before returning
      if (!selectedAnswer || selectedAnswer.trim() === '') {
        selectedAnswer = await getRandomDefaultResponse();
      }
      
      return res.json({ success: true, reply: selectedAnswer });
    }
    // no db match - try AI for general response
    if (isGeminiInitialized()) {
      try {
        const aiReply = await getFinalAIResponse(inputText, [], conversationHistory);
        if (aiReply) {
          // Lưu câu hỏi mới và câu trả lời AI vào database
          await saveQuestionToDatabase(inputText, aiReply);
          return res.json({ success: true, reply: aiReply });
        }
      } catch (e) {
        console.error('Lỗi AI trong test message (no db match):', e);
      }
    }
    
    // Add to pending questions when no match found (chỉ câu hỏi IT)
    const classResult2 = classifyQuestion(inputText);
    if (classResult2.shouldSave) {
    console.log('📝 No database match found, adding to pending questions...');
    try {
      await PendingQuestion.findOneAndUpdate(
        { question: inputText },
        { question: inputText },
        { upsert: true }
      );
      console.log(`✅ Added to pending questions: "${inputText}"`);
    } catch (e) {
      console.error('❌ Error adding to pending questions:', e);
    }
    } else {
      console.log(`💬 Bỏ qua hàng chờ - Câu "${inputText.substring(0, 50)}" thuộc loại: ${classResult2.category}`);
    }
    
    // default response
    const defaultResponse = await getRandomDefaultResponse();
    return res.json({ success: true, reply: defaultResponse });
  } catch (e) {
    console.error('Error in test-message:', e);
    res.json({ success: false, error: e?.message || String(e) });
  }
});

// Trang thêm câu hỏi
app.get('/admin/add', (req, res) => {
  res.render('add');
});

// Xử lý thêm câu hỏi
app.post('/admin/add', async (req, res) => {
  let { question, answers } = req.body; // Expecting 'answers' to be an array
  
  // Sanitize question
  question = sanitizeInput(question);
  
  // Handle answers array - ensure it's properly formatted and sanitized
  let formattedAnswers = [];
  if (Array.isArray(answers)) {
    formattedAnswers = answers
      .map(answer => sanitizeInput(answer))
      .filter(answer => {
        if (!answer) return false;
        const trimmed = answer.trim();
        return trimmed !== '';
      });
  } else if (answers && typeof answers === 'string') {
    // If answers is a single string, convert to array
    const sanitized = sanitizeInput(answers);
    const trimmed = sanitized.trim();
    if (trimmed !== '') {
      formattedAnswers = [trimmed];
    }
  }
  
  console.log('Add question - Received data:', { question, answers });
  console.log('Add question - Formatted answers:', formattedAnswers);
  
  if (!question || formattedAnswers.length === 0) {
    return res.redirect('/admin?tab=pending&error=missing');
  }
  
  // Add normalized fields
  const questionNormalized = removeVietnameseDiacritics(question);
  const answersNormalized = formattedAnswers.map(a => removeVietnameseDiacritics(a));
  
  await Question.create({ 
    question, 
    answers: formattedAnswers,
    question_normalized: questionNormalized,
    answers_normalized: answersNormalized,
    source: 'admin' // Admin thêm thủ công
  });
  
  console.log(`✅ Admin đã thêm câu hỏi mới: "${question.substring(0, 50)}..."`);
  
  // Clear cache when adding new question
  cache.clear();
  
  // Nếu có trong hàng chờ thì xóa khỏi hàng chờ
  try {
  await PendingQuestion.findOneAndDelete({ question });
  } catch (e) {}
  res.redirect('/admin');
});

// Trang sửa câu hỏi
app.get('/admin/edit/:id', async (req, res) => {
  const q = await Question.findById(req.params.id);
  res.render('edit', { q });
});

// Xử lý sửa câu hỏi
app.post('/admin/edit/:id', async (req, res) => {
  try {
    let { question, answers } = req.body; // Expecting 'answers' to be an array

    // Ensure question is a string, sanitize it
    let formattedQuestion = Array.isArray(question) ? question.join(' ') : question;
    formattedQuestion = sanitizeInput(formattedQuestion);
    
    // Handle answers array - ensure it's properly formatted and sanitized
    let formattedAnswers = [];
    if (Array.isArray(answers)) {
      formattedAnswers = answers
        .map(answer => sanitizeInput(answer))
        .filter(answer => {
          if (!answer) return false;
          const trimmed = answer.trim();
          return trimmed !== '';
        });
    } else if (answers && typeof answers === 'string') {
      // If answers is a single string, sanitize and convert to array
      const sanitized = sanitizeInput(answers);
      const trimmed = sanitized.trim();
      if (trimmed !== '') {
        formattedAnswers = [trimmed];
      }
    }

    console.log('Received data:', { question, answers });
    console.log('Answers array length:', answers ? answers.length : 'undefined');
    console.log('Formatted data:', { formattedQuestion, formattedAnswers });

    if (!formattedQuestion || formattedAnswers.length === 0) {
      console.error('Validation failed:', { formattedQuestion, formattedAnswers });
      return res.redirect(`/admin/edit/${req.params.id}?error=missing`);
    }

    // Add normalized fields
    const questionNormalized = removeVietnameseDiacritics(formattedQuestion);
    const answersNormalized = formattedAnswers.map(a => removeVietnameseDiacritics(a));

    await Question.findByIdAndUpdate(req.params.id, { 
      question: formattedQuestion, 
      answers: formattedAnswers,
      question_normalized: questionNormalized,
      answers_normalized: answersNormalized
    });
    
    // Clear cache when updating question
    cache.clear();

    // Giữ lại tab và trang hiện tại
    let page = req.query.page || 1;
    let tab = req.query.tab || 'qna';
    res.redirect(`/admin?page=${page}&tab=${tab}`);
  } catch (error) {
    console.error('Error while updating question:', error);
    res.redirect(`/admin/edit/${req.params.id}?error=server`);
  }
});

// Xử lý xóa câu hỏi
app.post('/admin/delete/:id', async (req, res) => {
  await Question.findByIdAndDelete(req.params.id);
  
  // Clear cache when deleting question
  cache.clear();
  
  // Giữ lại tab và trang hiện tại
  let page = req.query.page || 1;
  let tab = req.query.tab || 'qna';
  res.redirect(`/admin?page=${page}&tab=${tab}`);
});

// Xóa tất cả câu hỏi
app.post('/admin/delete-all', async (req, res) => {
  try {
    const deleteResult = await Question.deleteMany({});
    const count = deleteResult.deletedCount;
    console.log(`✅ Đã xóa ${count} câu hỏi`);
    res.redirect('/admin?tab=qna&deleted=' + count);
  } catch (error) {
    console.error('❌ Lỗi khi xóa tất cả:', error);
    res.redirect('/admin?tab=qna&error=delete_failed');
  }
});

// Trang upload file Excel
app.get('/admin/import', (req, res) => {
  res.redirect('/admin?tab=import');
});

// Xử lý upload và import file Excel
app.post('/admin/import', upload.single('excelFile'), async (req, res) => {
  try {
    const filePath = req.file.path;
    const workbook = xlsx.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    
    // Lọc bỏ dòng header và dòng trống
    const rows = data.filter(row => row && row[0] && row[0].toString().trim());
    
    let successCount = 0;
    let duplicateCount = 0;
    let errorCount = 0;
    const errors = [];
    
    console.log(`📊 Processing ${rows.length} rows from Excel file...`);
    
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = i + 1;
      
      try {
        // Cột đầu tiên là câu hỏi
        const question = row[0].toString().trim();
        
        // Các cột còn lại là câu trả lời
        const answers = row.slice(1)
          .map(cell => cell && cell.toString().trim())
          .filter(cell => cell && cell.length > 0);
        
        // Kiểm tra dữ liệu hợp lệ
        if (!question || question.length < 2) {
          errors.push(`Dòng ${rowNumber}: Câu hỏi quá ngắn hoặc trống`);
          errorCount++;
          continue;
        }
        
        if (answers.length === 0) {
          errors.push(`Dòng ${rowNumber}: Không có câu trả lời nào`);
          errorCount++;
          continue;
        }
        
        // Kiểm tra trùng lặp câu hỏi
        const existingQuestion = await Question.findOne({ 
          question: { $regex: new RegExp(`^${question.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
        });
        
        if (existingQuestion) {
          console.log(`⚠️ Duplicate question found: "${question}"`);
          duplicateCount++;
          continue;
        }
        
        // Tạo câu hỏi mới với normalized fields
        const newQuestion = new Question({
          question: question,
          answers: answers,
          question_normalized: removeVietnameseDiacritics(question),
          answers_normalized: answers.map(a => removeVietnameseDiacritics(a)),
          source: 'import', // Import từ Excel
          createdAt: new Date() // Đảm bảo có createdAt
        });
        
        await newQuestion.save();
        successCount++;
        console.log(`✅ Added question: "${question}" with ${answers.length} answers`);
        
      } catch (error) {
        console.error(`❌ Error processing row ${rowNumber}:`, error);
        errors.push(`Dòng ${rowNumber}: ${error.message}`);
        errorCount++;
      }
    }
    
    // Tạo thông báo kết quả chi tiết
    let message = '';
    if (successCount > 0) {
      message += `✅ <strong>Thêm thành công ${successCount} câu hỏi</strong> vào database "Đã có trả lời". `;
    }
    if (duplicateCount > 0) {
      message += `⚠️ <strong>Bỏ qua ${duplicateCount} câu hỏi trùng lặp</strong> (đã tồn tại trong database). `;
    }
    if (errorCount > 0) {
      message += `❌ <strong>${errorCount} dòng bị lỗi</strong> (dữ liệu không hợp lệ). `;
    }
    
    if (successCount === 0 && duplicateCount === 0 && errorCount === 0) {
      message = '⚠️ Không có dữ liệu hợp lệ nào được tìm thấy trong file Excel.';
    }
    
    console.log(`📈 Import Summary:`);
    console.log(`   ✅ Thêm thành công: ${successCount} câu hỏi vào database "Đã có trả lời"`);
    console.log(`   ⚠️ Bỏ qua trùng lặp: ${duplicateCount} câu hỏi`);
    console.log(`   ❌ Lỗi dữ liệu: ${errorCount} dòng`);
    
    // Xóa file tạm
    fs.unlinkSync(filePath);
    
    // Redirect với thông báo
    const redirectUrl = `/admin?tab=qna&import=success&success=${successCount}&duplicate=${duplicateCount}&error=${errorCount}`;
    res.redirect(redirectUrl);
    
  } catch (error) {
    console.error('❌ Import error:', error);
    
    // Xóa file tạm nếu có
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error('Error deleting temp file:', unlinkError);
      }
    }
    
    res.redirect('/admin?tab=import&import=error&message=' + encodeURIComponent(error.message));
  }
});

// Debug API - Get all questions
app.get('/api/debug/questions', async (req, res) => {
  try {
    const questions = await Question.find().sort({ createdAt: -1 });
    const total = await Question.countDocuments();
    
    console.log(`🔍 Debug API - Total questions: ${total}`);
    console.log(`🔍 Debug API - Questions found: ${questions.length}`);
    
    res.json({
      total,
      questions: questions.map(q => ({
        _id: q._id,
        question: q.question,
        answers: q.answers,
        createdAt: q.createdAt,
        updatedAt: q.updatedAt
      }))
    });
  } catch (error) {
    console.error('Debug questions error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Debug API - Get database stats
app.get('/api/debug/stats', async (req, res) => {
  try {
    const totalQuestions = await Question.countDocuments();
    const totalPending = await PendingQuestion.countDocuments();
    const latestQuestion = await Question.findOne().sort({ createdAt: -1 });
    
    console.log(`📊 Database Stats - Questions: ${totalQuestions}, Pending: ${totalPending}`);
    
    res.json({
      totalQuestions,
      totalPending,
      latestQuestion: latestQuestion ? {
        id: latestQuestion._id.toString().substring(0, 8),
        question: latestQuestion.question.substring(0, 50) + '...',
        createdAt: latestQuestion.createdAt
      } : null
    });
  } catch (error) {
    console.error('Debug stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Debug API - Remove duplicates
app.post('/api/debug/remove-duplicates', async (req, res) => {
  try {
    const allQuestions = await Question.find().sort({ createdAt: -1 });
    const uniqueQuestions = [];
    const seenQuestions = new Set();
    const duplicatesToDelete = [];
    
    allQuestions.forEach(q => {
      const normalizedQuestion = q.question.toLowerCase().trim();
      if (!seenQuestions.has(normalizedQuestion)) {
        seenQuestions.add(normalizedQuestion);
        uniqueQuestions.push(q);
      } else {
        duplicatesToDelete.push(q._id);
      }
    });
    
    console.log(`🔍 Found ${duplicatesToDelete.length} duplicate questions to delete`);
    
    if (duplicatesToDelete.length > 0) {
      const result = await Question.deleteMany({ _id: { $in: duplicatesToDelete } });
      console.log(`✅ Deleted ${result.deletedCount} duplicate questions`);
    }
    
    res.json({
      success: true,
      totalQuestions: allQuestions.length,
      uniqueQuestions: uniqueQuestions.length,
      duplicatesRemoved: duplicatesToDelete.length,
      message: `Removed ${duplicatesToDelete.length} duplicate questions`
    });
  } catch (error) {
    console.error('Remove duplicates error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Download Excel template
app.get('/api/download/excel-template', (req, res) => {
  try {
    const XLSX = require('xlsx');
    
    // Create sample data (first column is question, rest are answers)
    // Note: No header row because the import process will import all rows
    const sampleData = [
      ['Xin chào', 'Chào bạn! Tôi có thể giúp gì cho bạn?', 'Xin chào! Rất vui được gặp bạn.', 'Chào mừng bạn đến với dịch vụ của chúng tôi!'],
      ['Bạn là ai?', 'Tôi là chatbot AI được thiết kế để hỗ trợ bạn', 'Tôi là trợ lý ảo thông minh', ''],
      ['Hàm SUM trong Excel', 'Hàm SUM dùng để tính tổng', 'Cú pháp: =SUM(A1:A10)', 'Có thể tính tổng nhiều ô liên tiếp'],
      ['Mở Excel', 'Double-click vào file Excel', 'Hoặc click File > Open', 'File > Open > chọn file'],
      ['Tiết kiệm file', 'Nhấn Ctrl + S', 'File > Save', 'Hoặc Save As để lưu với tên khác']
    ];
    
    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(sampleData);
    
    // Set column widths
    ws['!cols'] = [
      { wch: 30 }, // Câu hỏi
      { wch: 50 }, // Trả lời 1
      { wch: 50 }, // Trả lời 2
      { wch: 50 }  // Trả lời 3
    ];
    
    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Mẫu Câu Hỏi');
    
    // Generate Excel buffer
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
    
    // Set headers for download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="mau_cau_hoi_tra_loi.xlsx"');
    res.setHeader('Content-Length', excelBuffer.length);
    
    // Send Excel file
    res.send(excelBuffer);
    
    console.log('✅ Excel template downloaded successfully');
  } catch (error) {
    console.error('❌ Error generating Excel template:', error);
    res.status(500).json({ error: 'Lỗi khi tạo file Excel template' });
  }
});

// Xử lý webhook verification
app.get('/webhook', (req, res) => {
  const VERIFY_TOKEN = runtimeConfig && runtimeConfig.verifyToken ? runtimeConfig.verifyToken : process.env.VERIFY_TOKEN;
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('WEBHOOK_VERIFIED');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
});

// Xử lý tin nhắn đến
app.post('/webhook', (req, res) => {
  console.log('Webhook POST received:', JSON.stringify(req.body));
  if (req.body.object === 'page') {
    req.body.entry.forEach(entry => {
      entry.messaging.forEach(webhookEvent => {
        const senderPsid = webhookEvent.sender.id;
        // Chỉ xử lý khi là tin nhắn mới (có message.text hoặc message.attachments)
        if (
          webhookEvent.message &&
          (webhookEvent.message.text || webhookEvent.message.attachments)
        ) {
          console.log('Nhận tin nhắn từ:', senderPsid, webhookEvent.message);
          handleMessage(senderPsid, webhookEvent.message);
        }
      });
    });
    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});

// Enhanced cache with TTL
let cache = new Map(); // Bộ nhớ đệm đơn giản
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Cache entry with timestamp
class CacheEntry {
  constructor(data) {
    this.data = data;
    this.timestamp = Date.now();
  }
  
  isExpired() {
    return Date.now() - this.timestamp > CACHE_TTL;
  }
}

// LRU Cache implementation with size limit
class LRUCache {
  constructor(maxSize = 100) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }
  
  get(key) {
    if (!this.cache.has(key)) return null;
    const entry = this.cache.get(key);
    if (entry.isExpired()) {
      this.cache.delete(key);
      return null;
    }
    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.data;
  }
  
  set(key, data) {
    // Remove if already exists
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    // Remove oldest if at max size
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
    this.cache.set(key, new CacheEntry(data));
  }
  
  clear() {
    this.cache.clear();
  }
}

// Replace old cache with LRU cache
cache = new LRUCache(100);

// Fuse.js search function - Simple, fast, and effective
async function searchQuestionsOptimized(searchText) {
  const cleanedSearchText = searchText.trim().replace(/[.,!?;:]/g, '').replace(/\s+/g, ' ');
  
  console.log(`🔍 === FUSE.JS SEARCH FOR: "${searchText}" ===`);
  console.log(`🧹 Cleaned: "${cleanedSearchText}"`);
  
  try {
    // Get all questions from database
    const allQuestions = await Question.find().lean();
    
    if (allQuestions.length === 0) {
      console.log('❌ No questions in database');
      return [];
    }
    
    // Prepare data for Fuse.js with both original and normalized text
    const searchableData = allQuestions.map(q => ({
      ...q,
      question_search: q.question + ' ' + removeVietnameseDiacritics(q.question),
      answers_search: (q.answers && Array.isArray(q.answers) ? q.answers.join(' ') : q.answer || '') +
                      ' ' +
                      (q.answers_normalized && Array.isArray(q.answers_normalized) ? q.answers_normalized.join(' ') : removeVietnameseDiacritics(q.answer || ''))
    }));
    
    // Configure Fuse.js for optimal Vietnamese search
    const fuseOptions = {
      keys: [
        { name: 'question', weight: 0.5 },
        { name: 'question_search', weight: 0.3 },
        { name: 'answers_search', weight: 0.2 }
      ],
      threshold: 0.4, // Lower = more strict (0.0 = perfect match, 1.0 = match anything)
      distance: 100,
      minMatchCharLength: 2,
      includeScore: true,
      useExtendedSearch: true,
      ignoreLocation: true
    };
    
    const fuse = new Fuse(searchableData, fuseOptions);
    
    // Search with both original and normalized text
    const searchQuery = cleanedSearchText + ' | ' + removeVietnameseDiacritics(cleanedSearchText);
    const fuseResults = fuse.search(searchQuery);
    
    // Convert Fuse.js scores (lower is better, 0.0-1.0) to our score (higher is better, 0.0-1.0)
    const results = fuseResults.map(result => ({
      ...result.item,
      score: 1 - result.score, // Invert: 0.0 becomes 1.0, 1.0 becomes 0.0
      fuseScore: result.score,
      _id: result.item._id
    }));
    
    console.log(`🔍 Tìm thấy ${results.length} kết quả`);
    
    if (results.length > 0) {
      const maxScore = Math.max(...results.map(r => r.score));
      console.log(`🏆 Điểm cao nhất: ${maxScore.toFixed(2)}`);
    }
    
    return results.slice(0, 30);
    
  } catch (error) {
    console.error('❌ Fuse.js search error:', error);
    return [];
  }
}

// Function to get random default response
async function getRandomDefaultResponse() {
  try {
    console.log('🔍 Getting random default response...');
    const responses = await DefaultResponse.find({ isActive: true }).sort({ priority: 1 });
    console.log(`📊 Found ${responses.length} active default responses`);
    
    if (responses.length === 0) {
      console.log('❌ No active default responses found');
      return "Xin lỗi, tôi chưa có thông tin cho câu hỏi này. Câu hỏi của bạn đã được ghi nhận để admin bổ sung trả lời sau!";
    }
    
    // Get responses with highest priority
    const highestPriority = responses[0].priority;
    const topPriorityResponses = responses.filter(r => r.priority === highestPriority);
    console.log(`🎯 Using priority ${highestPriority}, found ${topPriorityResponses.length} responses`);
    
    // Random select from top priority responses
    const randomResponse = topPriorityResponses[Math.floor(Math.random() * topPriorityResponses.length)];
    console.log(`✅ Selected response: "${randomResponse.name}"`);
    
    // Add note about pending question
    const baseMessage = randomResponse.message;
    const finalMessage = baseMessage + "\n\n💡 Câu hỏi của bạn đã được ghi nhận để admin bổ sung trả lời sau!";
    console.log(`📝 Final message length: ${finalMessage.length} characters`);
    return finalMessage;
  } catch (error) {
    console.error('❌ Error getting random default response:', error);
    return "Xin lỗi, tôi chưa có thông tin cho câu hỏi này. Câu hỏi của bạn đã được ghi nhận để admin bổ sung trả lời sau!";
  }
}

// Function to save AI-generated Q&A to database
// Function to save AI-generated Q&A to database
async function saveQuestionToDatabase(question, aiAnswer, sourceType = 'ai_generated') {
  try {
    // Check if AI Training is enabled
    const config = await Config.findOne();
    const useAITrain = config?.useAITrain !== false;
    
    if (!useAITrain) {
      console.log(`🚫 AI Training đã TẮT - Không lưu câu hỏi vào database`);
      return;
    }
    
    // Phân loại câu hỏi - không lưu câu xã giao/chào hỏi
    const classification = classifyQuestion(question);
    if (!classification.shouldSave) {
      console.log(`💬 Bỏ qua lưu CSDL - Câu "${question.substring(0, 50)}" thuộc loại: ${classification.category}`);
      return;
    }
    
    console.log(`\n🤖 ===== AI THÊM CÂU HỎI MỚI =====`);
    console.log(`📝 Câu hỏi: "${question.substring(0, 100)}${question.length > 100 ? '...' : ''}"`);
    console.log(`💬 Câu trả lời: "${aiAnswer.substring(0, 100)}${aiAnswer.length > 100 ? '...' : ''}"`);
    console.log(`🏷️ Nguồn: ${sourceType}`);
    
    // Check if question already exists
    const existingQuestion = await Question.findOne({ question: question });
    
    if (existingQuestion) {
      // If exists, add AI answer to answers array if not already present
      if (existingQuestion.answers && Array.isArray(existingQuestion.answers)) {
        if (!existingQuestion.answers.includes(aiAnswer)) {
          existingQuestion.answers.push(aiAnswer);
          // Update normalized fields and source
          existingQuestion.answers_normalized = existingQuestion.answers.map(a => removeVietnameseDiacritics(a));
          existingQuestion.source = 'ai_improved'; // Mark as AI improved
          await existingQuestion.save();
          console.log(`✅ Đã thêm câu trả lời AI vào câu hỏi có sẵn → ai_improved (Tổng: ${existingQuestion.answers.length} câu trả lời)`);
        } else {
          console.log(`ℹ️ Câu trả lời AI đã tồn tại trong database`);
        }
      } else {
        // Convert single answer to array and add AI answer
        const answers = [existingQuestion.answer, aiAnswer];
        const answers_normalized = answers.map(a => removeVietnameseDiacritics(a));
        await Question.findByIdAndUpdate(existingQuestion._id, { 
          answers: answers,
          answers_normalized: answers_normalized,
          source: 'ai_improved'
        });
        console.log(`✅ Đã chuyển đổi và thêm câu trả lời AI → ai_improved (Tổng: 2 câu trả lời)`);
      }
    } else {
      // Create new question with AI answer
      await Question.create({ 
        question: question, 
        answers: [aiAnswer],
        question_normalized: removeVietnameseDiacritics(question),
        answers_normalized: [removeVietnameseDiacritics(aiAnswer)],
        source: sourceType // Use the provided source type (ai_generated or ai_improved)
      });
      console.log(`✅ Đã tạo câu hỏi MỚI với câu trả lời từ AI → ${sourceType}`);
    }
    console.log(`🤖 ===== KẾT THÚC LƯU DATABASE =====\n`);
  } catch (error) {
    console.error('❌ Lỗi khi lưu câu hỏi AI vào database:', error);
  }
}

async function handleMessage(senderPsid, receivedMessage) {
  try {
    if (receivedMessage.text) {
      const originalText = receivedMessage.text;
      
      // Load config settings
      let scoreThresholdHigh = 0.4;
      let scoreThresholdLow = 0.3;
      let useAI = true;
      let useAITrain = true;
      
      try {
        const config = await Config.findOne();
        if (config) {
          scoreThresholdHigh = config.scoreThresholdHigh || 0.4;
          scoreThresholdLow = config.scoreThresholdLow || 0.3;
          useAI = config.useAI !== false;
          useAITrain = config.useAITrain !== false;
        }
      } catch (e) {
        console.error('Lỗi khi tải config settings:', e);
      }
      
      // Check if AI is available AND enabled
      const hasAI = isGeminiInitialized() && useAI;

      // Phân loại câu hỏi - nếu là chào hỏi/xã giao thì bỏ qua DB search, đưa thẳng cho AI
      const classificationFB = classifyQuestion(originalText);
      if (!classificationFB.shouldSave && hasAI) {
        console.log(`💬 FB: Câu "${originalText}" là ${classificationFB.category} - Bỏ qua DB, dùng AI`);
        try {
          const aiReply = await getFinalAIResponse(originalText, []);
          if (aiReply && aiReply.length > 0) {
            await callSendAPI(senderPsid, { text: aiReply });
            return;
          }
        } catch (e) {
          console.error('Lỗi AI cho câu xã giao FB:', e);
        }
      }

      let normalizedText = originalText;
      if (hasAI) {
        try {
          normalizedText = await normalizeTextGemini(originalText);
        } catch (e) {
          console.error('Lỗi khi chuẩn hóa văn bản bằng Gemini:', e);
          normalizedText = originalText;
        }
      }
      
      // Normalize text for search (remove diacritics)
      const searchText = removeVietnameseDiacritics(normalizedText);

      let relevantQuestions = [];
      const cacheKey = searchText.toLowerCase().trim();
      
      // Check LRU cache
      const cachedResult = cache.get(cacheKey);
      if (cachedResult) {
        relevantQuestions = cachedResult;
        console.log('✅ Cache hit for:', cacheKey);
      }
      
      if (relevantQuestions.length === 0) {
        try {
          console.log('🔍 Searching database for:', cacheKey);
          const startTime = Date.now();
          
          // Optimized search with Fuse.js
          relevantQuestions = await searchQuestionsOptimized(searchText);
          
          const searchTime = Date.now() - startTime;
          console.log(`⚡ Search completed in ${searchTime}ms, found ${relevantQuestions.length} results`);
          
          // Cache the results with LRU eviction
          cache.set(cacheKey, relevantQuestions);
        } catch (e) {
          console.error('❌ Lỗi khi tìm kiếm:', e);
        }
      }

      console.log('📝 Original:', originalText);
      console.log('🤖 AI Normalized:', normalizedText);
      console.log('🔍 Search Text (no diacritics):', searchText);
      console.log('Kết quả tìm kiếm MongoDB:', relevantQuestions);

      if (relevantQuestions && relevantQuestions.length > 0) {
        const contextForAI = relevantQuestions.map(q => ({ 
          question: q.question, 
          answer: q.answers && Array.isArray(q.answers) ? q.answers.join(' | ') : q.answer 
        }));
        
        // Smart AI logic based on score
        if (hasAI) {
          // Tìm score cao nhất từ tất cả kết quả
          const allScores = relevantQuestions.map(q => q.score || 0);
          const topScore = Math.max(...allScores);
          
          console.log(`\n🎯 Điểm cao nhất: ${topScore.toFixed(2)} | Ngưỡng: ${scoreThresholdLow.toFixed(2)}-${scoreThresholdHigh.toFixed(2)}`);
          
          if (topScore >= scoreThresholdHigh) {
            // Score ≥ ngưỡng cao: Tin tưởng hoàn toàn - Sử dụng trực tiếp không cần AI
            console.log(`✅ Dùng trực tiếp database (điểm ≥ ${scoreThresholdHigh.toFixed(2)})`);
          } else if (topScore >= scoreThresholdLow) {
            // Score giữa ngưỡng: Dùng AI để cải thiện và lưu vào database
            console.log(`🔄 Dùng AI cải thiện (điểm ${scoreThresholdLow.toFixed(2)}-${scoreThresholdHigh.toFixed(2)})`);
            try {
              const aiReply = await getFinalAIResponse(originalText, contextForAI);
              if (aiReply && aiReply.length > 0) {
                // Lưu câu hỏi và câu trả lời AI vào database (cải thiện)
                await saveQuestionToDatabase(originalText, aiReply, 'ai_improved');
                await callSendAPI(senderPsid, { text: aiReply });
                return;
              }
            } catch (e) {
              console.error('Lỗi khi gọi Gemini để cải thiện:', e);
              console.log('Chuyển sang sử dụng câu trả lời từ database...');
            }
          } else {
            // Score < ngưỡng thấp: Dùng AI cho câu trả lời chung
            console.log(`🤖 Dùng AI tạo câu trả lời (điểm < ${scoreThresholdLow.toFixed(2)})`);
            try {
              const aiReply = await getFinalAIResponse(originalText, contextForAI);
              if (aiReply && aiReply.length > 0) {
                // Lưu câu hỏi và câu trả lời AI vào database (tạo mới)
                await saveQuestionToDatabase(originalText, aiReply, 'ai_generated');
                await callSendAPI(senderPsid, { text: aiReply });
                return;
              }
            } catch (e) {
              console.error('Lỗi khi gọi Gemini:', e);
              console.log('Chuyển sang sử dụng câu trả lời từ database...');
            }
          }
        } else {
          // Không dùng AI: Chỉ dùng điểm ≥ ngưỡng thấp
          const allScores = relevantQuestions.map(q => q.score || 0);
          const topScore = Math.max(...allScores);
          
          console.log(`\n🎯 Không có AI - Điểm: ${topScore.toFixed(2)} | Ngưỡng: ${scoreThresholdLow.toFixed(2)}`);
          
          if (topScore < scoreThresholdLow) {
            console.log(`❌ Điểm < ${scoreThresholdLow.toFixed(2)} → Không có kết quả phù hợp`);
            // Không có kết quả phù hợp, thêm vào hàng chờ và chuyển sang xử lý không có database match
            const classResultFB1 = classifyQuestion(originalText);
            if (classResultFB1.shouldSave) {
            try {
              const result = await PendingQuestion.findOneAndUpdate(
                { question: originalText },
                { question: originalText },
                { upsert: true, new: true, setDefaultsOnInsert: true }
              );
              if (result) {
                console.log(`📝 ⚠️ Đã thêm vào HÀNG CHỜ TRẢ LỜI: "${originalText.substring(0, 60)}${originalText.length > 60 ? '...' : ''}"}`);
              }
              console.log(`📝 Added to pending questions: "${originalText}"`);
            } catch (e) {
              console.error('Lỗi khi thêm vào hàng chờ:', e);
            }
            } else {
              console.log(`💬 Bỏ qua hàng chờ FB - Câu "${originalText.substring(0, 50)}" thuộc loại: ${classResultFB1.category}`);
            }
            relevantQuestions = [];
          } else {
            console.log(`✅ Decision: Score ${topScore.toFixed(2)} ≥ 0.45 → Sử dụng database`);
          }
        }
        
        // Fallback to database answers - select from TOP 1 highest score question
        let selectedAnswer;
        if (relevantQuestions.length > 0) {
          // Always select from the question with the highest score (top 1)
          const topQuestion = relevantQuestions[0]; // Already sorted by score (highest first)
          
          console.log(`🏆 Selected TOP 1 question with score: ${(topQuestion.score || 0).toFixed(2)}`);
          console.log(`📝 Question: "${topQuestion.question}"`);
          
          if (topQuestion.answers && Array.isArray(topQuestion.answers) && topQuestion.answers.length > 0) {
            // If multiple answers, random select from all answers of the top question
            const randomAnswerIndex = Math.floor(Math.random() * topQuestion.answers.length);
            selectedAnswer = topQuestion.answers[randomAnswerIndex];
            console.log(`✅ Random selected answer ${randomAnswerIndex + 1}/${topQuestion.answers.length} from TOP 1 question`);
          } else if (topQuestion.answer) {
            selectedAnswer = topQuestion.answer;
            console.log(`✅ Selected single answer`);
          } else {
            selectedAnswer = await getRandomDefaultResponse();
            console.log(`❌ No answer found in top question, using default response`);
          }
        } else {
          selectedAnswer = await getRandomDefaultResponse();
          console.log(`❌ No relevant questions found, using default response`);
        }
        
        // Ensure we have a valid answer before sending
        if (!selectedAnswer || selectedAnswer.trim() === '') {
          selectedAnswer = await getRandomDefaultResponse();
        }
        
        await callSendAPI(senderPsid, { text: selectedAnswer });
      } else {
        const classResultFB2 = classifyQuestion(originalText);
        if (classResultFB2.shouldSave) {
        try {
          await PendingQuestion.findOneAndUpdate(
            { question: originalText },
            { question: originalText },
            { upsert: true }
          );
        } catch (e) {
          console.error('Lỗi khi thêm vào hàng chờ:', e);
        }
        } else {
          console.log(`💬 Bỏ qua hàng chờ FB - Câu "${originalText.substring(0, 50)}" thuộc loại: ${classResultFB2.category}`);
        }

        // Try AI for general response if no database match
        if (useAI) {
          try {
            const aiReply = await getFinalAIResponse(originalText, []);
            if (aiReply && aiReply.length > 0) {
              // Lưu câu hỏi mới và câu trả lời AI vào database
              await saveQuestionToDatabase(originalText, aiReply);
              await callSendAPI(senderPsid, { text: aiReply });
              return;
            }
          } catch (e) {
            console.error('Lỗi khi gọi Gemini để trả lời khi không có dữ liệu:', e);
            console.log('AI không hoạt động, sử dụng câu trả lời mặc định...');
          }
        }

        // Add to pending questions when no match found (chỉ câu hỏi IT)
        if (classResultFB2.shouldSave) {
        console.log('📝 No database match found, adding to pending questions...');
        try {
          await PendingQuestion.findOneAndUpdate(
            { question: originalText },
            { question: originalText },
            { upsert: true }
          );
          console.log(`✅ Added to pending questions: "${originalText}"`);
        } catch (e) {
          console.error('❌ Error adding to pending questions:', e);
        }
        }

        // Default response when no AI and no database match
        const defaultResponse = await getRandomDefaultResponse();
        await callSendAPI(senderPsid, { text: defaultResponse });
      }
    } else if (receivedMessage.attachments) {
      await callSendAPI(senderPsid, { 
        text: "Xin lỗi, tôi chỉ hiểu được tin nhắn văn bản. Bạn có thể gõ lại câu hỏi không?" 
      });
    }
  } catch (error) {
    console.error('Lỗi khi xử lý tin nhắn:', error);
    await callSendAPI(senderPsid, { 
      text: "Xin lỗi, tôi đang gặp vấn đề kỹ thuật. Vui lòng thử lại sau." 
    });
  }
}

// Hàm gửi tin nhắn đến Facebook Messenger
async function callSendAPI(senderPsid, response) {
  const PAGE_ACCESS_TOKEN = runtimeConfig && runtimeConfig.pageAccessToken ? runtimeConfig.pageAccessToken : process.env.PAGE_ACCESS_TOKEN;
  
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/me/messages`,
      {
        recipient: { id: senderPsid },
        message: response
      },
      {
        params: { access_token: PAGE_ACCESS_TOKEN }
      }
    );
    console.log('Đã gửi phản hồi cho:', senderPsid, response);
  } catch (error) {
    console.error('Error sending message:', error);
  }
}


// Xử lý xóa câu hỏi chờ trả lời (đặt ở cuối file, trước app.listen)
app.post('/admin/delete-pending/:id', async (req, res) => {
  await PendingQuestion.findByIdAndDelete(req.params.id);
  // Giữ lại tab và trang hiện tại
  let pagePending = req.query.pagePending || 1;
  let tab = req.query.tab || 'pending';
  res.redirect(`/admin?tab=${tab}&pagePending=${pagePending}`);
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Graceful shutdown - tự động tắt ngrok khi server tắt
process.on('SIGINT', async () => {
  console.log('\n🔄 Đang tắt server...');
  
  if (ngrokActive && ngrokSession) {
    console.log('🔄 Đang tắt ngrok...');
    try {
      await ngrok.disconnect();
      await ngrok.kill();
      console.log('✅ Đã tắt ngrok thành công');
    } catch (error) {
      console.error('❌ Lỗi khi tắt ngrok:', error);
    }
  }
  
  server.close(() => {
    console.log('✅ Server đã tắt');
    process.exit(0);
  });
});

process.on('SIGTERM', async () => {
  console.log('\n🔄 Đang tắt server (SIGTERM)...');
  
  if (ngrokActive && ngrokSession) {
    console.log('🔄 Đang tắt ngrok...');
    try {
      await ngrok.disconnect();
      await ngrok.kill();
      console.log('✅ Đã tắt ngrok thành công');
    } catch (error) {
      console.error('❌ Lỗi khi tắt ngrok:', error);
    }
  }
  
  server.close(() => {
    console.log('✅ Server đã tắt');
    process.exit(0);
  });
});

// Admin: get auto-select status
app.get('/admin/auto-select-status', (req, res) => {
  if (!runtimeConfig) return res.json({ lastAutoModel: null, lastAutoAt: null });
  res.json({ lastAutoModel: runtimeConfig.lastAutoModel || null, lastAutoAt: runtimeConfig.lastAutoAt || null });
});

// Admin: get VERIFY_TOKEN
app.get('/admin/verify-token', (req, res) => {
  const verifyToken = runtimeConfig && runtimeConfig.verifyToken
    ? runtimeConfig.verifyToken
    : process.env.VERIFY_TOKEN;
  res.json({ verifyToken: verifyToken || null });
});

// Admin: set VERIFY_TOKEN
app.post('/admin/verify-token', express.urlencoded({ extended: true }), async (req, res) => {
  const { verifyToken } = req.body;
  if (!verifyToken) return res.json({ success: false, error: 'missing_verify_token' });
  try {
    const saved = await saveRuntimeConfig({ verifyToken });
    res.json({ success: true, saved, masked: verifyToken.slice(0,4) + '...' + verifyToken.slice(-4) });
  } catch (e) {
    res.json({ success: false, error: e?.message || String(e) });
  }
});

// Admin: set PAGE_ACCESS_TOKEN
app.post('/admin/page-token', express.urlencoded({ extended: true }), async (req, res) => {
  const { pageToken } = req.body;
  if (!pageToken) return res.json({ success: false, error: 'missing_page_token' });
  try {
    const saved = await saveRuntimeConfig({ pageAccessToken: pageToken });
    res.json({ success: true, saved, masked: pageToken.slice(0,4) + '...' + pageToken.slice(-4) });
  } catch (e) {
    res.json({ success: false, error: e?.message || String(e) });
  }
});

// Admin: test connection
app.get('/admin/test-connection', async (req, res) => {
  try {
    const PAGE_ACCESS_TOKEN = runtimeConfig && runtimeConfig.pageAccessToken ? runtimeConfig.pageAccessToken : process.env.PAGE_ACCESS_TOKEN;
    if (!PAGE_ACCESS_TOKEN) {
      return res.json({ success: false, error: 'Page Access Token chưa được cấu hình' });
    }
    
    // Test Facebook API connection
    const response = await axios.get(`https://graph.facebook.com/v18.0/me`, {
      params: { access_token: PAGE_ACCESS_TOKEN }
    });
    
    if (response.data && response.data.id) {
      res.json({ success: true, message: 'Kết nối Facebook thành công', pageId: response.data.id });
    } else {
      res.json({ success: false, error: 'Phản hồi không hợp lệ từ Facebook API' });
    }
  } catch (e) {
    console.error('Test connection error:', e);
    res.json({ success: false, error: e?.response?.data?.error?.message || e?.message || 'Lỗi kết nối' });
  }
});

// ===== NEW API ENDPOINTS FOR SETTINGS TAB =====

// GET GEMINI API KEY
app.get('/api/settings/gemini-api-key', (req, res) => {
  try {
    const apiKey = runtimeConfig?.genaiApiKey || process.env.GEMINI_API_KEY || '';
    res.json({ 
      success: true, 
      value: apiKey,
      masked: apiKey ? (apiKey.slice(0,4) + '...' + apiKey.slice(-4)) : null
    });
  } catch (e) {
    res.json({ success: false, error: e?.message || 'Lỗi khi lấy GEMINI API KEY' });
  }
});

// POST GEMINI API KEY
app.post('/api/settings/gemini-api-key', express.json(), async (req, res) => {
  try {
    const { value } = req.body;
    if (!value || !value.trim()) {
      return res.json({ success: false, error: 'API key không được để trống' });
    }
    
    // Save to database
    await saveRuntimeConfig({ genaiApiKey: value.trim() });
    
    // Update runtime
    setApiKey(value.trim());
    
    res.json({ 
      success: true, 
      message: 'Đã lưu GEMINI API KEY thành công',
      masked: value.slice(0,4) + '...' + value.slice(-4)
    });
  } catch (e) {
    res.json({ success: false, error: e?.message || 'Lỗi khi lưu GEMINI API KEY' });
  }
});

// GET PAGE ACCESS TOKEN
app.get('/api/settings/page-access-token', (req, res) => {
  try {
    const token = runtimeConfig?.pageAccessToken || process.env.PAGE_ACCESS_TOKEN || '';
    res.json({ 
      success: true, 
      value: token,
      masked: token ? (token.slice(0,4) + '...' + token.slice(-4)) : null
    });
  } catch (e) {
    res.json({ success: false, error: e?.message || 'Lỗi khi lấy PAGE ACCESS TOKEN' });
  }
});

// POST PAGE ACCESS TOKEN
app.post('/api/settings/page-access-token', express.json(), async (req, res) => {
  try {
    const { value } = req.body;
    if (!value || !value.trim()) {
      return res.json({ success: false, error: 'Page Access Token không được để trống' });
    }
    
    // Save to database
    await saveRuntimeConfig({ pageAccessToken: value.trim() });
    
    res.json({ 
      success: true, 
      message: 'Đã lưu PAGE ACCESS TOKEN thành công',
      masked: value.slice(0,4) + '...' + value.slice(-4)
    });
  } catch (e) {
    res.json({ success: false, error: e?.message || 'Lỗi khi lưu PAGE ACCESS TOKEN' });
  }
});

// GET VERIFY TOKEN
app.get('/api/settings/verify-token', (req, res) => {
  try {
    const token = runtimeConfig?.verifyToken || process.env.VERIFY_TOKEN || '';
    res.json({ 
      success: true, 
      value: token,
      masked: token ? (token.slice(0,4) + '...' + token.slice(-4)) : null
    });
  } catch (e) {
    res.json({ success: false, error: e?.message || 'Lỗi khi lấy VERIFY TOKEN' });
  }
});

// POST VERIFY TOKEN
app.post('/api/settings/verify-token', express.json(), async (req, res) => {
  try {
    const { value } = req.body;
    if (!value || !value.trim()) {
      return res.json({ success: false, error: 'Verify Token không được để trống' });
    }
    
    // Save to database
    await saveRuntimeConfig({ verifyToken: value.trim() });
    
    res.json({ 
      success: true, 
      message: 'Đã lưu VERIFY TOKEN thành công',
      masked: value.slice(0,4) + '...' + value.slice(-4)
    });
  } catch (e) {
    res.json({ success: false, error: e?.message || 'Lỗi khi lưu VERIFY TOKEN' });
  }
});

// GET CURRENT MODEL
app.get('/api/settings/current-model', (req, res) => {
  try {
    const currentModel = getCachedModelName() || runtimeConfig?.genaiModel || '';
    res.json({ 
      success: true, 
      value: currentModel
    });
  } catch (e) {
    res.json({ success: false, error: e?.message || 'Lỗi khi lấy model hiện tại' });
  }
});

// POST CURRENT MODEL
app.post('/api/settings/current-model', express.json(), async (req, res) => {
  try {
    const { model } = req.body;
    
    if (!model || !model.trim()) {
      return res.json({ success: false, error: 'Model không được để trống' });
    }
    
    // Save to database
    await saveRuntimeConfig({ genaiModel: model.trim() });
    
    // Update runtime
    setCachedModelName(model.trim());
    
    res.json({ 
      success: true, 
      message: `Đã chọn model: ${model}`,
      value: model.trim()
    });
  } catch (e) {
    res.json({ success: false, error: e?.message || 'Lỗi khi lưu model' });
  }
});

// GET AVAILABLE MODELS
app.get('/api/models/available', async (req, res) => {
  try {
    console.log('🔍 API: Loading available models...');
    
    // Check Gemini status first
    const status = getGeminiStatus();
    console.log('📊 Gemini status:', status);
    
    if (status.status === 'no_api_key') {
      return res.json({ 
        success: false, 
        error: 'GEMINI API KEY chưa được cấu hình',
        models: []
      });
    }
    
    if (status.status === 'initialization_failed') {
      return res.json({ 
        success: false, 
        error: 'Gemini client initialization failed. Please check your API key.',
        models: []
      });
    }
    
    const models = await listAvailableModels();
    console.log(`✅ Found ${models.length} models`);
    
    res.json({ 
      success: true, 
      models: models,
      status: status
    });
  } catch (e) {
    console.error('❌ Error loading models:', e);
    res.json({ 
      success: false, 
      error: e?.message || 'Lỗi khi lấy danh sách model',
      models: []
    });
  }
});

// FORCE SWITCH MODEL (for quota exceeded)
app.post('/api/models/force-switch', async (req, res) => {
  try {
    const { fromModel, toModel } = req.body;
    
    if (!fromModel || !toModel) {
      return res.json({ success: false, error: 'Missing fromModel or toModel' });
    }
    
    console.log(`🔄 Force switching model from ${fromModel} to ${toModel}`);
    
    // Save to database
    await saveRuntimeConfig({ genaiModel: toModel });
    
    // Update runtime
    setCachedModelName(toModel);
    
    // Update global variable
    genaiModel = toModel;
    
    console.log(`✅ Model force switched to ${toModel}`);
    
    res.json({ 
      success: true, 
      message: `Model switched from ${fromModel} to ${toModel}`,
      newModel: toModel
    });
  } catch (e) {
    console.error('Error force switching model:', e);
    res.json({ 
      success: false, 
      error: e?.message || 'Lỗi khi chuyển đổi model'
    });
  }
});

// GET GEMINI STATUS
app.get('/api/settings/gemini-status', (req, res) => {
  try {
    const status = getGeminiStatus();
    res.json({ 
      success: true, 
      status: status.status,
      hasApiKey: status.hasApiKey,
      isInitialized: status.isInitialized,
      message: status.status === 'ready' ? 'Gemini client ready' : 
               status.status === 'no_api_key' ? 'No API key configured' :
               'Gemini client initialization failed'
    });
  } catch (e) {
    res.json({ 
      success: false, 
      error: e?.message || 'Lỗi khi lấy trạng thái Gemini'
    });
  }
});

// GET AI PROMPT
app.get('/api/settings/ai-prompt', async (req, res) => {
  try {
    const config = await Config.findOne();
    const prompt = config?.aiPrompt || '';
    res.json({ 
      success: true, 
      value: prompt
    });
  } catch (e) {
    res.json({ success: false, error: e?.message || 'Lỗi khi lấy AI Prompt' });
  }
});

// POST AI PROMPT
app.post('/api/settings/ai-prompt', express.json(), async (req, res) => {
  try {
    const { value } = req.body;
    
    if (!value || !value.trim()) {
      return res.json({ success: false, error: 'AI Prompt không được để trống' });
    }
    
    // Save to database
    await saveRuntimeConfig({ aiPrompt: value.trim() });
    
    res.json({ 
      success: true, 
      message: 'Đã lưu AI Prompt thành công'
    });
  } catch (e) {
    res.json({ success: false, error: e?.message || 'Lỗi khi lưu AI Prompt' });
  }
});

// GET AI ENABLED STATUS
app.get('/api/settings/ai-enabled', async (req, res) => {
  try {
    const config = await Config.findOne() || {};
    res.json({ 
      success: true, 
      value: config.useAI !== false // Default to true
    });
  } catch (e) {
    res.json({ success: false, error: e?.message || 'Lỗi khi tải AI status' });
  }
});

// POST AI ENABLED STATUS
app.post('/api/settings/ai-enabled', express.json(), async (req, res) => {
  try {
    const { value } = req.body;
    
    if (typeof value !== 'boolean') {
      return res.json({ success: false, error: 'Giá trị phải là boolean' });
    }
    
    // Save to database
    await saveRuntimeConfig({ useAI: value });
    
    console.log(`🎛️ AI ${value ? 'ĐÃ ĐƯỢC BẬT' : 'ĐÃ ĐƯỢC TẮT'} từ admin panel`);
    
    res.json({ 
      success: true, 
      message: `Đã ${value ? 'bật' : 'tắt'} AI thành công`
    });
  } catch (e) {
    res.json({ success: false, error: e?.message || 'Lỗi khi thay đổi AI status' });
  }
});

// GET AI TRAIN STATUS
app.get('/api/settings/ai-train-enabled', async (req, res) => {
  try {
    const config = await Config.findOne() || {};
    res.json({ 
      success: true, 
      value: config.useAITrain !== false // Default to true
    });
  } catch (e) {
    res.json({ success: false, error: e?.message || 'Lỗi khi tải AI Train status' });
  }
});

// POST AI TRAIN STATUS
app.post('/api/settings/ai-train-enabled', express.json(), async (req, res) => {
  try {
    const { value } = req.body;
    
    if (typeof value !== 'boolean') {
      return res.json({ success: false, error: 'Giá trị phải là boolean' });
    }
    
    // Save to database
    await saveRuntimeConfig({ useAITrain: value });
    
    console.log(`🎓 AI Training ${value ? 'ĐÃ ĐƯỢC BẬT' : 'ĐÃ ĐƯỢC TẮT'} từ admin panel`);
    
    res.json({ 
      success: true, 
      message: `Đã ${value ? 'bật' : 'tắt'} AI Train thành công`
    });
  } catch (e) {
    res.json({ success: false, error: e?.message || 'Lỗi khi thay đổi AI Train status' });
  }
});

// GET THRESHOLD SETTINGS
app.get('/api/settings/thresholds', async (req, res) => {
  try {
    const config = await Config.findOne() || {};
    res.json({ 
      success: true, 
      scoreThresholdHigh: config.scoreThresholdHigh || 0.4,
      scoreThresholdLow: config.scoreThresholdLow || 0.3
    });
  } catch (e) {
    res.json({ success: false, error: e?.message || 'Lỗi khi tải threshold settings' });
  }
});

// POST THRESHOLD SETTINGS
app.post('/api/settings/thresholds', express.json(), async (req, res) => {
  try {
    const { scoreThresholdHigh, scoreThresholdLow } = req.body;
    
    // Validate
    if (typeof scoreThresholdHigh !== 'number' || typeof scoreThresholdLow !== 'number') {
      return res.json({ success: false, error: 'Giá trị threshold phải là số' });
    }
    
    if (scoreThresholdHigh < 0 || scoreThresholdHigh > 1 || scoreThresholdLow < 0 || scoreThresholdLow > 1) {
      return res.json({ success: false, error: 'Giá trị threshold phải trong khoảng 0-1' });
    }
    
    if (scoreThresholdLow >= scoreThresholdHigh) {
      return res.json({ success: false, error: 'Ngưỡng thấp phải nhỏ hơn ngưỡng cao' });
    }
    
    // Save to database
    await saveRuntimeConfig({ scoreThresholdHigh, scoreThresholdLow });
    
    res.json({ 
      success: true, 
      message: 'Đã lưu threshold settings thành công'
    });
  } catch (e) {
    res.json({ success: false, error: e?.message || 'Lỗi khi lưu threshold settings' });
  }
});

// GET ADMIN STATS (for badge refresh)
app.get('/api/admin/stats', async (req, res) => {
  try {
    const totalQuestions = await Question.countDocuments();
    const totalPending = await PendingQuestion.countDocuments();
    
    // Count questions added today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    
    const newQuestionsToday = await Question.countDocuments({
      createdAt: { $gte: todayStart, $lte: todayEnd }
    });
    
    res.json({ 
      success: true, 
      totalQuestions,
      totalPending,
      newQuestionsToday
    });
  } catch (e) {
    res.json({ success: false, error: e?.message || 'Lỗi khi tải stats' });
  }
});

// PENDING QUESTIONS LIST API
app.get('/api/pending/list', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 6));
    const total = await PendingQuestion.countDocuments();
    const totalPages = Math.ceil(total / limit);
    const questions = await PendingQuestion.find()
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);
    res.json({ success: true, questions, total, page, totalPages });
  } catch (e) {
    res.json({ success: false, error: e?.message || 'Lỗi' });
  }
});

// REAL-TIME SEARCH & FILTER API
app.get('/api/questions/search', async (req, res) => {
  try {
    const source = req.query.source || 'all';
    const search = req.query.search || '';
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 12));
    
    // Build query filter
    let queryFilter = {};
    if (source !== 'all') {
      const validSources = ['admin', 'database', 'ai_generated', 'ai_improved', 'import'];
      if (validSources.includes(source)) {
        queryFilter.source = source;
      }
    }
    if (search) {
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchRegex = new RegExp(escapedSearch, 'i');
      queryFilter.$or = [
        { question: searchRegex },
        { answers: searchRegex }
      ];
    }
    
    // Get questions with filter
    const allQuestions = await Question.find(queryFilter).sort({ createdAt: -1 });
    
    // Deduplicate
    const uniqueQuestions = [];
    const seen = new Set();
    allQuestions.forEach(q => {
      const key = q.question.toLowerCase().trim();
      if (!seen.has(key)) {
        seen.add(key);
        uniqueQuestions.push(q);
      }
    });
    
    const total = uniqueQuestions.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const questions = uniqueQuestions.slice(startIndex, startIndex + limit);
    
    // Source stats
    const sourceStats = {
      admin: await Question.countDocuments({ source: 'admin' }),
      ai_generated: await Question.countDocuments({ source: 'ai_generated' }),
      ai_improved: await Question.countDocuments({ source: 'ai_improved' }),
      import: await Question.countDocuments({ source: 'import' }),
      database: await Question.countDocuments({ source: 'database' })
    };
    
    res.json({
      success: true,
      questions: questions.map(q => ({
        _id: q._id,
        question: q.question,
        answers: q.answers,
        source: q.source || 'database',
        createdAt: q.createdAt
      })),
      page,
      totalPages,
      total,
      sourceStats
    });
  } catch (e) {
    console.error('❌ Search API error:', e);
    res.json({ success: false, error: e?.message || 'Lỗi khi tìm kiếm' });
  }
});

// TEST GEMINI API
app.get('/api/test/gemini', async (req, res) => {
  try {
    // Check Gemini status first
    const status = getGeminiStatus();
    
    if (status.status === 'no_api_key') {
      return res.json({ success: false, error: 'GEMINI API KEY chưa được cấu hình' });
    }
    
    if (status.status === 'initialization_failed') {
      return res.json({ success: false, error: 'Gemini client initialization failed. Please check your API key.' });
    }
    
    // Test with a simple probe
    const probe = await probeCandidateModels();
    const hasWorkingModel = probe.some(p => p.ok);
    
    if (hasWorkingModel) {
      res.json({ success: true, message: 'GEMINI API hoạt động tốt', probe, status });
    } else {
      res.json({ success: false, error: 'Không có model nào hoạt động', probe, status });
    }
  } catch (e) {
    res.json({ success: false, error: e?.message || 'Lỗi khi test GEMINI API' });
  }
});

// TEST PAGE TOKEN
app.get('/api/test/page-token', async (req, res) => {
  try {
    const PAGE_ACCESS_TOKEN = runtimeConfig?.pageAccessToken || process.env.PAGE_ACCESS_TOKEN;
    if (!PAGE_ACCESS_TOKEN) {
      return res.json({ success: false, error: 'PAGE ACCESS TOKEN chưa được cấu hình' });
    }
    
    // Test Facebook API connection
    const response = await axios.get(`https://graph.facebook.com/v18.0/me`, {
      params: { access_token: PAGE_ACCESS_TOKEN }
    });
    
    if (response.data && response.data.id) {
      res.json({ 
        success: true, 
        message: 'PAGE ACCESS TOKEN hoạt động tốt', 
        pageId: response.data.id,
        pageName: response.data.name
      });
    } else {
      res.json({ success: false, error: 'Phản hồi không hợp lệ từ Facebook API' });
    }
  } catch (e) {
    res.json({ 
      success: false, 
      error: e?.response?.data?.error?.message || e?.message || 'Lỗi khi test PAGE ACCESS TOKEN' 
    });
  }
});

// TEST VERIFY TOKEN
app.get('/api/test/verify-token', (req, res) => {
  try {
    const verifyToken = runtimeConfig?.verifyToken || process.env.VERIFY_TOKEN;
    if (!verifyToken) {
      return res.json({ success: false, error: 'VERIFY TOKEN chưa được cấu hình' });
    }
    
    // Verify token is not empty and has reasonable length
    if (verifyToken.length < 10) {
      return res.json({ success: false, error: 'VERIFY TOKEN quá ngắn (tối thiểu 10 ký tự)' });
    }
    
    res.json({ 
      success: true, 
      message: 'VERIFY TOKEN có định dạng hợp lệ',
      length: verifyToken.length
    });
  } catch (e) {
    res.json({ success: false, error: e?.message || 'Lỗi khi test VERIFY TOKEN' });
  }
});

// ===== DEFAULT RESPONSES MANAGEMENT =====

// GET all default responses
app.get('/api/default-responses', async (req, res) => {
  try {
    const responses = await DefaultResponse.find().sort({ priority: 1, createdAt: 1 });
    res.json({ success: true, responses });
  } catch (e) {
    res.json({ success: false, error: e?.message || 'Lỗi khi lấy danh sách câu trả lời mặc định' });
  }
});

// GET single default response
app.get('/api/default-responses/:id', async (req, res) => {
  try {
    const response = await DefaultResponse.findById(req.params.id);
    if (!response) {
      return res.json({ success: false, error: 'Không tìm thấy câu trả lời mặc định' });
    }
    res.json({ success: true, response });
  } catch (e) {
    res.json({ success: false, error: e?.message || 'Lỗi khi lấy câu trả lời mặc định' });
  }
});

// POST create new default response
app.post('/api/default-responses', express.json(), async (req, res) => {
  try {
    const { name, message, priority = 1 } = req.body;
    
    if (!name || !message) {
      return res.json({ success: false, error: 'Tên và nội dung câu trả lời không được để trống' });
    }
    
    const response = await DefaultResponse.create({ name, message, priority });
    res.json({ success: true, response, message: 'Đã tạo câu trả lời mặc định thành công' });
  } catch (e) {
    if (e.code === 11000) {
      res.json({ success: false, error: 'Tên câu trả lời đã tồn tại' });
    } else {
      res.json({ success: false, error: e?.message || 'Lỗi khi tạo câu trả lời mặc định' });
    }
  }
});

// PUT update default response
app.put('/api/default-responses/:id', express.json(), async (req, res) => {
  try {
    const { name, message, isActive, priority } = req.body;
    
    if (!name || !message) {
      return res.json({ success: false, error: 'Tên và nội dung câu trả lời không được để trống' });
    }
    
    const response = await DefaultResponse.findByIdAndUpdate(
      req.params.id,
      { name, message, isActive, priority },
      { new: true }
    );
    
    if (!response) {
      return res.json({ success: false, error: 'Không tìm thấy câu trả lời mặc định' });
    }
    
    res.json({ success: true, response, message: 'Đã cập nhật câu trả lời mặc định thành công' });
  } catch (e) {
    if (e.code === 11000) {
      res.json({ success: false, error: 'Tên câu trả lời đã tồn tại' });
    } else {
      res.json({ success: false, error: e?.message || 'Lỗi khi cập nhật câu trả lời mặc định' });
    }
  }
});

// DELETE default response
app.delete('/api/default-responses/:id', async (req, res) => {
  try {
    const response = await DefaultResponse.findByIdAndDelete(req.params.id);
    if (!response) {
      return res.json({ success: false, error: 'Không tìm thấy câu trả lời mặc định' });
    }
    res.json({ success: true, message: 'Đã xóa câu trả lời mặc định thành công' });
  } catch (e) {
    res.json({ success: false, error: e?.message || 'Lỗi khi xóa câu trả lời mặc định' });
  }
});

// GET random active default response
app.get('/api/default-responses/random', async (req, res) => {
  try {
    const responses = await DefaultResponse.find({ isActive: true }).sort({ priority: 1 });
    if (responses.length === 0) {
      return res.json({ success: false, error: 'Không có câu trả lời mặc định nào được kích hoạt' });
    }
    
    // Get responses with highest priority
    const highestPriority = responses[0].priority;
    const topPriorityResponses = responses.filter(r => r.priority === highestPriority);
    
    // Random select from top priority responses
    const randomResponse = topPriorityResponses[Math.floor(Math.random() * topPriorityResponses.length)];
    
    res.json({ success: true, response: randomResponse });
  } catch (e) {
    res.json({ success: false, error: e?.message || 'Lỗi khi lấy câu trả lời mặc định ngẫu nhiên' });
  }
});