const multer = require('multer');

// Configure multer for memory storage
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  // Check file type
  if (file.mimetype.startsWith('image/') || 
      file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only images and PDFs are allowed.'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  }
});

// Specific upload configurations
exports.uploadSingle = (fieldName) => upload.single(fieldName);
exports.uploadMultiple = (fieldName, maxCount) => upload.array(fieldName, maxCount);
exports.uploadFields = (fields) => upload.fields(fields);

// Error handling middleware for multer
exports.handleUploadError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size is 5MB.'
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files.'
      });
    }
  }
  
  if (error) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
  
  next();
};