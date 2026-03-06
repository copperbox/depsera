import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Tabs, TabList, Tab, TabPanel } from './Tabs';

function renderTabs(
  initialEntries = ['/'],
  props: { defaultTab?: string; storageKey?: string; urlParam?: string } = {}
) {
  const { defaultTab = 'one', storageKey, urlParam } = props;
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Tabs defaultTab={defaultTab} storageKey={storageKey} urlParam={urlParam}>
        <TabList aria-label="Test tabs">
          <Tab value="one">Tab One</Tab>
          <Tab value="two">Tab Two</Tab>
          <Tab value="three">Tab Three</Tab>
        </TabList>
        <TabPanel value="one">Content One</TabPanel>
        <TabPanel value="two">Content Two</TabPanel>
        <TabPanel value="three">Content Three</TabPanel>
      </Tabs>
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe('Tabs', () => {
  it('renders all tab buttons', () => {
    renderTabs();

    expect(screen.getByRole('tab', { name: 'Tab One' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Tab Two' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Tab Three' })).toBeInTheDocument();
  });

  it('shows default tab content', () => {
    renderTabs();

    expect(screen.getByText('Content One')).toBeInTheDocument();
    expect(screen.queryByText('Content Two')).not.toBeInTheDocument();
  });

  it('switches tab on click', () => {
    renderTabs();

    fireEvent.click(screen.getByRole('tab', { name: 'Tab Two' }));

    expect(screen.queryByText('Content One')).not.toBeInTheDocument();
    expect(screen.getByText('Content Two')).toBeInTheDocument();
  });

  it('sets aria-selected on active tab', () => {
    renderTabs();

    expect(screen.getByRole('tab', { name: 'Tab One' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByRole('tab', { name: 'Tab Two' })).toHaveAttribute(
      'aria-selected',
      'false'
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Tab Two' }));

    expect(screen.getByRole('tab', { name: 'Tab One' })).toHaveAttribute(
      'aria-selected',
      'false'
    );
    expect(screen.getByRole('tab', { name: 'Tab Two' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('renders tabpanel with correct ARIA attributes', () => {
    renderTabs();

    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveAttribute('id', 'tabpanel-one');
    expect(panel).toHaveAttribute('aria-labelledby', 'tab-one');
  });

  it('renders tablist with aria-label', () => {
    renderTabs();

    expect(screen.getByRole('tablist')).toHaveAttribute(
      'aria-label',
      'Test tabs'
    );
  });

  it('reads initial tab from URL search params', () => {
    renderTabs(['/?tab=two']);

    expect(screen.queryByText('Content One')).not.toBeInTheDocument();
    expect(screen.getByText('Content Two')).toBeInTheDocument();
  });

  it('reads initial tab from custom URL param', () => {
    renderTabs(['/?section=three'], { defaultTab: 'one', urlParam: 'section' });

    expect(screen.getByText('Content Three')).toBeInTheDocument();
  });

  it('persists tab to localStorage when storageKey is provided', () => {
    renderTabs(undefined, { storageKey: 'test-tab' });

    fireEvent.click(screen.getByRole('tab', { name: 'Tab Two' }));

    expect(localStorage.getItem('test-tab')).toBe('two');
  });

  it('reads initial tab from localStorage when URL has no param', () => {
    localStorage.setItem('test-tab', 'three');
    renderTabs(['/'], { storageKey: 'test-tab' });

    expect(screen.getByText('Content Three')).toBeInTheDocument();
  });

  it('URL param takes precedence over localStorage', () => {
    localStorage.setItem('test-tab', 'three');
    renderTabs(['/?tab=two'], { storageKey: 'test-tab' });

    expect(screen.getByText('Content Two')).toBeInTheDocument();
  });

  it('applies active CSS class to active tab', () => {
    renderTabs();

    const activeTab = screen.getByRole('tab', { name: 'Tab One' });
    const inactiveTab = screen.getByRole('tab', { name: 'Tab Two' });

    expect(activeTab.className).toContain('tabActive');
    expect(inactiveTab.className).not.toContain('tabActive');
  });

  it('sets tabIndex 0 on active tab and -1 on inactive', () => {
    renderTabs();

    expect(screen.getByRole('tab', { name: 'Tab One' })).toHaveAttribute(
      'tabindex',
      '0'
    );
    expect(screen.getByRole('tab', { name: 'Tab Two' })).toHaveAttribute(
      'tabindex',
      '-1'
    );
  });
});
