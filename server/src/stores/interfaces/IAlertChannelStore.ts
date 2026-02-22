import { AlertChannel, CreateAlertChannelInput, UpdateAlertChannelInput } from '../../db/types';

export interface IAlertChannelStore {
  findById(id: string): AlertChannel | undefined;
  findByTeamId(teamId: string): AlertChannel[];
  findActiveByTeamId(teamId: string): AlertChannel[];
  create(input: CreateAlertChannelInput): AlertChannel;
  update(id: string, input: UpdateAlertChannelInput): AlertChannel | undefined;
  delete(id: string): boolean;
}
