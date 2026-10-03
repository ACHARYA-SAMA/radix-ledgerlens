/* Repository touch marker. */
import {createRoot} from 'react-dom/client';
import AuthGate from './auth/AuthGate.tsx';
import './index.css';
import './finance.css';
import { applyTheme, readTheme } from './lib/theme.ts';

applyTheme(readTheme());

createRoot(document.getElementById('root')!).render(<AuthGate />);
