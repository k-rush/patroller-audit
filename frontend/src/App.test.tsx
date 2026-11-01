import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import App from './App';

test('renders the feature-free application shell', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: 'Patroller Audit' })).toBeInTheDocument();
  expect(screen.getByText(/Patrol features have not been added yet/)).toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
