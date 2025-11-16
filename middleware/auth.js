const jwt = require('jsonwebtoken');
const User = require('../models/User');
const mongoose = require('mongoose');

const auth = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'No token, authorization denied'
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
        
        // Verify the decoded userId is valid MongoDB ObjectId
        if (!decoded.userId || !mongoose.Types.ObjectId.isValid(decoded.userId)) {
            console.error('❌ Invalid user ID in token:', decoded.userId);
            return res.status(401).json({
                success: false,
                message: 'Invalid token payload'
            });
        }

        // Verify user exists in database
        const user = await User.findById(decoded.userId).select('-password');
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User not found'
            });
        }

        req.userId = decoded.userId;
        req.user = user;
        
        console.log('✅ Auth successful for user:', req.userId);
        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Invalid token'
            });
        } else if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token expired'
            });
        }
        
        res.status(401).json({
            success: false,
            message: 'Token is not valid'
        });
    }
};

module.exports = auth;