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
    expect(screen.getByLabelText(/Contact field/)).toBeInTheDocument();
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

  it('renders contact field input that updates state', () => {
    const onChange = jest.fn();
    render(<SchemaConfigEditor {...defaultProps} onChange={onChange} />);
    fireEvent.click(screen.getByText('Custom schema'));

    const contactInput = screen.getByLabelText(/Contact field/);
    expect(contactInput).toHaveValue('');

    // Fill required fields first to trigger onChange
    fireEvent.change(screen.getByLabelText(/Path to dependencies/), { target: { value: 'checks' } });
    fireEvent.change(screen.getByLabelText(/Name field/), { target: { value: 'name' } });
    fireEvent.change(screen.getByLabelText(/Healthy field/), { target: { value: 'ok' } });

    fireEvent.change(contactInput, { target: { value: 'metadata.contact_info' } });

    expect(contactInput).toHaveValue('metadata.contact_info');
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0] as SchemaMapping;
    expect(lastCall.fields.contact).toBe('metadata.contact_info');
  });

  it('populates contact field from existing schema value', () => {
    const schema: SchemaMapping = {
      root: 'checks',
      fields: {
        name: 'name',
        healthy: 'ok',
        contact: 'owner_info',
      },
    };

    render(<SchemaConfigEditor {...defaultProps} value={schema} />);

    const contactInput = screen.getByLabelText(/Contact field/);
    expect(contactInput).toHaveValue('owner_info');
  });

  it('does not include contact in schema when contact field is empty', () => {
    const onChange = jest.fn();
    render(<SchemaConfigEditor {...defaultProps} onChange={onChange} />);
    fireEvent.click(screen.getByText('Custom schema'));

    fireEvent.change(screen.getByLabelText(/Path to dependencies/), { target: { value: 'checks' } });
    fireEvent.change(screen.getByLabelText(/Name field/), { target: { value: 'name' } });
    fireEvent.change(screen.getByLabelText(/Healthy field/), { target: { value: 'ok' } });

    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0] as SchemaMapping;
    expect(lastCall.fields.contact).toBeUndefined();
  });

  it('shows error and error message fields in custom mode', () => {
    render(<SchemaConfigEditor {...defaultProps} />);
    fireEvent.click(screen.getByText('Custom schema'));

    expect(screen.getByLabelText(/Error field/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Error message field/)).toBeInTheDocument();
  });

  it('renders error field input that updates state', () => {
    const onChange = jest.fn();
    render(<SchemaConfigEditor {...defaultProps} onChange={onChange} />);
    fireEvent.click(screen.getByText('Custom schema'));

    const errorInput = screen.getByLabelText(/Error field/);
    expect(errorInput).toHaveValue('');

    fireEvent.change(screen.getByLabelText(/Path to dependencies/), { target: { value: 'checks' } });
    fireEvent.change(screen.getByLabelText(/Name field/), { target: { value: 'name' } });
    fireEvent.change(screen.getByLabelText(/Healthy field/), { target: { value: 'ok' } });

    fireEvent.change(errorInput, { target: { value: 'err' } });

    expect(errorInput).toHaveValue('err');
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0] as SchemaMapping;
    expect(lastCall.fields.error).toBe('err');
  });

  it('renders error message field input that updates state', () => {
    const onChange = jest.fn();
    render(<SchemaConfigEditor {...defaultProps} onChange={onChange} />);
    fireEvent.click(screen.getByText('Custom schema'));

    const errorMsgInput = screen.getByLabelText(/Error message field/);
    expect(errorMsgInput).toHaveValue('');

    fireEvent.change(screen.getByLabelText(/Path to dependencies/), { target: { value: 'checks' } });
    fireEvent.change(screen.getByLabelText(/Name field/), { target: { value: 'name' } });
    fireEvent.change(screen.getByLabelText(/Healthy field/), { target: { value: 'ok' } });

    fireEvent.change(errorMsgInput, { target: { value: 'failureReason' } });

    expect(errorMsgInput).toHaveValue('failureReason');
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0] as SchemaMapping;
    expect(lastCall.fields.errorMessage).toBe('failureReason');
  });

  it('populates error fields from existing schema value', () => {
    const schema: SchemaMapping = {
      root: 'checks',
      fields: {
        name: 'name',
        healthy: 'ok',
        error: 'err',
        errorMessage: 'errMsg',
      },
    };

    render(<SchemaConfigEditor {...defaultProps} value={schema} />);

    expect(screen.getByLabelText(/Error field/)).toHaveValue('err');
    expect(screen.getByLabelText(/Error message field/)).toHaveValue('errMsg');
  });

  it('does not include error fields in schema when empty', () => {
    const onChange = jest.fn();
    render(<SchemaConfigEditor {...defaultProps} onChange={onChange} />);
    fireEvent.click(screen.getByText('Custom schema'));

    fireEvent.change(screen.getByLabelText(/Path to dependencies/), { target: { value: 'checks' } });
    fireEvent.change(screen.getByLabelText(/Name field/), { target: { value: 'name' } });
    fireEvent.change(screen.getByLabelText(/Healthy field/), { target: { value: 'ok' } });

    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0] as SchemaMapping;
    expect(lastCall.fields.error).toBeUndefined();
    expect(lastCall.fields.errorMessage).toBeUndefined();
  });
});
