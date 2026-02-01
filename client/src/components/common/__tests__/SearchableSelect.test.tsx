import { render, screen, fireEvent } from '@testing-library/react';
import SearchableSelect from '../SearchableSelect';

const options = [
  { value: '1', label: 'Alpha', group: 'Group A' },
  { value: '2', label: 'Beta', group: 'Group A' },
  { value: '3', label: 'Gamma', group: 'Group B' },
];

describe('SearchableSelect', () => {
  it('renders with placeholder', () => {
    render(<SearchableSelect options={options} value="" onChange={jest.fn()} placeholder="Pick one" />);
    expect(screen.getByText('Pick one')).toBeInTheDocument();
  });

  it('renders selected value label', () => {
    render(<SearchableSelect options={options} value="2" onChange={jest.fn()} />);
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('opens dropdown on click and shows options', () => {
    render(<SearchableSelect options={options} value="" onChange={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /select/i }));
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Gamma')).toBeInTheDocument();
  });

  it('filters options as user types', () => {
    render(<SearchableSelect options={options} value="" onChange={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /select/i }));
    fireEvent.change(screen.getByPlaceholderText('Search...'), { target: { value: 'gam' } });
    expect(screen.getByText('Gamma')).toBeInTheDocument();
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
  });

  it('calls onChange when option selected', () => {
    const onChange = jest.fn();
    render(<SearchableSelect options={options} value="" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /select/i }));
    fireEvent.click(screen.getByText('Beta'));
    expect(onChange).toHaveBeenCalledWith('2');
  });

  it('shows no matches message when search has no results', () => {
    render(<SearchableSelect options={options} value="" onChange={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /select/i }));
    fireEvent.change(screen.getByPlaceholderText('Search...'), { target: { value: 'zzz' } });
    expect(screen.getByText('No matches found')).toBeInTheDocument();
  });

  it('shows clear button when value is selected', () => {
    const onChange = jest.fn();
    render(<SearchableSelect options={options} value="1" onChange={onChange} />);
    // Open dropdown by clicking the trigger button (which shows "Alpha" as selected)
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    fireEvent.click(screen.getByText('Clear selection'));
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('renders with label', () => {
    render(<SearchableSelect options={options} value="" onChange={jest.fn()} label="My Label" />);
    expect(screen.getByText('My Label')).toBeInTheDocument();
  });
});
