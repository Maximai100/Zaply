import React from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import './index.css';
import App from './App.jsx';
import PublicPage from './pages/PublicPage.jsx';
import Setup from './pages/Setup.jsx';

const router = createBrowserRouter([
  { path: '/', element: <App /> },
  { path: '/u/:slug', element: <PublicPage /> },
  { path: '/setup', element: <Setup /> },
]);

createRoot(document.getElementById('root')).render(<RouterProvider router={router} />);


