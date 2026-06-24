import morgan from 'morgan';

// Format: method url status response-time ms - res[content-length]
export const requestLogger = morgan(':method :url :status :response-time ms - :res[content-length]');
