const mongoose = require('mongoose');

const pendingQuestionSchema = new mongoose.Schema({
  question: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('PendingQuestion', pendingQuestionSchema); 
