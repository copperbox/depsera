import { render, screen, fireEvent } from '@testing-library/react';
import SchemaConfigEditor from './SchemaConfigEditor';
import type { SchemaMapping } from '../../../types/service';

describe('SchemaConfigEditor', () => {
  const defaultProps = {
    value: null,
    onChange: jest.fn(),
    healthEndpoint: 'https://example.com/health',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders in default mode when value is null', () => {
    render(<SchemaConfigEditor {...defaultProps} />);
    expect(screen.getByText('proactive-deps (default)')).toBeInTheDocument();
    expect(screen.getByText('Custom schema')).toBeInTheDocument();
  });

  it('shows guided form fields when custom mode is selected', () => {
    render(<SchemaConfigEditor {...defaultProps} />);
    fireEvent.click(screen.getByText('Custom schema'));

    expect(screen.getByLabelText(/Path to dependencies/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Healthy field/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Latency field/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Impact field/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Type field/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Check details field/)).toBeInTheDocument();
  });

  it('renders type field input that updates state', () => {
    const onChange = jest.fn();
    render(<SchemaConfigEditor {...defaultProps} onChange={onChange} />);
    fireEvent.click(screen.getByText('Custom schema'));

    const typeInput = screen.getByLabelText(/Type field/);
    expect(typeInput).toHaveValue('');

    // Fill required fields first to trigger onChange
    fireEvent.change(screen.getByLabelText(/Path to dependencies/), { target: { value: 'checks' } });
    fireEvent.change(screen.getByLabelText(/Name field/), { target: { value: 'name' } });
    fireEvent.change(screen.getByLabelText(/Healthy field/), { target: { value: 'ok' } });

    fireEvent.change(typeInput, { target: { value: 'category' } });

    expect(typeInput).toHaveValue('category');
    // onChange should have been called with a mapping that includes type
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0] as SchemaMapping;
    expect(lastCall.fields.type).toBe('category');
  });

  it('populates type field from existing schema value', () => {
    const schema: SchemaMapping = {
      root: 'checks',
      fields: {
        name: 'name',
        healthy: 'ok',
        type: 'depType',
      },
    };

    render(<SchemaConfigEditor {...defaultProps} value={schema} />);

    const typeInput = screen.getByLabelText(/Type field/);
    expect(typeInput).toHaveValue('depType');
  });

  it('does not include type in schema when type field is empty', () => {
    const onChange = jest.fn();
    render(<SchemaConfigEditor {...defaultProps} onChange={onChange} />);
    fireEvent.click(screen.getByText('Custom schema'));

    fireEvent.change(screen.getByLabelText(/Path to dependencies/), { target: { value: 'checks' } });
    fireEvent.change(screen.getByLabelText(/Name field/), { target: { value: 'name' } });
    fireEvent.change(screen.getByLabelText(/Healthy field/), { target: { value: 'ok' } });

    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0] as SchemaMapping;
    expect(lastCall.fields.type).toBeUndefined();
  });
});
