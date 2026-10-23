import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import './account.css';
import './responsive.css';
import './fullscreen.css';
import './board.css';
import './theme.css';
import { installBackgrounds } from './backgrounds';

installBackgrounds();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);