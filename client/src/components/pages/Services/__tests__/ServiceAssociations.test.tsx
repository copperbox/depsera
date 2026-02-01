import { render, screen, fireEvent, waitFor } from '@testing-library/react';

jest.mock('../../../../api/associations');
jest.mock('../../../../api/services');
jest.mock('../../../common/Modal', () => ({
  __esModule: true,
  default: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
    isOpen ? <div data-testid="modal">{children}</div> : null,
}));
jest.mock('../../Associations/AssociationForm', () => ({
  __esModule: true,
  default: () => <div data-testid="association-form" />,
}));

import {
  fetchAssociations,
  fetchSuggestions,
  generateServiceSuggestions,
} from '../../../../api/associations';
import ServiceAssociations from '../ServiceAssociations';
import type { Dependency } from '../../../../types/service';

const mockFetchAssociations = fetchAssociations as jest.MockedFunction<typeof fetchAssociations>;
const mockFetchSuggestions = fetchSuggestions as jest.MockedFunction<typeof fetchSuggestions>;
const mockGenerate = generateServiceSuggestions as jest.MockedFunction<typeof generateServiceSuggestions>;

const deps: Dependency[] = [
  {
    id: 'dep-1',
    service_id: 'svc-1',
    name: 'Database',
    canonical_name: null,
    description: null,
    impact: null,
    healthy: 1,
    health_state: 0,
    health_code: null,
    latency_ms: null,
    last_checked: null,
    last_status_change: null,
    created_at: '',
    updated_at: '',
  },
];

beforeEach(() => {
  mockFetchAssociations.mockReset();
  mockFetchSuggestions.mockReset();
  mockGenerate.mockReset();
  mockFetchSuggestions.mockResolvedValue([]);
  mockFetchAssociations.mockResolvedValue([]);
});

describe('ServiceAssociations', () => {
  it('renders section header and generate button', async () => {
    render(<ServiceAssociations serviceId="svc-1" dependencies={deps} />);
    await waitFor(() => expect(screen.getByText('Associations')).toBeInTheDocument());
    expect(screen.getByText('Generate Suggestions')).toBeInTheDocument();
  });

  it('renders dependency list items', async () => {
    render(<ServiceAssociations serviceId="svc-1" dependencies={deps} />);
    await waitFor(() => expect(screen.getByText('Database')).toBeInTheDocument());
  });

  it('calls generate suggestions on button click', async () => {
    mockGenerate.mockResolvedValue([]);
    render(<ServiceAssociations serviceId="svc-1" dependencies={deps} />);

    await waitFor(() => expect(screen.getByText('Generate Suggestions')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Generate Suggestions'));

    await waitFor(() => expect(mockGenerate).toHaveBeenCalledWith('svc-1'));
  });

  it('opens add association modal', async () => {
    render(<ServiceAssociations serviceId="svc-1" dependencies={deps} />);
    await waitFor(() => expect(screen.getByText('+ Add')).toBeInTheDocument());
    fireEvent.click(screen.getByText('+ Add'));
    expect(screen.getByTestId('modal')).toBeInTheDocument();
    expect(screen.getByTestId('association-form')).toBeInTheDocument();
  });

  it('toggles view associations', async () => {
    mockFetchAssociations.mockResolvedValue([]);
    render(<ServiceAssociations serviceId="svc-1" dependencies={deps} />);
    await waitFor(() => expect(screen.getByText('View Associations')).toBeInTheDocument());
    fireEvent.click(screen.getByText('View Associations'));
    await waitFor(() =>
      expect(screen.getByText('No associations for this dependency.')).toBeInTheDocument(),
    );
  });
});
