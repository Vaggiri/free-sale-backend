const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Enhanced CORS configuration for production
const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        
        const allowedOrigins = [
            'http://localhost:3000',
            'http://127.0.0.1:3000', 
            'http://localhost:5500',
            'http://127.0.0.1:5500',
            'http://localhost:8080',
            'http://127.0.0.1:8080',
            'https://your-frontend-domain.vercel.app', // Your frontend domain
            'https://free-sale-frontend.vercel.app',    // Example frontend
            'https://campus-trade-amrita.netlify.app/'
        ];
        
        if (allowedOrigins.indexOf(origin) !== -1 || origin.includes('vercel.app') || origin.includes('netlify.app')) {
            callback(null, true);
        } else {
            console.log('🚫 Blocked by CORS:', origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Handle preflight requests
app.options('*', cors(corsOptions));

// Security middleware
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false
}));

app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
    setHeaders: (res, path) => {
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    }
}));

app.get('/api/cors-test', (req, res) => {
  res.json({
      success: true,
      message: 'CORS is working!',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development'
  });
});

// File upload test endpoint
app.get('/api/uploads-test', (req, res) => {
  res.json({
      success: true,
      message: 'Uploads directory is accessible',
      uploadsPath: '/uploads/',
      exampleUrl: `${req.protocol}://${req.get('host')}/uploads/product-123456789.jpg`
  });
});

// Socket.io configuration
const io = socketIo(server, {
    cors: corsOptions
});

// Enhanced MongoDB connection
const connectDB = async () => {
    try {
        console.log('🔗 Attempting to connect to MongoDB...');
        
        const maskedURI = process.env.MONGODB_URI ? 
            process.env.MONGODB_URI.replace(/:(.*)@/, ':****@') : 'Not configured';
        console.log('📝 Connection string:', maskedURI);
        
        if (!process.env.MONGODB_URI) {
            throw new Error('MONGODB_URI is not defined in environment variables');
        }
        
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 10000, // Increased timeout for production
            socketTimeoutMS: 45000,
        });
        
        console.log('✅ Successfully connected to MongoDB Atlas');
        
    } catch (error) {
        console.error('❌ MongoDB connection failed:', error.message);
        // Don't exit in production, let the app continue
        console.log('🔄 App will continue without database connection');
    }
};

// Connect to database
connectDB();

// Import routes
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const userRoutes = require('./routes/users');

// Use routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/users', userRoutes);

// Basic health check route
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString(),
        cors: 'Enabled'
    });
});

// Root route
app.get('/', (req, res) => {
    res.json({
        message: '🚀 CampusTrade Backend API is running!',
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString(),
        endpoints: {
            auth: '/api/auth',
            products: '/api/products',
            users: '/api/users',
            health: '/api/health'
        }
    });
});

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('🔌 New client connected:', socket.id);
    
    socket.on('join-user', (userId) => {
        socket.join(`user-${userId}`);
        console.log(`👤 User ${userId} joined their room`);
    });
    
    socket.on('join-college', (collegeName) => {
        const roomName = `college-${collegeName.replace(/\s+/g, '-').toLowerCase()}`;
        socket.join(roomName);
        console.log(`🎓 User joined college room: ${roomName}`);
    });
    
    socket.on('disconnect', () => {
        console.log('🔌 Client disconnected:', socket.id);
    });
});

// Make io available to routes
app.set('io', io);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('❌ Error:', err.stack);
    
    // Handle CORS errors
    if (err.message === 'Not allowed by CORS') {
        return res.status(403).json({
            success: false,
            message: 'CORS policy: Origin not allowed'
        });
    }
    
    res.status(500).json({ 
        success: false,
        message: process.env.NODE_ENV === 'production' ? 'Something went wrong!' : err.message
    });
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
    res.status(404).json({ 
        success: false,
        message: 'API route not found' 
    });
});

// Add this to your server.js
const fs = require('fs');

app.get('/api/debug-uploads', (req, res) => {
    const uploadsPath = path.join(__dirname, 'uploads');
    
    try {
        const exists = fs.existsSync(uploadsPath);
        let files = [];
        let stats = {};
        
        if (exists) {
            files = fs.readdirSync(uploadsPath);
            stats = {
                path: uploadsPath,
                exists: true,
                fileCount: files.length,
                files: files.slice(0, 20), // Show first 20 files
                totalSize: files.reduce((total, file) => {
                    try {
                        const filePath = path.join(uploadsPath, file);
                        const stat = fs.statSync(filePath);
                        return total + stat.size;
                    } catch (e) {
                        return total;
                    }
                }, 0)
            };
        }
        
        res.json({
            success: true,
            uploads: stats,
            currentWorkingDir: process.cwd(),
            __dirname: __dirname
        });
    } catch (error) {
        res.json({
            success: false,
            error: error.message
        });
    }
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🌐 Health check: https://free-sale-backend.onrender.com/api/health`);
    console.log(`🔗 MongoDB: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'}`);
});