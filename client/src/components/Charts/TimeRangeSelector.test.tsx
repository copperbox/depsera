import { render, screen, fireEvent } from '@testing-library/react';
import { TimeRangeSelector } from './TimeRangeSelector';
import { ChartRange } from '../../types/chart';

const mockLocalStorage: Record<string, string> = {};

beforeEach(() => {
  Object.keys(mockLocalStorage).forEach((k) => delete mockLocalStorage[k]);
  jest.spyOn(Storage.prototype, 'getItem').mockImplementation(
    (key: string) => mockLocalStorage[key] ?? null
  );
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(
    (key: string, value: string) => { mockLocalStorage[key] = value; }
  );
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('TimeRangeSelector', () => {
  const ranges: ChartRange[] = ['1h', '6h', '24h', '7d', '30d'];

  it('renders all range buttons', () => {
    const onChange = jest.fn();
    render(
      <TimeRangeSelector ranges={ranges} defaultRange="24h" onChange={onChange} />
    );

    for (const range of ranges) {
      expect(screen.getByText(range)).toBeInTheDocument();
    }
  });

  it('marks default range as active', () => {
    const onChange = jest.fn();
    render(
      <TimeRangeSelector ranges={ranges} defaultRange="24h" onChange={onChange} />
    );

    const button = screen.getByText('24h');
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });

  it('calls onChange when a button is clicked', () => {
    const onChange = jest.fn();
    render(
      <TimeRangeSelector ranges={ranges} defaultRange="24h" onChange={onChange} />
    );

    fireEvent.click(screen.getByText('7d'));

    expect(onChange).toHaveBeenCalledWith('7d');
  });

  it('updates active state on click', () => {
    const onChange = jest.fn();
    render(
      <TimeRangeSelector ranges={ranges} defaultRange="24h" onChange={onChange} />
    );

    fireEvent.click(screen.getByText('1h'));

    expect(screen.getByText('1h').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('24h').getAttribute('aria-pressed')).toBe('false');
  });

  it('persists selection to localStorage when storageKey is provided', () => {
    const onChange = jest.fn();
    render(
      <TimeRangeSelector
        ranges={ranges}
        defaultRange="24h"
        storageKey="test-range"
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByText('7d'));

    expect(mockLocalStorage['test-range']).toBe('7d');
  });

  it('restores selection from localStorage', () => {
    mockLocalStorage['test-range'] = '6h';

    const onChange = jest.fn();
    render(
      <TimeRangeSelector
        ranges={ranges}
        defaultRange="24h"
        storageKey="test-range"
        onChange={onChange}
      />
    );

    expect(screen.getByText('6h').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('24h').getAttribute('aria-pressed')).toBe('false');
  });

  it('falls back to default when stored value is invalid', () => {
    mockLocalStorage['test-range'] = 'invalid';

    const onChange = jest.fn();
    render(
      <TimeRangeSelector
        ranges={ranges}
        defaultRange="24h"
        storageKey="test-range"
        onChange={onChange}
      />
    );

    expect(screen.getByText('24h').getAttribute('aria-pressed')).toBe('true');
  });

  it('calls onChange on mount with the initial range', () => {
    const onChange = jest.fn();
    render(
      <TimeRangeSelector ranges={ranges} defaultRange="24h" onChange={onChange} />
    );

    expect(onChange).toHaveBeenCalledWith('24h');
  });

  it('has accessible group role', () => {
    const onChange = jest.fn();
    render(
      <TimeRangeSelector ranges={ranges} defaultRange="24h" onChange={onChange} />
    );

    expect(screen.getByRole('group', { name: 'Time range selector' })).toBeInTheDocument();
  });

  it('handles localStorage errors gracefully on read', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('localStorage disabled');
    });

    const onChange = jest.fn();
    render(
      <TimeRangeSelector
        ranges={ranges}
        defaultRange="24h"
        storageKey="test-range"
        onChange={onChange}
      />
    );

    // Falls back to default
    expect(screen.getByText('24h').getAttribute('aria-pressed')).toBe('true');
  });

  it('handles localStorage errors gracefully on write', () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('localStorage full');
    });

    const onChange = jest.fn();
    render(
      <TimeRangeSelector
        ranges={ranges}
        defaultRange="24h"
        storageKey="test-range"
        onChange={onChange}
      />
    );

    // Should not throw
    fireEvent.click(screen.getByText('7d'));
    expect(onChange).toHaveBeenCalledWith('7d');
  });
});
