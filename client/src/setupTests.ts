import '@testing-library/jest-dom';

// Set CSRF cookie for all tests (simulates real browser behavior)
document.cookie = 'csrf-token=test-csrf-token';
