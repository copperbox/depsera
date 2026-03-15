import { render, screen, fireEvent } from '@testing-library/react';
import MetricSchemaConfigEditor from './MetricSchemaConfigEditor';
import type { MetricSchemaConfig } from '../../../types/service';

describe('MetricSchemaConfigEditor', () => {
  const defaultProps = {
    value: null,
    onChange: jest.fn(),
    format: 'prometheus' as const,
    disabled: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders section title and hints', () => {
    render(<MetricSchemaConfigEditor {...defaultProps} />);

    expect(screen.getByText('Metric Schema Configuration')).toBeInTheDocument();
    expect(screen.getByText('Metric Mappings')).toBeInTheDocument();
    expect(screen.getByText('Label Mappings')).toBeInTheDocument();
    expect(screen.getByText('Latency Unit')).toBeInTheDocument();
  });

  it('shows prometheus defaults in hints', () => {
    render(<MetricSchemaConfigEditor {...defaultProps} format="prometheus" />);

    expect(screen.getByText(/dependency_health_status/)).toBeInTheDocument();
    expect(screen.getByText(/dependency_health_healthy/)).toBeInTheDocument();
    expect(screen.getByText(/error_message.*errorMessage/)).toBeInTheDocument();
  });

  it('shows otlp defaults in hints', () => {
    render(<MetricSchemaConfigEditor {...defaultProps} format="otlp" />);

    expect(screen.getByText(/dependency\.health\.status/)).toBeInTheDocument();
    expect(screen.getByText(/dependency\.health\.healthy/)).toBeInTheDocument();
    expect(screen.getByText(/dependency\.error_message.*errorMessage/)).toBeInTheDocument();
  });

  it('renders add metric mapping button', () => {
    render(<MetricSchemaConfigEditor {...defaultProps} />);

    expect(screen.getByText('+ Add metric mapping')).toBeInTheDocument();
  });

  it('renders add label mapping button', () => {
    render(<MetricSchemaConfigEditor {...defaultProps} />);

    expect(screen.getByText('+ Add label mapping')).toBeInTheDocument();
  });

  it('adds a metric mapping row when add button is clicked', () => {
    render(<MetricSchemaConfigEditor {...defaultProps} />);

    fireEvent.click(screen.getByText('+ Add metric mapping'));

    expect(screen.getByLabelText('Metric name 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Metric target field 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Remove metric mapping 1')).toBeInTheDocument();
  });

  it('adds a label mapping row when add button is clicked', () => {
    render(<MetricSchemaConfigEditor {...defaultProps} />);

    fireEvent.click(screen.getByText('+ Add label mapping'));

    expect(screen.getByLabelText('Label name 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Label target field 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Remove label mapping 1')).toBeInTheDocument();
  });

  it('removes a metric mapping row when remove button is clicked', () => {
    render(<MetricSchemaConfigEditor {...defaultProps} />);

    fireEvent.click(screen.getByText('+ Add metric mapping'));
    expect(screen.getByLabelText('Metric name 1')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Remove metric mapping 1'));
    expect(screen.queryByLabelText('Metric name 1')).not.toBeInTheDocument();
  });

  it('removes a label mapping row when remove button is clicked', () => {
    render(<MetricSchemaConfigEditor {...defaultProps} />);

    fireEvent.click(screen.getByText('+ Add label mapping'));
    expect(screen.getByLabelText('Label name 1')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Remove label mapping 1'));
    expect(screen.queryByLabelText('Label name 1')).not.toBeInTheDocument();
  });

  it('emits config when metric key is filled in', () => {
    const onChange = jest.fn();
    render(<MetricSchemaConfigEditor {...defaultProps} onChange={onChange} />);

    fireEvent.click(screen.getByText('+ Add metric mapping'));
    fireEvent.change(screen.getByLabelText('Metric name 1'), {
      target: { value: 'my_status' },
    });

    expect(onChange).toHaveBeenCalledWith({
      metrics: { my_status: 'state' },
      labels: {},
      latency_unit: 'ms',
    });
  });

  it('emits config when label key is filled in', () => {
    const onChange = jest.fn();
    render(<MetricSchemaConfigEditor {...defaultProps} onChange={onChange} />);

    fireEvent.click(screen.getByText('+ Add label mapping'));
    fireEvent.change(screen.getByLabelText('Label name 1'), {
      target: { value: 'svc_name' },
    });

    expect(onChange).toHaveBeenCalledWith({
      metrics: {},
      labels: { svc_name: 'name' },
      latency_unit: 'ms',
    });
  });

  it('emits null when all mappings are removed and latency is ms', () => {
    const onChange = jest.fn();
    render(<MetricSchemaConfigEditor {...defaultProps} onChange={onChange} />);

    // Add and fill a metric
    fireEvent.click(screen.getByText('+ Add metric mapping'));
    fireEvent.change(screen.getByLabelText('Metric name 1'), {
      target: { value: 'my_status' },
    });

    // Now remove it
    fireEvent.click(screen.getByLabelText('Remove metric mapping 1'));

    // Last call should be null
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1];
    expect(lastCall[0]).toBeNull();
  });

  it('emits config with latency unit when changed to seconds', () => {
    const onChange = jest.fn();
    render(<MetricSchemaConfigEditor {...defaultProps} onChange={onChange} />);

    // Add a metric so config is not null
    fireEvent.click(screen.getByText('+ Add metric mapping'));
    fireEvent.change(screen.getByLabelText('Metric name 1'), {
      target: { value: 'my_latency' },
    });

    // Change to seconds
    fireEvent.click(screen.getByLabelText('Seconds (s)'));

    expect(onChange).toHaveBeenLastCalledWith({
      metrics: { my_latency: 'state' },
      labels: {},
      latency_unit: 's',
    });
  });

  it('does not emit null when latency is seconds even with no mappings', () => {
    const onChange = jest.fn();
    render(<MetricSchemaConfigEditor {...defaultProps} onChange={onChange} />);

    fireEvent.click(screen.getByLabelText('Seconds (s)'));

    // Latency unit is 's' but no mappings, so it should still emit non-null
    // because latency_unit: 's' is a customization
    // Actually per spec: "emit null when no customizations" — latency 's' counts as customization
    // But isConfigEmpty checks latencyUnit === 'ms' — so if 's', config is NOT empty
    // Wait, isConfigEmpty returns true only when no metrics, no labels, AND latency === 'ms'
    // Since latency is 's', isConfigEmpty returns false, so it emits config
    expect(onChange).toHaveBeenCalledWith({
      metrics: {},
      labels: {},
      latency_unit: 's',
    });
  });

  it('changes metric target field via select', () => {
    const onChange = jest.fn();
    render(<MetricSchemaConfigEditor {...defaultProps} onChange={onChange} />);

    fireEvent.click(screen.getByText('+ Add metric mapping'));
    fireEvent.change(screen.getByLabelText('Metric name 1'), {
      target: { value: 'my_latency' },
    });
    fireEvent.change(screen.getByLabelText('Metric target field 1'), {
      target: { value: 'latency' },
    });

    expect(onChange).toHaveBeenLastCalledWith({
      metrics: { my_latency: 'latency' },
      labels: {},
      latency_unit: 'ms',
    });
  });

  it('changes label target field via select', () => {
    const onChange = jest.fn();
    render(<MetricSchemaConfigEditor {...defaultProps} onChange={onChange} />);

    fireEvent.click(screen.getByText('+ Add label mapping'));
    fireEvent.change(screen.getByLabelText('Label name 1'), {
      target: { value: 'svc_type' },
    });
    fireEvent.change(screen.getByLabelText('Label target field 1'), {
      target: { value: 'type' },
    });

    expect(onChange).toHaveBeenLastCalledWith({
      metrics: {},
      labels: { svc_type: 'type' },
      latency_unit: 'ms',
    });
  });

  it('renders with existing config value', () => {
    const existingConfig: MetricSchemaConfig = {
      metrics: { custom_status: 'state', custom_latency: 'latency' },
      labels: { svc_name: 'name' },
      latency_unit: 's',
    };

    render(
      <MetricSchemaConfigEditor {...defaultProps} value={existingConfig} />,
    );

    // Should show pre-populated rows
    expect(screen.getByLabelText('Metric name 1')).toHaveValue('custom_status');
    expect(screen.getByLabelText('Metric target field 1')).toHaveValue('state');
    expect(screen.getByLabelText('Metric name 2')).toHaveValue('custom_latency');
    expect(screen.getByLabelText('Metric target field 2')).toHaveValue('latency');
    expect(screen.getByLabelText('Label name 1')).toHaveValue('svc_name');
    expect(screen.getByLabelText('Label target field 1')).toHaveValue('name');

    // Latency unit should be seconds
    expect(screen.getByLabelText('Seconds (s)')).toBeChecked();
  });

  it('disables all inputs when disabled prop is true', () => {
    const existingConfig: MetricSchemaConfig = {
      metrics: { custom_status: 'state' },
      labels: {},
      latency_unit: 'ms',
    };

    render(
      <MetricSchemaConfigEditor
        {...defaultProps}
        value={existingConfig}
        disabled={true}
      />,
    );

    expect(screen.getByLabelText('Metric name 1')).toBeDisabled();
    expect(screen.getByLabelText('Metric target field 1')).toBeDisabled();
    expect(screen.getByLabelText('Remove metric mapping 1')).toBeDisabled();
    expect(screen.getByText('+ Add metric mapping')).toBeDisabled();
    expect(screen.getByText('+ Add label mapping')).toBeDisabled();
    expect(screen.getByLabelText('Milliseconds (ms)')).toBeDisabled();
    expect(screen.getByLabelText('Seconds (s)')).toBeDisabled();
  });

  it('defaults latency unit to ms', () => {
    render(<MetricSchemaConfigEditor {...defaultProps} />);

    expect(screen.getByLabelText('Milliseconds (ms)')).toBeChecked();
    expect(screen.getByLabelText('Seconds (s)')).not.toBeChecked();
  });

  it('supports multiple metric rows', () => {
    const onChange = jest.fn();
    render(<MetricSchemaConfigEditor {...defaultProps} onChange={onChange} />);

    fireEvent.click(screen.getByText('+ Add metric mapping'));
    fireEvent.click(screen.getByText('+ Add metric mapping'));

    expect(screen.getByLabelText('Metric name 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Metric name 2')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Metric name 1'), {
      target: { value: 'metric_a' },
    });
    fireEvent.change(screen.getByLabelText('Metric target field 1'), {
      target: { value: 'healthy' },
    });
    fireEvent.change(screen.getByLabelText('Metric name 2'), {
      target: { value: 'metric_b' },
    });
    fireEvent.change(screen.getByLabelText('Metric target field 2'), {
      target: { value: 'code' },
    });

    expect(onChange).toHaveBeenLastCalledWith({
      metrics: { metric_a: 'healthy', metric_b: 'code' },
      labels: {},
      latency_unit: 'ms',
    });
  });

  it('ignores rows with empty keys in emitted config', () => {
    const onChange = jest.fn();
    render(<MetricSchemaConfigEditor {...defaultProps} onChange={onChange} />);

    fireEvent.click(screen.getByText('+ Add metric mapping'));
    fireEvent.click(screen.getByText('+ Add metric mapping'));

    // Only fill the second row
    fireEvent.change(screen.getByLabelText('Metric name 2'), {
      target: { value: 'valid_metric' },
    });

    expect(onChange).toHaveBeenLastCalledWith({
      metrics: { valid_metric: 'state' },
      labels: {},
      latency_unit: 'ms',
    });
  });
});
