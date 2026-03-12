import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

const RootContainer = () => {
  if (!GOOGLE_CLIENT_ID) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 bg-background">
        <div className="rounded-lg bg-destructive/10 p-6 text-center text-destructive border border-destructive/20 max-w-md">
          <h1 className="mb-2 text-xl font-bold">Configuration Error</h1>
          <p>The <code>VITE_GOOGLE_CLIENT_ID</code> environment variable is missing.</p>
          <p className="mt-4 text-sm text-muted-foreground italic">
            Please add your Google Client ID to the <code>.env</code> file in the frontend root directory.
          </p>
        </div>
      </div>
    );
  }

  return <App />;
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootContainer />
  </StrictMode>
);
