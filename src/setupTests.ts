// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// React Router requires these browser globals in the older Jest environment.
import { TextEncoder, TextDecoder } from 'util';
Object.assign(globalThis, { TextEncoder, TextDecoder });

// WebGL rendering is exercised in the Workbench browser suite. jsdom has no worker blob URLs.
jest.mock('maplibre-gl', () => ({ Map: jest.fn() }));
