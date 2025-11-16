const express = require('express');
const User = require('../models/User');
const Product = require('../models/Product');
const Review = require('../models/Review');
const auth = require('../middleware/auth');
const mongoose = require('mongoose');

const router = express.Router();

// Get user profile
router.get('/:id', async (req, res) => {
    try {
        // Validate if ID is a valid MongoDB ObjectId
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid user ID format'
            });
        }

        const user = await User.findById(req.params.id).select('-password');
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            user
        });

    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching user'
        });
    }
});

// Get current user's profile (using auth middleware)
router.get('/profile/me', auth, async (req, res) => {
    try {
        const user = await User.findById(req.userId).select('-password');
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        res.json({
            success: true,
            user
        });
    } catch (error) {
        console.error('Get current user error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching profile'
        });
    }
});

// Get current user's products - FIXED VERSION
router.get('/profile/products', auth, async (req, res) => {
    try {
        console.log('🔄 Fetching products for user:', req.userId);
        
        const { status, page = 1, limit = 10 } = req.query;
        const skip = (page - 1) * limit;

        // Validate user ID from auth middleware
        if (!req.userId || !mongoose.Types.ObjectId.isValid(req.userId)) {
            console.error('❌ Invalid user ID from auth:', req.userId);
            return res.status(400).json({
                success: false,
                message: 'Invalid user ID in authentication'
            });
        }

        let query = { seller: req.userId };
        if (status) query.status = status;

        console.log('📦 Querying products with:', query);

        const products = await Product.find(query)
            .populate('seller', 'name rating college phone')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Product.countDocuments(query);

        console.log(`✅ Found ${products.length} products for user ${req.userId}`);

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
        console.error('❌ Get current user products error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching user products'
        });
    }
});

// Get user's products by ID
router.get('/:id/products', async (req, res) => {
    try {
        const { status, page = 1, limit = 10 } = req.query;
        const skip = (page - 1) * limit;

        // Validate user ID
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid user ID format'
            });
        }

        let query = { seller: req.params.id };
        if (status) query.status = status;

        const products = await Product.find(query)
            .populate('seller', 'name rating college phone')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Product.countDocuments(query);

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
        console.error('Get user products error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching user products'
        });
    }
});

// Get user's reviews
router.get('/:id/reviews', async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const skip = (page - 1) * limit;

        // Validate user ID
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid user ID format'
            });
        }

        const reviews = await Review.find({ seller: req.params.id })
            .populate('reviewer', 'name')
            .populate('product', 'title')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Review.countDocuments({ seller: req.params.id });

        res.json({
            success: true,
            reviews,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('Get user reviews error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching user reviews'
        });
    }
});

// Update user profile
router.put('/profile', auth, async (req, res) => {
    try {
        const { name, college, avatar, phone } = req.body;
        const updates = {};

        if (name) updates.name = name;
        if (college) updates.college = college;
        if (avatar) updates.avatar = avatar;
        if (phone) updates.phone = phone;

        const user = await User.findByIdAndUpdate(
            req.userId,
            updates,
            { new: true, runValidators: true }
        ).select('-password');

        res.json({
            success: true,
            message: 'Profile updated successfully',
            user
        });

    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while updating profile'
        });
    }
});

module.exports = router;