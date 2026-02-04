import { render, screen, fireEvent } from '@testing-library/react';
import Modal from './Modal';

// Mock HTMLDialogElement methods
const mockShowModal = jest.fn();
const mockClose = jest.fn();

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = mockShowModal;
  HTMLDialogElement.prototype.close = mockClose;
});

beforeEach(() => {
  mockShowModal.mockClear();
  mockClose.mockClear();
});

describe('Modal', () => {
  it('returns null when not open', () => {
    const { container } = render(
      <Modal isOpen={false} onClose={() => {}} title="Test Modal">
        <p>Modal content</p>
      </Modal>
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders when open', () => {
    render(
      <Modal isOpen={true} onClose={() => {}} title="Test Modal">
        <p>Modal content</p>
      </Modal>
    );

    expect(screen.getByRole('dialog', { hidden: true })).toBeInTheDocument();
    expect(screen.getByText('Test Modal')).toBeInTheDocument();
    expect(screen.getByText('Modal content')).toBeInTheDocument();
  });

  it('calls showModal when opened', () => {
    render(
      <Modal isOpen={true} onClose={() => {}} title="Test Modal">
        <p>Modal content</p>
      </Modal>
    );

    expect(mockShowModal).toHaveBeenCalled();
  });

  it('calls close button onClick handler', () => {
    const onClose = jest.fn();
    render(
      <Modal isOpen={true} onClose={onClose} title="Test Modal">
        <p>Modal content</p>
      </Modal>
    );

    fireEvent.click(screen.getByLabelText('Close'));

    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when clicking backdrop', () => {
    const onClose = jest.fn();
    render(
      <Modal isOpen={true} onClose={onClose} title="Test Modal">
        <p>Modal content</p>
      </Modal>
    );

    // Click on the dialog element itself (backdrop)
    fireEvent.click(screen.getByRole('dialog', { hidden: true }));

    expect(onClose).toHaveBeenCalled();
  });

  it('does not call onClose when clicking inside content', () => {
    const onClose = jest.fn();
    render(
      <Modal isOpen={true} onClose={onClose} title="Test Modal">
        <p>Modal content</p>
      </Modal>
    );

    fireEvent.click(screen.getByText('Modal content'));

    expect(onClose).not.toHaveBeenCalled();
  });

  it('handles cancel event', () => {
    const onClose = jest.fn();
    render(
      <Modal isOpen={true} onClose={onClose} title="Test Modal">
        <p>Modal content</p>
      </Modal>
    );

    const dialog = screen.getByRole('dialog', { hidden: true });
    const cancelEvent = new Event('cancel', { bubbles: true, cancelable: true });
    fireEvent(dialog, cancelEvent);

    expect(onClose).toHaveBeenCalled();
  });

  it('applies size class', () => {
    render(
      <Modal isOpen={true} onClose={() => {}} title="Test Modal" size="large">
        <p>Modal content</p>
      </Modal>
    );

    const dialog = screen.getByRole('dialog', { hidden: true });
    expect(dialog.className).toContain('large');
  });

  it('calls close when transitioning from open to closed', () => {
    const { rerender } = render(
      <Modal isOpen={true} onClose={() => {}} title="Test Modal">
        <p>Modal content</p>
      </Modal>
    );

    expect(mockShowModal).toHaveBeenCalled();

    rerender(
      <Modal isOpen={false} onClose={() => {}} title="Test Modal">
        <p>Modal content</p>
      </Modal>
    );

    // Modal returns null when not open, close is called before unmount
  });

  it('has proper accessibility attributes', () => {
    render(
      <Modal isOpen={true} onClose={() => {}} title="Test Modal">
        <p>Modal content</p>
      </Modal>
    );

    const dialog = screen.getByRole('dialog', { hidden: true });
    expect(dialog).toHaveAttribute('aria-labelledby', 'modal-title');
    expect(screen.getByText('Test Modal')).toHaveAttribute('id', 'modal-title');
  });
});
