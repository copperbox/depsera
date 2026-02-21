import { AlertRule, CreateAlertRuleInput, UpdateAlertRuleInput } from '../../db/types';

export interface IAlertRuleStore {
  findById(id: string): AlertRule | undefined;
  findByTeamId(teamId: string): AlertRule[];
  findActiveByTeamId(teamId: string): AlertRule[];
  create(input: CreateAlertRuleInput): AlertRule;
  update(id: string, input: UpdateAlertRuleInput): AlertRule | undefined;
  delete(id: string): boolean;
}
