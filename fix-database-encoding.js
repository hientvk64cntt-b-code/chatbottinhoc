const mongoose = require('mongoose');
require('dotenv').config();
const Question = require('./models/Question');

// Function to remove Vietnamese diacritics for better search
function removeVietnameseDiacritics(str) {
  if (!str) return '';
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

async function fixDatabaseEncoding() {
  try {
    // Kết nối MongoDB
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/chatbot';
    console.log('🔄 Đang kết nối MongoDB...');
    await mongoose.connect(uri);
    console.log('✅ Đã kết nối MongoDB');

    // Lấy tất cả câu hỏi
    const questions = await Question.find();
    console.log(`📊 Tìm thấy ${questions.length} câu hỏi`);

    let fixedCount = 0;
    let skippedCount = 0;

    for (let q of questions) {
      let needsUpdate = false;

      // Fix và tạo normalized fields cho question
      if (!q.question_normalized || q.question_normalized !== removeVietnameseDiacritics(q.question)) {
        q.question_normalized = removeVietnameseDiacritics(q.question);
        needsUpdate = true;
      }

      // Fix và tạo normalized fields cho answers
      if (q.answers && Array.isArray(q.answers) && q.answers.length > 0) {
        const answers_normalized = q.answers.map(a => removeVietnameseDiacritics(a));
        if (!q.answers_normalized || JSON.stringify(q.answers_normalized) !== JSON.stringify(answers_normalized)) {
          q.answers_normalized = answers_normalized;
          needsUpdate = true;
        }
      }

      // Save nếu có thay đổi
      if (needsUpdate) {
        await q.save();
        fixedCount++;
        if (fixedCount % 100 === 0) {
          console.log(`✅ Đã sửa ${fixedCount} câu hỏi...`);
        }
      } else {
        skippedCount++;
      }
    }

    console.log(`\n🎉 Hoàn thành!`);
    console.log(`✅ Đã sửa: ${fixedCount} câu hỏi`);
    console.log(`⏭️  Bỏ qua: ${skippedCount} câu hỏi (đã có normalized)`);
    console.log(`📊 Tổng cộng: ${questions.length} câu hỏi`);

    // Tạo text index
    console.log('\n🔄 Đang tạo text index...');
    try {
      await Question.collection.dropIndex('question_text_index_v2').catch(() => {});
      await Question.collection.dropIndex('question_text_index_v3').catch(() => {});
    } catch (e) {
      console.log('⚠️ Không cần drop index cũ');
    }

    await Question.collection.createIndex({ 
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
    console.log('✅ Đã tạo text index mới');

    process.exit(0);
  } catch (error) {
    console.error('❌ Lỗi:', error);
    process.exit(1);
  }
}

fixDatabaseEncoding();


