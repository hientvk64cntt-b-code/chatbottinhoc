const mongoose = require('mongoose');
const express = require('express');
const app = express();

const questionSchema = new mongoose.Schema({
  question: { type: String, required: true, unique: true },
  answers: { type: [String], required: true }, // Changed from 'answer' to 'answers' as an array
  question_normalized: { type: String }, // For search without diacritics
  answers_normalized: { type: [String] }, // For search without diacritics
  source: { 
    type: String, 
    enum: ['admin', 'database', 'ai_generated', 'ai_improved', 'import'],
    default: 'database' 
  } // Nguồn gốc: admin (thủ công), database (cũ), ai_generated (AI tạo mới), ai_improved (AI cải thiện), import (từ Excel)
}, { timestamps: true });

const Question = mongoose.model('Question', questionSchema);

app.post('/admin/add', async (req, res) => {
  const { question, answer } = req.body;
  if (!question || !answer) {
    // Có thể render lại trang với thông báo lỗi hoặc redirect kèm thông báo
    return res.redirect('/admin?tab=pending&error=missing');
  }
  await Question.create({ question, answer });
  try {
    await require('./models/PendingQuestion').findOneAndDelete({ question });
  } catch (e) {}
  res.redirect('/admin');
});

module.exports = Question;