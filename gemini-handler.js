const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
require('dotenv').config();

let genAI = null;

function initGenAI(key) {
   if (!key) return null;
   try {
      genAI = new GoogleGenerativeAI(key);
      return genAI;
   } catch (e) {
      console.error('Failed to init GoogleGenerativeAI:', e?.message || e);
      genAI = null;
      return null;
   }
}

// Initialize once with env var if present
initGenAI(process.env.GEMINI_API_KEY);
// Cache detected model name and allow override via env var
let cachedModelName = process.env.GENAI_MODEL || null;

async function detectModelName() {
   if (cachedModelName) return cachedModelName;
   // Build list of candidate model names to probe. Allow override via GENAI_MODEL env var.
   const candidates = [];
   if (process.env.GENAI_MODEL) candidates.push(process.env.GENAI_MODEL);
   // Common names / variants to try
   candidates.push('gemini-1.0', 'gemini-1.0-pro', 'models/gemini-1.0', 'models/gemini-1.0-pro');
   candidates.push('text-bison-001', 'models/text-bison-001', 'bison', 'models/bison-001');

   for (const c of candidates) {
      if (!c) continue;
      try {
         if (!genAI) throw new Error('Generative AI client not initialized');
         // Try a tiny generation to validate the model name works for generateContent
         const model = genAI.getGenerativeModel({ model: c });
         // Minimal prompt and attempt to generate small output
         const probe = await model.generateContent('Hello', { maxOutputTokens: 1 }).catch(e => { throw e; });
         // If we get here without throwing, assume this model works
         cachedModelName = c;
         console.log('Detected generative model by probing:', cachedModelName);
         return cachedModelName;
      } catch (err) {
         // Continue trying next candidate
         console.warn(`Model probe failed for ${c}:`, err?.message || err);
      }
   }
   console.error('No candidate generative model worked. Set GENAI_MODEL env to a valid model if available.');
   return null;
}

// Probe all candidate models and return detailed results (does not stop at first success)
async function probeCandidateModels() {
   if (!genAI) {
      return [{ model: 'none', ok: false, error: 'Generative AI client not initialized' }];
   }
   
   const candidates = [];
   if (process.env.GENAI_MODEL) candidates.push(process.env.GENAI_MODEL);
   candidates.push('models/gemini-2.0-flash', 'models/gemini-2.5-flash', 'models/gemini-1.5-flash', 'models/gemini-1.5-pro');
   candidates.push('gemini-1.0', 'gemini-1.0-pro', 'models/gemini-1.0', 'models/gemini-1.0-pro');
   candidates.push('text-bison-001', 'models/text-bison-001', 'bison', 'models/bison-001');
   
   const results = [];
   for (const c of candidates) {
      if (!c) continue;
      try {
         const model = genAI.getGenerativeModel({ model: c });
         await model.generateContent('test', { maxOutputTokens: 1 });
         results.push({ model: c, ok: true });
      } catch (err) {
         results.push({ model: c, ok: false, error: err?.message || String(err) });
      }
   }
   
   const workingModels = results.filter(r => r.ok);
   if (workingModels.length > 0) {
      console.log(`✅ Tìm thấy ${workingModels.length} model khả dụng`);
   }
   
   return results;
}

function setApiKey(key) {
   if (!key || key.trim() === '') {
      return;
   }
   
   process.env.GEMINI_API_KEY = key;
   const result = initGenAI(key);
   
   if (result) {
      console.log(`✅ Đã kết nối Gemini API`);
   }
}

function getApiKeyMasked() {
   const key = process.env.GEMINI_API_KEY || '';
   if (!key) return null;
   if (key.length <= 8) return key.replace(/.(?=.{2,}$)/g, '*');
   return key.slice(0, 4) + '...' + key.slice(-4);
}

function getApiKey() {
   return process.env.GEMINI_API_KEY || '';
}

// Function to test if Gemini client is properly initialized
function isGeminiInitialized() {
   return genAI !== null;
}

// Function to get Gemini client status
function getGeminiStatus() {
   const hasApiKey = !!getApiKey();
   const isInitialized = isGeminiInitialized();
   
   return {
      hasApiKey,
      isInitialized,
      status: hasApiKey && isInitialized ? 'ready' : hasApiKey ? 'initialization_failed' : 'no_api_key'
   };
}

// Hàm chuẩn hóa văn bản bằng Gemini (sửa lỗi chính tả, chuẩn hóa cách diễn đạt)
async function normalizeTextGemini(text) {
  const prompt = `Chuẩn hóa và sửa lỗi chính tả cho đoạn văn bản sau, chỉ trả về văn bản đã chuẩn hóa, không thêm bất kỳ lời giải thích hay nội dung nào khác:\n\n${text}`;

   try {
      if (!genAI) {
         console.error('❌ Gemini client not initialized. Please set a valid API key.');
         return text;
      }
      
      const modelName = await detectModelName() || 'models/text-bison-001';
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text().trim();
   } catch (error) {
      console.error('Lỗi khi chuẩn hóa văn bản bằng Gemini:', error);
      
      // Handle quota exceeded error specifically
      if (error && (error.message.includes('429') || error.message.includes('quota') || error.message.includes('Too Many Requests'))) {
         const isFreeT = error.message.includes('free_tier');
         
         if (isFreeT) {
            console.error('⛔ API KEY FREE TIER - Cần dùng Pro API key! Run: npm run update-api');
         } else {
            console.error('🚨 Gemini API quota exceeded during text normalization! Using original text.');
         }
         
         await handleQuotaExceeded();
         return text;
      }
      
      // Nếu lỗi, trả về văn bản gốc để tiếp tục xử lý
      return text;
   }
}

// Phân loại câu hỏi: có nên lưu vào CSDL không?
// Trả về: { shouldSave: true/false, category: 'it_question'|'casual'|'greeting'|'off_topic' }
function classifyQuestion(text) {
   if (!text || typeof text !== 'string') return { shouldSave: false, category: 'casual' };
   
   const trimmed = text.trim().toLowerCase();
   
   // Quá ngắn (dưới 5 ký tự) → không lưu
   if (trimmed.length < 5) return { shouldSave: false, category: 'casual' };
   
   // Regex: câu chào hỏi, xã giao
   const greetingPatterns = [
      /^(xin\s+)?ch[aà]o(\s+b[aạ]n)?/i,
      /^h[eê]ll?o\b/i,
      /^hi\b/i,
      /^hey\b/i,
      /^good\s*(morning|afternoon|evening|night)/i,
      /^(chào|bye|tạm biệt|hẹn gặp|gặp lại)/i,
      /^(cảm ơn|cám ơn|thanks?|thank\s*you|tks)/i,
      /^(ok|okay|ừ|ờ|uh|uhm|vâng|dạ|à|ồ)\b/i,
      /^(bạn\s+(tên|là)\s+(gì|ai))/i,
      /^(bạn\s+có\s+khỏe|bạn\s+thế\s+nào|khỏe\s+không)/i,
      /^(tôi|mình|tớ|em|anh|chị)\s+(tên|là)\s/i,
      /^(gọi\s+(tôi|mình|tớ)|hãy\s+gọi)/i,
      /^(bạn\s+ơi|ê\s+bạn|này\s+bạn)/i,
      /^(haha|hihi|hehe|lol|😀|😂|👋)/i,
      /^(có\s+ai\s+(đó|không)|ai\s+đó)/i,
      /^(chúc|merry|happy)\s/i,
   ];
   
   for (const pattern of greetingPatterns) {
      if (pattern.test(trimmed)) {
         return { shouldSave: false, category: 'greeting' };
      }
   }
   
   // Regex: câu xã giao, chuyện phiếm, không liên quan IT
   const casualPatterns = [
      /^(hôm nay|ngày mai|hôm qua)\s+(trời|thời tiết|bạn)/i,
      /^(bạn\s+(?:thích|yêu|ghét|sợ)\s)/i,
      /^(thời tiết|ăn gì|đi đâu|buồn|vui|mệt|đói)/i,
      /^(kể chuyện|hát|đọc thơ|hài|fun fact)/i,
      /^(bạn\s+biết\s+(bài hát|phim|truyện|ca sĩ|diễn viên))/i,
   ];
   
   for (const pattern of casualPatterns) {
      if (pattern.test(trimmed)) {
         return { shouldSave: false, category: 'off_topic' };
      }
   }
   
   // Regex: các từ khóa IT → chắc chắn nên lưu
   const itKeywords = /\b(excel|word|powerpoint|ppt|outlook|access|sql|html|css|javascript|js|python|java|c\+\+|php|code|coding|lập trình|phần mềm|software|hardware|phần cứng|máy tính|computer|laptop|điện thoại|phone|android|ios|windows|linux|mac|macos|wifi|internet|mạng|network|server|database|cơ sở dữ liệu|dữ liệu|data|file|folder|thư mục|tệp|ổ cứng|ram|cpu|gpu|ssd|hdd|usb|driver|virus|malware|hack|bảo mật|security|password|mật khẩu|email|web|website|app|ứng dụng|cài đặt|install|download|tải|update|cập nhật|lỗi|error|bug|fix|sửa|hàm|function|công thức|formula|vlookup|hlookup|if|sumif|countif|pivot|macro|vba|bảng tính|spreadsheet|slide|trình chiếu|font|chữ|paragraph|đoạn văn|header|footer|table|bảng|chart|biểu đồ|print|in|format|định dạng|merge|gộp|sort|sắp xếp|filter|lọc|ai|trí tuệ nhân tạo|machine learning|deep learning|algorithm|giải thuật|thuật toán|api|framework|library|thư viện|git|github|terminal|command|cmd|powershell|node|npm|react|angular|vue|bootstrap|mongodb|mysql|postgre|oracle|cloud|docker|devops|ip|dns|http|https|tcp|udp|router|switch|firewall|ảo hóa|virtual|blockchain|crypto|photoshop|illustrator|figma|canva|premiere|after effects|autocad|3d|render|pixel|resolution|độ phân giải|backup|sao lưu|restore|khôi phục|troubleshoot|debug|compile|biên dịch|deploy|hosting|domain|tên miền|ssl|certificate|encrypt|mã hóa|decode|encode|xml|json|csv|pdf|zip|rar|tar|registry|bios|boot|khởi động|partition|phân vùng|format|ghost|clone|remote|teamviewer|vpn|proxy|bandwidth|băng thông|ping|tracert|port|cổng|protocol|giao thức|ascii|unicode|utf|binary|nhị phân|hex|octal|bit|byte|kb|mb|gb|tb|overclock|ép xung|benchmark|test hiệu năng|fps|refresh rate|monitor|màn hình|keyboard|bàn phím|mouse|chuột|speaker|loa|microphone|scanner|máy quét|printer|máy in)\b/i;
   
   if (itKeywords.test(trimmed)) {
      return { shouldSave: true, category: 'it_question' };
   }
   
   // Câu có dấu chấm hỏi hoặc từ khóa hỏi + đủ dài → có thể là câu hỏi cần lưu
   const hasQuestionMark = /\?/.test(trimmed);
   const hasQuestionWord = /\b(là gì|như thế nào|thế nào|làm sao|bằng cách nào|tại sao|vì sao|ở đâu|khi nào|có thể|cách|hướng dẫn|giúp|chỉ|dạy|how|what|why|where|when|which|can|could|please|help)\b/i.test(trimmed);
   
   if ((hasQuestionMark || hasQuestionWord) && trimmed.length >= 15) {
      return { shouldSave: true, category: 'it_question' };
   }
   
   // Câu đủ dài (>=20 ký tự) và không match casual → mặc định lưu
   if (trimmed.length >= 20) {
      return { shouldSave: true, category: 'it_question' };
   }
   
   // Ngắn, không rõ ràng → không lưu
   return { shouldSave: false, category: 'casual' };
}

// Hàm sinh câu trả lời cuối cùng bằng Gemini dựa trên ngữ cảnh tìm được
async function getFinalAIResponse(originalQuestion, relevantQuestions, conversationHistory) {
   // Chuẩn bị ngữ cảnh từ các câu hỏi/trả lời liên quan
   let answerContext = '';
   if (relevantQuestions && relevantQuestions.length > 0) {
      answerContext = relevantQuestions.map(q => `Câu hỏi: ${q.question}\nTrả lời: ${q.answer}`).join('\n---\n');
   } else {
      answerContext = 'Không tìm thấy thông tin liên quan trong database.';
   }

   // Chuẩn bị lịch sử hội thoại
   let chatHistoryContext = '';
   if (conversationHistory && conversationHistory.length > 0) {
      chatHistoryContext = '\n\nLỊCH SỬ HỘI THOẠI GẦN ĐÂY:\n' + conversationHistory.map(m => {
         return (m.role === 'user' ? 'Người dùng' : 'Bot') + ': ' + m.text;
      }).join('\n');
   }

   // Get AI prompt from database or use default
   let aiPromptTemplate = `Bạn tên là Chatbot tin học, gọi bạn xưng tớ, là trợ lý thân thiện chuyên trả lời các câu hỏi về tin học dựa trên thông tin từ database.

THÔNG TIN TỪ DATABASE: {{answerContext}}

CÂU HỎI CỦA NGƯỜI DÙNG: "{{originalQuestion}}"

QUY TẮC XỬ LÝ (CHỈ DÙNG NỘI BỘ, KHÔNG HIỂN THỊ CHO NGƯỜI DÙNG):
- Nếu người dùng chào hỏi/xã giao → trả lời thân thiện, ngắn gọn
- Nếu hỏi về tin học → dùng thông tin database để trả lời chi tiết, chính xác. Nếu không có trong database thì nói chưa có thông tin.
- Nếu hỏi ngoài tin học → nhẹ nhàng chuyển hướng về tin học

**NGUYÊN TẮC QUAN TRỌNG:**
- CHỈ TRẢ LỜI TRỰC TIẾP câu hỏi. TUYỆT ĐỐI KHÔNG được viết ra quá trình phân tích, phân loại câu hỏi, hoặc bất kỳ ghi chú nội bộ nào.
- KHÔNG bao giờ viết những câu như "Dựa trên phân tích...", "Câu hỏi thuộc loại...", "Đây là câu chào/xã giao..." hay tương tự.
- Trả lời tự nhiên như đang nói chuyện với bạn bè.
- Luôn thân thiện, vui vẻ
- Chỉ trả lời về tin học
- Sử dụng "tớ" để xưng hô
- Nếu người dùng giới thiệu tên, hãy nhớ và gọi tên họ`;

   try {
      const Config = require('./models/Config');
      const config = await Config.findOne();
      if (config && config.aiPrompt && config.aiPrompt.trim()) {
         aiPromptTemplate = config.aiPrompt;
         console.log('📝 Dùng AI prompt tùy chỉnh từ database');
      }
   } catch (error) {
      // Use default prompt
   }

   // Luôn thêm lệnh cấm phân loại vào cuối prompt (bất kể custom hay default)
   const noClassifyInstruction = '\n\nLƯU Ý CỰC KỲ QUAN TRỌNG: TUYỆT ĐỐI KHÔNG viết ra loại câu hỏi, phân loại, hoặc phân tích. KHÔNG viết "Loại câu hỏi:", "Câu chào/xã giao", "Dựa trên phân tích" hay bất kỳ nhãn phân loại nào. Chỉ trả lời trực tiếp nội dung.';
   aiPromptTemplate += noClassifyInstruction;

   // Replace template variables with actual values
   const finalPrompt = aiPromptTemplate
      .replace(/{{answerContext}}/g, answerContext)
      .replace(/{{originalQuestion}}/g, originalQuestion)
      .replace(/{{chatHistory}}/g, chatHistoryContext);

   // Append conversation history if not already in template
   const promptWithHistory = finalPrompt.includes(chatHistoryContext) || !chatHistoryContext
      ? finalPrompt
      : finalPrompt + chatHistoryContext + '\n\nCÂU HỎI HIỆN TẠI CỦA NGƯỜI DÙNG: "' + originalQuestion + '"\nHãy trả lời dựa trên ngữ cảnh cuộc trò chuyện ở trên. Nếu người dùng đang hỏi tiếp về chủ đề trước, hãy hiểu ngữ cảnh và trả lời liên tục.';

   try {
      if (!genAI) {
         console.error('❌ Gemini client not initialized. Please set a valid API key.');
         return null;
      }
      
      const modelName = await detectModelName() || 'models/text-bison-001';
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(promptWithHistory);
      const response = await result.response;
      let text = response.text().trim();
      
      // Strip any leaked analysis/classification text from the response
      // Remove lines like "Loại câu hỏi: CÂU CHÀO/XÃ GIAO", "Dựa trên phân tích...", etc.
      text = text.replace(/^[\s\S]*?(?:Loại câu hỏi|Lo[aạ]i c[aâ]u h[oỏ]i)\s*[:：]\s*[^\n]*\n*/gi, '');
      text = text.replace(/^Dựa trên phân tích[\s\S]*?(?:thuộc loại[^.\n]*\.?\s*(?:\*{0,2})?\s*\n*)/gi, '');
      text = text.replace(/^(?:Câu hỏi|Đây)\s+(?:này\s+)?(?:thuộc|là)\s+(?:loại|dạng)[^.\n]*\.?\s*\n*/gi, '');
      text = text.replace(/^\*{0,2}(?:CÂU CHÀO|CÂU HỎI|XÃ GIAO|TIN HỌC|KHÁC|CHÀO HỎI|GREETING|CASUAL)[^*\n]*\*{0,2}[.:：]?\s*\n*/gi, '');
      text = text.replace(/^(?:Phân (?:tích|loại)|Nhận (?:diện|dạng)|Xác định)\s*[:：]?\s*[^\n]*\n*/gi, '');
      text = text.replace(/^(?:→|->|==>?|>>)\s*(?:Đây là|Thuộc|Loại)\s*[^\n]*\n*/gi, '');
      
      return text.trim();
   } catch (error) {
      console.error('Lỗi khi sinh câu trả lời cuối cùng bằng Gemini/generative model:', error?.message || error);
      
      // Handle quota exceeded error specifically
      if (error && (error.message.includes('429') || error.message.includes('quota') || error.message.includes('Too Many Requests'))) {
         console.error('\n╔══════════════════════════════════════════════════════════╗');
         console.error('║         🚨 GEMINI API QUOTA EXCEEDED 🚨                 ║');
         console.error('╚══════════════════════════════════════════════════════════╝\n');
         
         // Detect if using free tier
         const isFreeT = error.message.includes('free_tier');
         
         if (isFreeT) {
            console.error('⛔ API KEY ĐANG DÙNG LÀ FREE TIER (không phải Pro)');
            console.error('');
            console.error('📊 Giới hạn Free Tier:');
            console.error('   • 15 requests/phút');
            console.error('   • 1,500 requests/ngày');
            console.error('   • Không có priority queue');
            console.error('');
            console.error('✅ CÁCH KHẮC PHỤC:');
            console.error('   1. LẤY API KEY TỪ TÀI KHOẢN PRO:');
            console.error('      - Mở Incognito/Private browser');
            console.error('      - Đăng nhập tài khoản Google có "Google One AI Premium"');
            console.error('      - Truy cập: https://aistudio.google.com/app/apikey');
            console.error('      - Tạo API key MỚI trong project có billing Pro');
            console.error('      - Copy API key');
            console.error('');
            console.error('   2. CẬP NHẬT API KEY:');
            console.error('      - Chạy: npm run update-api');
            console.error('      - Paste API key Pro vừa tạo');
            console.error('      - Restart server: npm start');
            console.error('');
            console.error('   3. TẠM THỜI: TẮT AI để dùng database only:');
            console.error('      - Sửa file .env: USE_AI=false');
            console.error('      - Restart server');
            console.error('');
         } else {
            console.error('📊 API Info:');
            console.error(`   • Current model: ${getCachedModelName() || 'unknown'}`);
            console.error(`   • Retry after: ${error.retryDelay || 'unknown'}`);
            console.error('');
            console.error('✅ KHUYẾN NGHỊ:');
            console.error('   • Đợi vài phút rồi thử lại');
            console.error('   • Hoặc chuyển sang model khác (gemini-1.5-flash)');
            console.error('   • Hoặc nâng cấp lên tài khoản Pro');
         }
         
         console.error('╚══════════════════════════════════════════════════════════╝\n');
         
         // Try to switch to a more available model
         const switched = await handleQuotaExceeded();
         if (switched) {
            console.log('🔄 Model switched, but still returning null to use database fallback');
         }
         
         return null;
      }
      
      // If 404, try REST fallback to list available models and log them for debugging
      if (error && error.status === 404) {
         try {
            const models = await listAvailableModels();
            console.error('Models available from REST listModels:', models);
         } catch (e) {
            console.error('Also failed to list models via REST:', e?.message || e);
         }
      }
      // Return null to indicate AI generation failed so callers can fallback to DB answers
      return null;
   }
}

function getCachedModelName() {
   return cachedModelName;
}

function setCachedModelName(name) {
   cachedModelName = name;
}

// Function to handle quota exceeded by switching to a more available model
async function handleQuotaExceeded() {
   const currentModel = getCachedModelName();
   console.log(`🔄 Quota exceeded for model: ${currentModel}`);
   
   // Try to switch to gemini-2.0-flash (more available than 2.5-pro)
   if (currentModel !== 'models/gemini-2.0-flash') {
      console.log('🔄 Attempting to switch to gemini-2.0-flash...');
      try {
         setCachedModelName('models/gemini-2.0-flash');
         console.log('✅ Switched to gemini-2.0-flash');
         
         // Save to database so it persists after restart
         try {
            const Config = require('./models/Config');
            await Config.findOneAndUpdate(
               {}, 
               { genaiModel: 'models/gemini-2.0-flash' }, 
               { upsert: true }
            );
            console.log('💾 Model switch saved to database');
            
            // Also update the global genaiModel variable if available
            if (typeof global !== 'undefined' && global.genaiModel !== undefined) {
               global.genaiModel = 'models/gemini-2.0-flash';
               console.log('🔄 Updated global genaiModel variable');
            }
         } catch (dbError) {
            console.error('⚠️ Failed to save model switch to database:', dbError.message);
         }
         
         return true;
      } catch (e) {
         console.error('❌ Failed to switch model:', e.message);
      }
   }
   
   return false;
}

module.exports = {
   normalizeTextGemini,
   getFinalAIResponse,
   classifyQuestion,
   getCachedModelName,
   setCachedModelName,
   initGenAI,
   probeCandidateModels,
   setApiKey,
   getApiKeyMasked,
   getApiKey,
   handleQuotaExceeded,
   isGeminiInitialized,
   getGeminiStatus
};

// List models via REST fallback (uses API key query param). Returns array of model names or throws.
async function listAvailableModels() {
   const key = getApiKey();
   if (!key) throw new Error('No GEMINI_API_KEY configured');
   
   // try v1 then v1beta
   const urls = [
      `https://generativelanguage.googleapis.com/v1/models?key=${key}`,
      `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`
   ];
   for (const url of urls) {
      try {
         const r = await axios.get(url, { timeout: 10000 });
         const models = r.data && (r.data.models || r.data.model || r.data);
         if (Array.isArray(models) && models.length > 0) {
            const modelNames = models.map(m => m.name || m.model || m.id || m);
            console.log(`✅ Tìm thấy ${modelNames.length} model khả dụng`);
            return modelNames;
         }
      } catch (e) {
         // Silent retry
         var lastErr = e;
      }
   }
   throw new Error('Failed to list models via REST' + (lastErr ? (': ' + (lastErr.message || String(lastErr))) : '')); 
}

// append export
module.exports.listAvailableModels = listAvailableModels;