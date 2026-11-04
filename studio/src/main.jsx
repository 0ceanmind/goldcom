import { createRoot } from 'react-dom/client';
import './fonts.js';
import './styles.css';
import './studio.css';
import './refinements.css';
import './motion.css';
import App from './App.jsx';
import { StudioProvider } from './components/StudioContext.jsx';
import { GoldcomDialogProvider } from './components/GoldcomDialogs.jsx';
import GoldcomTooltips from './components/GoldcomTooltips.jsx';
import { StudioMotionProvider } from './components/StudioMotion.jsx';

createRoot(document.getElementById('root')).render(<StudioProvider><StudioMotionProvider><GoldcomDialogProvider><App /><GoldcomTooltips /></GoldcomDialogProvider></StudioMotionProvider></StudioProvider>);
