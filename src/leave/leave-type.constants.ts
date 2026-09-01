// backend/src/leave/leave-type.constants.ts
//
// Leave categories recognised under Rwanda's labour law:
// Law N° 66/2018 of 30/08/2018 regulating labour in Rwanda, articles 41-52.
// These defaults are starting points; pharmacy owners and branch managers
// can override the allocated number of days per employee via LeaveBalance.

import { LeaveType } from '@prisma/client';

export interface LeaveTypeInfo {
  type: LeaveType;
  label: string;
  labelFr: string;
  description: string;
  /** Default statutory allocation, in working days per year unless noted. */
  defaultDays: number;
  /** Whether this leave is paid by default under the law. */
  paid: boolean;
  /** Whether employees can request this leave type through the portal. */
  requestable: boolean;
  legalReference: string;
}

export const LEAVE_TYPES: LeaveTypeInfo[] = [
  {
    type: LeaveType.ANNUAL,
    label: 'Annual Leave',
    labelFr: 'Congé annuel',
    description:
      'Statutory paid annual leave, accrued at 1.5 working days per month worked (18 working days per year).',
    defaultDays: 18,
    paid: true,
    requestable: true,
    legalReference: 'Law N° 66/2018, Art. 42-43',
  },
  {
    type: LeaveType.SICK,
    label: 'Sick Leave',
    labelFr: 'Congé de maladie',
    description:
      'Leave for illness or injury. Requires a medical certificate for absences of more than 2 consecutive days.',
    defaultDays: 15,
    paid: true,
    requestable: true,
    legalReference: 'Law N° 66/2018, Art. 47',
  },
  {
    type: LeaveType.MATERNITY,
    label: 'Maternity Leave',
    labelFr: 'Congé de maternité',
    description:
      '12 consecutive weeks of maternity leave, at least 2 of which must be taken after delivery.',
    defaultDays: 84,
    paid: true,
    requestable: true,
    legalReference: 'Law N° 66/2018, Art. 48',
  },
  {
    type: LeaveType.PATERNITY,
    label: 'Paternity Leave',
    labelFr: 'Congé de paternité',
    description: '4 working days of paternity leave following the birth of a child.',
    defaultDays: 4,
    paid: true,
    requestable: true,
    legalReference: 'Law N° 66/2018, Art. 48',
  },
  {
    type: LeaveType.CIRCUMSTANTIAL,
    label: 'Circumstantial / Compassionate Leave',
    labelFr: 'Congé de circonstance',
    description:
      'Special leave for family emergencies, bereavement or other exceptional personal circumstances.',
    defaultDays: 4,
    paid: true,
    requestable: true,
    legalReference: 'Law N° 66/2018, Art. 49',
  },
  {
    type: LeaveType.MARRIAGE,
    label: 'Marriage Leave',
    labelFr: 'Congé de mariage',
    description: "Leave granted for the employee's own marriage.",
    defaultDays: 2,
    paid: true,
    requestable: true,
    legalReference: 'Law N° 66/2018, Art. 49',
  },
  {
    type: LeaveType.UNPAID,
    label: 'Unpaid Leave',
    labelFr: 'Congé sans solde',
    description:
      'Leave without pay, granted at the discretion of the employer once statutory leave is exhausted.',
    defaultDays: 0,
    paid: false,
    requestable: true,
    legalReference: 'Law N° 66/2018, Art. 50',
  },
];

export function getLeaveTypeInfo(type: LeaveType): LeaveTypeInfo {
  const info = LEAVE_TYPES.find((l) => l.type === type);
  if (!info) {
    throw new Error(`Unknown leave type: ${type}`);
  }
  return info;
}
