// Global Error Handling Middleware
export const errorHandler = (err, req, res, next) => {
  console.error('\x1b[31m%s\x1b[0m', `[Error] ${err.message}`);
  if (err.stack) {
    console.error(err.stack);
  }

  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    error: {
      message: err.message || 'Internal Server Error',
      status: statusCode,
      details: err.details || null
    }
  });
};

// Page Not Found (404) Middleware
export const notFoundHandler = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};
