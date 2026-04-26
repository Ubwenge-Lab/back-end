// backend/src/common/constants/staff-permission.enum.ts

export enum StaffPermission {
  // Order Management
  VIEW_ORDERS = 'VIEW_ORDERS',
  ACCEPT_ORDERS = 'ACCEPT_ORDERS',
  UPDATE_ORDER_STATUS = 'UPDATE_ORDER_STATUS',
  CANCEL_ORDERS = 'CANCEL_ORDERS',

  // Inventory Management
  VIEW_INVENTORY = 'VIEW_INVENTORY',
  ADD_MEDICATION = 'ADD_MEDICATION',
  EDIT_MEDICATION = 'EDIT_MEDICATION',
  DELETE_MEDICATION = 'DELETE_MEDICATION',
  MANAGE_STOCK_TRANSFERS = 'MANAGE_STOCK_TRANSFERS',

  // Payment Management
  VIEW_PAYMENTS = 'VIEW_PAYMENTS',
  PROCESS_PAYMENTS = 'PROCESS_PAYMENTS',
  ISSUE_REFUNDS = 'ISSUE_REFUNDS',

  // Prescription Management
  VIEW_PRESCRIPTIONS = 'VIEW_PRESCRIPTIONS',
  APPROVE_PRESCRIPTIONS = 'APPROVE_PRESCRIPTIONS',
  REJECT_PRESCRIPTIONS = 'REJECT_PRESCRIPTIONS',

  // Analytics & Reports
  VIEW_ANALYTICS = 'VIEW_ANALYTICS',
  VIEW_REPORTS = 'VIEW_REPORTS',
  EXPORT_DATA = 'EXPORT_DATA',

  // Customer Management
  VIEW_CUSTOMERS = 'VIEW_CUSTOMERS',
  MANAGE_CUSTOMER_INFO = 'MANAGE_CUSTOMER_INFO',

  // Staff Management (for senior staff)
  VIEW_STAFF = 'VIEW_STAFF',
  MANAGE_STAFF = 'MANAGE_STAFF',

  // Settings
  MANAGE_BRANCH_SETTINGS = 'MANAGE_BRANCH_SETTINGS',
}

// Default permission sets for different roles
export const DEFAULT_PERMISSIONS = {
  PHARMACIST: [
    StaffPermission.VIEW_ORDERS,
    StaffPermission.ACCEPT_ORDERS,
    StaffPermission.UPDATE_ORDER_STATUS,
    StaffPermission.VIEW_INVENTORY,
    StaffPermission.ADD_MEDICATION,
    StaffPermission.EDIT_MEDICATION,
    StaffPermission.VIEW_PRESCRIPTIONS,
    StaffPermission.APPROVE_PRESCRIPTIONS,
    StaffPermission.REJECT_PRESCRIPTIONS,
    StaffPermission.VIEW_CUSTOMERS,
    StaffPermission.VIEW_ANALYTICS,
  ],
  CASHIER: [
    StaffPermission.VIEW_ORDERS,
    StaffPermission.VIEW_INVENTORY,
    StaffPermission.VIEW_PAYMENTS,
    StaffPermission.PROCESS_PAYMENTS,
    StaffPermission.VIEW_CUSTOMERS,
  ],
  NURSE: [
    StaffPermission.VIEW_ORDERS,
    StaffPermission.VIEW_INVENTORY,
    StaffPermission.VIEW_PRESCRIPTIONS,
    StaffPermission.VIEW_CUSTOMERS,
    StaffPermission.MANAGE_CUSTOMER_INFO,
  ],
};
