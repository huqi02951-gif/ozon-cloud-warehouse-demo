import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppShell } from './app/AppShell';
import { DemoProvider } from './state/DemoContext';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DemoProvider>
      <AppShell />
    </DemoProvider>
  </StrictMode>,
);
