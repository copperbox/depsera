import { Router } from 'express';
import { requireTeamAccess, requireTeamLead } from '../../auth';
import { listAlertChannels } from './channels/list';
import { createAlertChannel } from './channels/create';
import { updateAlertChannel } from './channels/update';
import { deleteAlertChannel } from './channels/delete';
import { testAlertChannel } from './channels/test';
import { getAlertRules } from './rules/get';
import { updateAlertRules } from './rules/update';
import { listAlertHistory } from './history/list';

const router = Router();

// Alert channel management - team-scoped
router.get('/:id/alert-channels', requireTeamAccess, listAlertChannels);
router.post('/:id/alert-channels', requireTeamLead, createAlertChannel);
router.put('/:id/alert-channels/:channelId', requireTeamLead, updateAlertChannel);
router.delete('/:id/alert-channels/:channelId', requireTeamLead, deleteAlertChannel);
router.post('/:id/alert-channels/:channelId/test', requireTeamLead, testAlertChannel);

// Alert rules - team-scoped
router.get('/:id/alert-rules', requireTeamAccess, getAlertRules);
router.put('/:id/alert-rules', requireTeamLead, updateAlertRules);

// Alert history - team-scoped
router.get('/:id/alert-history', requireTeamAccess, listAlertHistory);

export default router;
