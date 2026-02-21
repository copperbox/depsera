import { useState, useEffect, FormEvent } from 'react';
import { useAlertChannels } from '../../../hooks/useAlertChannels';
import ConfirmDialog from '../../common/ConfirmDialog';
import type {
  AlertChannel,
  AlertChannelType,
  SlackConfig,
  WebhookConfig,
  CreateAlertChannelInput,
} from '../../../types/alert';
import styles from './Teams.module.css';
import alertStyles from './AlertChannels.module.css';

interface AlertChannelsProps {
  teamId: string;
  canManage: boolean;
}

interface HeaderEntry {
  key: string;
  value: string;
}

function parseConfig(channel: AlertChannel): SlackConfig | WebhookConfig {
  try {
    return JSON.parse(channel.config);
  } catch {
    return channel.channel_type === 'slack'
      ? { webhook_url: '' }
      : { url: '' };
  }
}

function getChannelDisplayUrl(channel: AlertChannel): string {
  const config = parseConfig(channel);
  const url = 'webhook_url' in config ? config.webhook_url : config.url;
  if (url.length > 50) {
    return url.substring(0, 47) + '...';
  }
  return url;
}

function AlertChannels({ teamId, canManage }: AlertChannelsProps) {
  const {
    channels,
    isLoading,
    error,
    actionInProgress,
    testResult,
    loadChannels,
    handleCreate,
    handleUpdate,
    handleDelete,
    handleToggleActive,
    handleTest,
    clearTestResult,
    clearError,
  } = useAlertChannels(teamId);

  const [showForm, setShowForm] = useState(false);
  const [editingChannel, setEditingChannel] = useState<AlertChannel | null>(null);
  const [deleteChannelId, setDeleteChannelId] = useState<string | null>(null);

  // Form state
  const [channelType, setChannelType] = useState<AlertChannelType>('slack');
  const [slackWebhookUrl, setSlackWebhookUrl] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookMethod, setWebhookMethod] = useState('POST');
  const [webhookHeaders, setWebhookHeaders] = useState<HeaderEntry[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  const resetForm = () => {
    setChannelType('slack');
    setSlackWebhookUrl('');
    setWebhookUrl('');
    setWebhookMethod('POST');
    setWebhookHeaders([]);
    setFormError(null);
    setEditingChannel(null);
    setShowForm(false);
  };

  const openCreateForm = () => {
    resetForm();
    setShowForm(true);
  };

  const openEditForm = (channel: AlertChannel) => {
    setFormError(null);
    clearError();
    setChannelType(channel.channel_type);
    const config = parseConfig(channel);

    if (channel.channel_type === 'slack') {
      const slackConfig = config as SlackConfig;
      setSlackWebhookUrl(slackConfig.webhook_url);
      setWebhookUrl('');
      setWebhookMethod('POST');
      setWebhookHeaders([]);
    } else {
      const webhookConfig = config as WebhookConfig;
      setSlackWebhookUrl('');
      setWebhookUrl(webhookConfig.url);
      setWebhookMethod(webhookConfig.method || 'POST');
      setWebhookHeaders(
        webhookConfig.headers
          ? Object.entries(webhookConfig.headers).map(([key, value]) => ({ key, value }))
          : []
      );
    }

    setEditingChannel(channel);
    setShowForm(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (channelType === 'slack') {
      if (!slackWebhookUrl.trim()) {
        setFormError('Webhook URL is required');
        return;
      }
      if (!slackWebhookUrl.startsWith('https://hooks.slack.com/services/')) {
        setFormError('Must be a valid Slack webhook URL (https://hooks.slack.com/services/...)');
        return;
      }
    } else {
      if (!webhookUrl.trim()) {
        setFormError('Webhook URL is required');
        return;
      }
      try {
        new URL(webhookUrl);
      } catch {
        setFormError('Must be a valid URL');
        return;
      }
    }

    const config =
      channelType === 'slack'
        ? { webhook_url: slackWebhookUrl.trim() }
        : {
            url: webhookUrl.trim(),
            method: webhookMethod,
            ...(webhookHeaders.length > 0 && {
              headers: Object.fromEntries(
                webhookHeaders
                  .filter((h) => h.key.trim())
                  .map((h) => [h.key.trim(), h.value])
              ),
            }),
          };

    if (editingChannel) {
      const success = await handleUpdate(editingChannel.id, {
        channel_type: channelType,
        config,
      });
      if (success) resetForm();
    } else {
      const success = await handleCreate({
        channel_type: channelType,
        config,
      });
      if (success) resetForm();
    }
  };

  const handleAddHeader = () => {
    setWebhookHeaders([...webhookHeaders, { key: '', value: '' }]);
  };

  const handleUpdateHeader = (index: number, field: 'key' | 'value', value: string) => {
    const updated = [...webhookHeaders];
    updated[index] = { ...updated[index], [field]: value };
    setWebhookHeaders(updated);
  };

  const handleRemoveHeader = (index: number) => {
    setWebhookHeaders(webhookHeaders.filter((_, i) => i !== index));
  };

  const handleDeleteConfirm = async () => {
    if (deleteChannelId) {
      await handleDelete(deleteChannelId);
      setDeleteChannelId(null);
    }
  };

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Alert Channels</h2>
        <div className={alertStyles.sectionActions}>
          <span className={styles.sectionSubtitle}>
            {channels.length} {channels.length === 1 ? 'channel' : 'channels'}
          </span>
          {canManage && !showForm && (
            <button onClick={openCreateForm} className={alertStyles.addChannelButton}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3v10M3 8h10" />
              </svg>
              Add Channel
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className={styles.error} style={{ marginBottom: '1rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem' }}>
          {error}
          <button onClick={clearError} className={alertStyles.dismissButton} aria-label="Dismiss error">
            &times;
          </button>
        </div>
      )}

      {testResult && (
        <div
          className={testResult.success ? alertStyles.testSuccess : alertStyles.testFailure}
          style={{ marginBottom: '1rem' }}
        >
          {testResult.success ? 'Test alert sent successfully!' : `Test failed: ${testResult.error}`}
          <button onClick={clearTestResult} className={alertStyles.dismissButton} aria-label="Dismiss test result">
            &times;
          </button>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className={alertStyles.channelForm}>
          <h3 className={alertStyles.formTitle}>
            {editingChannel ? 'Edit Channel' : 'Add Alert Channel'}
          </h3>

          <div className={alertStyles.formField}>
            <label className={alertStyles.formLabel}>Channel Type</label>
            <select
              value={channelType}
              onChange={(e) => setChannelType(e.target.value as AlertChannelType)}
              className={alertStyles.formSelect}
              disabled={actionInProgress !== null}
            >
              <option value="slack">Slack</option>
              <option value="webhook">Webhook</option>
            </select>
          </div>

          {channelType === 'slack' ? (
            <div className={alertStyles.formField}>
              <label className={alertStyles.formLabel}>Slack Webhook URL</label>
              <input
                type="url"
                value={slackWebhookUrl}
                onChange={(e) => setSlackWebhookUrl(e.target.value)}
                placeholder="https://hooks.slack.com/services/T00/B00/xxx"
                className={alertStyles.formInput}
                disabled={actionInProgress !== null}
              />
            </div>
          ) : (
            <>
              <div className={alertStyles.formField}>
                <label className={alertStyles.formLabel}>Webhook URL</label>
                <input
                  type="url"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://example.com/webhook"
                  className={alertStyles.formInput}
                  disabled={actionInProgress !== null}
                />
              </div>

              <div className={alertStyles.formField}>
                <label className={alertStyles.formLabel}>HTTP Method</label>
                <select
                  value={webhookMethod}
                  onChange={(e) => setWebhookMethod(e.target.value)}
                  className={alertStyles.formSelect}
                  disabled={actionInProgress !== null}
                >
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="PATCH">PATCH</option>
                </select>
              </div>

              <div className={alertStyles.formField}>
                <label className={alertStyles.formLabel}>
                  Custom Headers
                  <button
                    type="button"
                    onClick={handleAddHeader}
                    className={alertStyles.addHeaderButton}
                    disabled={actionInProgress !== null}
                  >
                    + Add Header
                  </button>
                </label>
                {webhookHeaders.map((header, index) => (
                  <div key={index} className={alertStyles.headerRow}>
                    <input
                      type="text"
                      value={header.key}
                      onChange={(e) => handleUpdateHeader(index, 'key', e.target.value)}
                      placeholder="Header name"
                      className={alertStyles.headerInput}
                      disabled={actionInProgress !== null}
                    />
                    <input
                      type="text"
                      value={header.value}
                      onChange={(e) => handleUpdateHeader(index, 'value', e.target.value)}
                      placeholder="Header value"
                      className={alertStyles.headerInput}
                      disabled={actionInProgress !== null}
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveHeader(index)}
                      className={alertStyles.removeHeaderButton}
                      disabled={actionInProgress !== null}
                      aria-label="Remove header"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {formError && (
            <div className={alertStyles.formError}>{formError}</div>
          )}

          <div className={alertStyles.formActions}>
            <button
              type="button"
              onClick={resetForm}
              className={alertStyles.cancelButton}
              disabled={actionInProgress !== null}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={alertStyles.submitButton}
              disabled={actionInProgress !== null}
            >
              {actionInProgress ? 'Saving...' : editingChannel ? 'Save Changes' : 'Create Channel'}
            </button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className={styles.loading} style={{ padding: '2rem' }}>
          <div className={styles.spinner} />
          <span>Loading channels...</span>
        </div>
      ) : channels.length === 0 ? (
        <div className={styles.noItems}>
          <p>No alert channels configured.</p>
          {canManage && <p style={{ fontSize: '0.8125rem' }}>Add a channel to receive alerts when service health changes.</p>}
        </div>
      ) : (
        <div className={alertStyles.channelList}>
          {channels.map((channel) => (
            <div key={channel.id} className={alertStyles.channelItem}>
              <div className={alertStyles.channelInfo}>
                <div className={alertStyles.channelTypeIcon}>
                  {channel.channel_type === 'slack' ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm6.313 6.852a2.528 2.528 0 0 1 2.521-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.332 2.521h-2.521v-2.52l-.001-.001zm-1.27 0a2.528 2.528 0 0 1-2.522 2.521 2.527 2.527 0 0 1-2.521-2.521V6.313A2.527 2.527 0 0 1 11.355 3.79a2.528 2.528 0 0 1 2.522 2.523v6.852zm-2.522 5.793a2.528 2.528 0 0 1 2.522 2.522A2.528 2.528 0 0 1 11.355 24a2.527 2.527 0 0 1-2.521-2.522v-2.522h2.521v.001zm0-1.27a2.527 2.527 0 0 1-2.521-2.522 2.528 2.528 0 0 1 2.521-2.522h6.313A2.528 2.528 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.521h-6.312z" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M14 6l-3.5-4.5L7 5M2 10l3.5 4.5L9 11" />
                      <circle cx="4" cy="8" r="2" />
                      <circle cx="12" cy="8" r="2" />
                    </svg>
                  )}
                </div>
                <div className={alertStyles.channelDetails}>
                  <span className={alertStyles.channelTypeName}>
                    {channel.channel_type === 'slack' ? 'Slack' : 'Webhook'}
                  </span>
                  <span className={alertStyles.channelUrl}>
                    {getChannelDisplayUrl(channel)}
                  </span>
                </div>
                <span
                  className={`${alertStyles.statusBadge} ${
                    channel.is_active ? alertStyles.statusActive : alertStyles.statusInactive
                  }`}
                >
                  {channel.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>

              {canManage && (
                <div className={alertStyles.channelActions}>
                  <button
                    onClick={() => handleTest(channel.id)}
                    disabled={actionInProgress !== null}
                    className={alertStyles.testButton}
                    title="Send test alert"
                  >
                    {actionInProgress === `test-${channel.id}` ? 'Testing...' : 'Test'}
                  </button>
                  <button
                    onClick={() => handleToggleActive(channel)}
                    disabled={actionInProgress !== null}
                    className={`${styles.smallButton} ${styles.roleButton}`}
                  >
                    {channel.is_active ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    onClick={() => openEditForm(channel)}
                    disabled={actionInProgress !== null}
                    className={`${styles.smallButton} ${styles.roleButton}`}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setDeleteChannelId(channel.id)}
                    disabled={actionInProgress !== null}
                    className={`${styles.smallButton} ${styles.removeButton}`}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        isOpen={deleteChannelId !== null}
        onClose={() => setDeleteChannelId(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Alert Channel"
        message="Are you sure you want to delete this alert channel? Alerts will no longer be sent to this destination."
        confirmLabel="Delete"
        isDestructive
        isLoading={actionInProgress !== null}
      />
    </div>
  );
}

export default AlertChannels;
