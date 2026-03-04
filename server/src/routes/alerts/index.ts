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
import { listAlertMutes } from './mutes/list';
import { createAlertMute } from './mutes/create';
import { deleteAlertMute } from './mutes/delete';

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

// Alert mutes - team-scoped
router.get('/:id/alert-mutes', requireTeamAccess, listAlertMutes);
router.post('/:id/alert-mutes', requireTeamLead, createAlertMute);
router.delete('/:id/alert-mutes/:muteId', requireTeamLead, deleteAlertMute);

export default router;
