const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  category: {
    type: String,
    required: true,
    enum: ['books', 'electronics', 'cycles', 'hostel-needs', 'accessories', 'other']
  },
  condition: {
    type: String,
    enum: ['new', 'like-new', 'good', 'fair', 'poor'],
    default: 'good'
  },
  images: [{
    type: String
  }],
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  meetupLocation: {
    type: String,
    required: true,
    enum: ['canteen', 'library', 'main-gate', 'hostel', 'other']
  },
  status: {
    type: String,
    enum: ['active', 'sold', 'expired'],
    default: 'active'
  },
  views: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Index for search functionality
productSchema.index({ 
  title: 'text', 
  description: 'text' 
});

// Index for filtering
productSchema.index({ category: 1, price: 1, status: 1 });

module.exports = mongoose.model('Product', productSchema);