const mongoose = require('mongoose');

const verificationSchema = new mongoose.Schema({
  address: {
    type: String,
    required: true,
    lowercase: true,
  },
  verificationAmount: {
    type: Number,
    required: true,
  },
  verificationStartTime: {
    type: Date,
    default: Date.now,
  },
  verified: {
    type: Boolean,
    default: false,
  },
  hasNFT: {
    type: Boolean,
    default: false,
  },
  verificationStatus: {
    type: String,
    enum: ['pending', 'verified', 'failed', 'expired'],
    default: 'pending',
  },
});

const userSchema = new mongoose.Schema({
  discordId: {
    type: String,
    required: true,
    unique: true,
  },
  wallets: [verificationSchema],
}, {
  timestamps: true,
});

module.exports = mongoose.model('User', userSchema); 