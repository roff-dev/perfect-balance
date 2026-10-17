import { mount } from 'svelte';
import '@fontsource-variable/fraunces/soft.css';
import '@fontsource-variable/instrument-sans';
import './styles/tokens.css';
import './styles/base.css';
import App from './App.svelte';

mount(App, { target: document.getElementById('app')! });
