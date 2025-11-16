const express = require('express');
const { body, validationResult } = require('express-validator');
const Product = require('../models/Product');
const auth = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'product-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'), false);
        }
    }
});

// Get all products with filters
router.get('/', async (req, res) => {
    try {
        const {
            category,
            minPrice,
            maxPrice,
            search,
            page = 1,
            limit = 12,
            sort = 'createdAt'
        } = req.query;

        console.log('📦 Fetching products with filters:', {
            category, minPrice, maxPrice, search, page, limit, sort
        });

        let query = { status: 'active' };

        // Apply filters
        if (category) query.category = category;
        if (minPrice || maxPrice) {
            query.price = {};
            if (minPrice) query.price.$gte = parseFloat(minPrice);
            if (maxPrice) query.price.$lte = parseFloat(maxPrice);
        }

        // Text search
        if (search) {
            query.$text = { $search: search };
        }

        const skip = (page - 1) * limit;

        const products = await Product.find(query)
            .populate('seller', 'name rating college phone')
            .sort({ [sort]: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Product.countDocuments(query);

        console.log(`✅ Found ${products.length} products`);

        res.json({
            success: true,
            products,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('❌ Get products error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching products'
        });
    }
});

// Get single product
router.get('/:id', async (req, res) => {
    try {
        const product = await Product.findById(req.params.id)
            .populate('seller', 'name rating college phone');

        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        // Increment view count
        product.views += 1;
        await product.save();

        res.json({
            success: true,
            product
        });

    } catch (error) {
        console.error('Get product error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching product'
        });
    }
});

// Create product
// Create product - FIXED VERSION
router.post('/', [
  auth,
  upload.array('images', 5),
  body('title').trim().isLength({ min: 5 }).withMessage('Title must be at least 5 characters'),
  body('description').trim().isLength({ min: 10 }).withMessage('Description must be at least 10 characters'),
  body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('category').isIn(['books', 'electronics', 'cycles', 'hostel-needs', 'accessories', 'other']).withMessage('Invalid category'),
  body('meetupLocation').isIn(['canteen', 'library', 'main-gate', 'hostel', 'other']).withMessage('Invalid meetup location')
], async (req, res) => {
  let uploadedFiles = []; // Track uploaded files for cleanup
  
  try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
          // Delete uploaded files if validation fails
          if (req.files && req.files.length > 0) {
              req.files.forEach(file => {
                  fs.unlinkSync(file.path);
              });
          }
          return res.status(400).json({ 
              success: false, 
              message: 'Validation failed', 
              errors: errors.array() 
          });
      }

      const { title, description, price, category, meetupLocation, condition } = req.body;

      console.log('🆕 Creating product:', { title, price, category });

      // Get image paths
      const images = req.files ? req.files.map(file => {
          uploadedFiles.push(file.path); // Track for cleanup
          return file.filename;
      }) : [];

      const product = new Product({
          title,
          description,
          price: parseFloat(price),
          category,
          meetupLocation,
          condition: condition || 'good',
          images,
          seller: req.userId
      });

      await product.save();
      await product.populate('seller', 'name rating college phone');

      console.log('✅ Product created successfully:', product._id);

      // 🔔 EMIT REAL-TIME NOTIFICATION - Wrap in try-catch to prevent breaking the response
      try {
          const io = req.app.get('io');
          if (io) {
              // Notify all users in the same college
              const collegeRoom = `college-${product.seller.college.replace(/\s+/g, '-').toLowerCase()}`;
              io.to(collegeRoom).emit('new-product', {
                  type: 'NEW_PRODUCT',
                  message: `New product listed: ${product.title}`,
                  product: {
                      id: product._id,
                      title: product.title,
                      price: product.price,
                      category: product.category,
                      seller: product.seller.name,
                      college: product.seller.college,
                      image: product.images[0] || null
                  },
                  timestamp: new Date()
              });
              
              console.log(`🔔 Notification sent to college room: ${collegeRoom}`);
          }
      } catch (notificationError) {
          console.error('❌ Notification error (non-fatal):', notificationError);
          // Don't throw error, just log it
      }

      // Send success response ONLY ONCE
      res.status(201).json({
          success: true,
          message: 'Product created successfully',
          product
      });

  } catch (error) {
      console.error('❌ Create product error:', error);
      
      // Clean up uploaded files if error occurs
      if (uploadedFiles.length > 0) {
          uploadedFiles.forEach(filePath => {
              try {
                  if (fs.existsSync(filePath)) {
                      fs.unlinkSync(filePath);
                  }
              } catch (cleanupError) {
                  console.error('❌ File cleanup error:', cleanupError);
              }
          });
      }
      
      // Check if headers have already been sent
      if (res.headersSent) {
          console.error('❌ Headers already sent, cannot send error response');
          return;
      }
      
      // Send error response ONLY if headers haven't been sent
      res.status(500).json({
          success: false,
          message: 'Server error while creating product'
      });
  }
});
// Update product
router.put('/:id', [
    auth,
    body('title').optional().trim().isLength({ min: 5 }).withMessage('Title must be at least 5 characters'),
    body('description').optional().trim().isLength({ min: 10 }).withMessage('Description must be at least 10 characters'),
    body('price').optional().isFloat({ min: 0 }).withMessage('Price must be a positive number')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                success: false, 
                message: 'Validation failed', 
                errors: errors.array() 
            });
        }

        const product = await Product.findById(req.params.id);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        // Check if user owns the product
        if (product.seller.toString() !== req.userId) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to update this product'
            });
        }

        const updates = req.body;
        Object.keys(updates).forEach(key => {
            product[key] = updates[key];
        });

        await product.save();
        await product.populate('seller', 'name rating');

        res.json({
            success: true,
            message: 'Product updated successfully',
            product
        });

    } catch (error) {
        console.error('Update product error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while updating product'
        });
    }
});

// Mark product as sold
router.patch('/:id/sold', auth, async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        // Check if user owns the product
        if (product.seller.toString() !== req.userId) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to update this product'
            });
        }

        product.status = 'sold';
        await product.save();

        res.json({
            success: true,
            message: 'Product marked as sold'
        });

    } catch (error) {
        console.error('Mark sold error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while updating product'
        });
    }
});

// Delete product
router.delete('/:id', auth, async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        // Check if user owns the product
        if (product.seller.toString() !== req.userId) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to delete this product'
            });
        }

        await Product.findByIdAndDelete(req.params.id);

        res.json({
            success: true,
            message: 'Product deleted successfully'
        });

    } catch (error) {
        console.error('Delete product error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while deleting product'
        });
    }
});

module.exports = router;