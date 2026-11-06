import { render, screen } from '@testing-library/react';
import type { SearchProductsOutput } from '@shopping-copilot/shared';

import type { ShoppingMessage } from '../../lib/types';
import { MessageView } from './MessageView';
import { describeQuery } from '../ProductResults';

const output: SearchProductsOutput = {
  totalMatches: 23,
  products: [
    { id: 1, title: 'iPhone 6', description: 'A phone', price: 299.99, discountPercentage: 10, rating: 4.2, category: 'smartphones', thumbnail: 'https://img/1.png', brand: 'Apple' },
    { id: 2, title: 'Realme C35', description: 'Budget phone', price: 149.99, category: 'smartphones', thumbnail: 'https://img/2.png', stock: 0 },
  ],
};

const assistant = (parts: ShoppingMessage['parts']): ShoppingMessage => ({ id: 'a1', role: 'assistant', parts });

describe('MessageView', () => {
  it('renders a searchProducts tool result as product cards (not text)', () => {
    render(
      <MessageView
        message={assistant([
          { type: 'tool-searchProducts', toolCallId: 't1', state: 'output-available', input: { keywords: ['phone'], maxPrice: 300 }, output },
          { type: 'text', text: 'The **Realme C35** is the cheapest.' },
        ])}
      />,
    );
    const cards = screen.getAllByTestId('product-card');
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent('iPhone 6');
    expect(cards[0]).toHaveTextContent('$299.99');
    expect(screen.getByAltText('Realme C35')).toHaveAttribute('src', 'https://img/2.png');
    expect(screen.getByText('Out of stock')).toBeInTheDocument();
    expect(screen.getByText('2 of 23')).toBeInTheDocument();
    expect(screen.getByText('Realme C35', { selector: 'strong' })).toBeInTheDocument();
  });

  it('shows a loading skeleton while the tool is running', () => {
    render(<MessageView message={assistant([{ type: 'tool-searchProducts', toolCallId: 't1', state: 'input-available', input: { keywords: ['laptop'] } }])} />);
    expect(screen.getByText(/Searching laptop/)).toBeInTheDocument();
    expect(screen.queryByTestId('product-card')).toBeNull();
  });

  it('shows the catalog error returned by the tool', () => {
    render(
      <MessageView
        message={assistant([
          { type: 'tool-searchProducts', toolCallId: 't1', state: 'output-available', input: {}, output: { products: [], totalMatches: 0, error: 'Catalog unavailable' } },
        ])}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Catalog unavailable');
  });

  it('renders user text as plain text (no markdown/HTML interpretation)', () => {
    render(<MessageView message={{ id: 'u1', role: 'user', parts: [{ type: 'text', text: '<b>hi</b> **x**' }] }} />);
    expect(screen.getByText('<b>hi</b> **x**')).toBeInTheDocument();
  });
});

describe('describeQuery', () => {
  it('summarizes how the agent interpreted the request', () => {
    expect(describeQuery({ keywords: ['phone'], category: 'smartphones', maxPrice: 300, sortBy: 'price_asc' })).toBe(
      'phone · smartphones · under $300.00 · cheapest first',
    );
  });
  it('hides 0/null price bounds (they mean "no limit")', () => {
    expect(describeQuery({ keywords: ['watch'], minPrice: 0, maxPrice: null })).toBe('watch');
  });
});
