import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from './contexts/ThemeContext';
import { ServicesProvider } from './contexts/ServicesContext';
import { App } from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <ServicesProvider>
        <App />
      </ServicesProvider>
    </ThemeProvider>
  </StrictMode>
);
